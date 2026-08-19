
import prismaContent from '@/lib/prisma-content'; // Content DB
import { withDualTransaction } from '@/lib/transaction';
import { syncArticleToGraph, mergeAliasesToCanonical } from '@/lib/graph';
import { generateWikiContent, evaluateWikiContent, ChatHistoryEntry } from '@/lib/gemini';
import logger from "@/lib/logger";

/**
 * 위키 본문에서 첫 번째 ## 섹션(보통 "개요"/"Overview")을 추출해 채팅 미리보기로 사용합니다.
 * 캐시 히트(Gemini 미호출) 경로에서 chat bubble이 빈약해지지 않도록 함.
 */
function extractOverview(content: string): string {
    if (!content) return '';
    const match = content.match(/##\s*[^\n]*\n([\s\S]*?)(?=\n##\s|$)/);
    if (match) return match[1].trim();
    // 헤딩이 없으면 첫 문단
    const firstPara = content.split(/\n\s*\n/)[0];
    return firstPara.trim();
}

/**
 * Fuzzy 후보 중 쿼리와 가장 유사한 항목을 점수화하여 반환. 임계값 미달이면 null.
 * Why: 기존 candidates[0] 무조건 채택은 오결합 위험. 정규화된 prefix 길이 / 길이 차이를 기준.
 */
function pickBestFuzzyMatch<T extends { name: string }>(query: string, candidates: T[]): T | null {
    if (candidates.length === 0) return null;
    const q = query.trim().toLowerCase();
    let best: { item: T; score: number } | null = null;
    for (const item of candidates) {
        const name = item.name.toLowerCase();
        if (name === q) return item; // 완전 일치
        let score = 0;
        if (name.startsWith(q)) score += q.length * 2;
        else if (q.startsWith(name)) score += name.length * 2;
        else if (name.includes(q)) score += q.length;
        else if (q.includes(name)) score += name.length;
        // 길이 차이가 클수록 감점
        score -= Math.abs(name.length - q.length);
        if (!best || score > best.score) best = { item, score };
    }
    // 최소 점수 임계: 쿼리 길이의 절반 이상 매칭되어야 신뢰
    const threshold = Math.max(2, Math.floor(q.length / 2));
    return best && best.score >= threshold ? best.item : null;
}

/**
 * Gemini가 반환한 태그를 정규화하고 중복을 제거합니다.
 */
function normalizeTags(tags: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of tags) {
        if (typeof raw !== 'string') continue;
        const normalized = raw.trim().toLowerCase();
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        result.push(normalized);
    }
    return result;
}

interface CachedKeyword {
    word: string;
    pattern: string;
}

interface KeywordData {
    processedKeywords: CachedKeyword[];
    nameMap: Map<string, string>;
}

class KeywordCache {
    private static data: KeywordData | null = null;
    private static lastUpdate = 0;
    private static TTL = 1000 * 60 * 10; // 10 minutes
    private static pendingPromise: Promise<KeywordData> | null = null;

    private static async refresh(): Promise<KeywordData> {
        if (this.pendingPromise) {
            return this.pendingPromise;
        }

        this.pendingPromise = (async () => {
            try {
                logger.info("[KeywordCache] Refreshing keywords from DB...");
                const [allTopics, allAliases] = await Promise.all([
                    prismaContent.topic.findMany({ select: { name: true } }),
                    prismaContent.alias.findMany({
                        include: { topic: { select: { name: true } } }
                    })
                ]);

                const nameMap = new Map<string, string>();

                const addToMap = (key: string, value: string) => {
                    const lower = key.toLowerCase();
                    const stripped = lower.replace(/\s+/g, '');
                    nameMap.set(lower, value);
                    nameMap.set(stripped, value);
                };

                allTopics.forEach(t => addToMap(t.name, t.name.toLowerCase()));
                allAliases.forEach(a => addToMap(a.name, a.topic.name.toLowerCase()));

                const uniqueKeywords = Array.from(new Set([
                    ...allTopics.map(t => t.name),
                    ...allAliases.map(a => a.name)
                ]));

                // Optimization: Pre-calculate regex patterns and lowercase forms
                const processedKeywords: CachedKeyword[] = uniqueKeywords
                    .filter(k => k.length >= 2)
                    .sort((a, b) => b.length - a.length)
                    .map(keyword => {
                        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const isKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(keyword);
                        const boundary = isKorean ? '' : '\\b';
                        return {
                            word: keyword.toLowerCase(),
                            pattern: `${boundary}${escaped}${boundary}`
                        };
                    });

                this.data = { processedKeywords, nameMap };
                this.lastUpdate = Date.now();
                return this.data;
            } catch (error) {
                logger.error("[KeywordCache] Error refreshing cache:", error);
                // Fallback to empty data or keep old data if available
                return this.data || { processedKeywords: [], nameMap: new Map() };
            } finally {
                this.pendingPromise = null;
            }
        })();

        return this.pendingPromise;
    }

    static async getKeywordsData(): Promise<KeywordData> {
        // Stale-While-Revalidate: Return data immediately if available
        if (this.data) {
            // If TTL expired, trigger background refresh
            if (Date.now() - this.lastUpdate >= this.TTL) {
                // Trigger background refresh without awaiting
                this.refresh().catch(e => logger.error("[KeywordCache] Background refresh failed", e));
            }
            return this.data;
        }

        // First load or invalidated: must wait
        return this.refresh();
    }

    static invalidate() {
        this.data = null;
        this.lastUpdate = 0;
    }
}

interface WikiResponse {
    answer: string;
    content: string;
    isNew: boolean;
    topicId: string;
}

/**
 * 사용자의 질문을 처리하여 AI 사서가 답변을 생성하거나 캐시된 내용을 반환합니다.
 * 1. 주제(Topic) 찾기 (별칭 포함)
 * 2. 데이터 최신성(Staleness) 확인 (3개월)
 * 3. 필요 시 AI 콘텐츠 생성 및 그래프 동기화
 * 4. 사용자 탐사 기록(ShipLog) 업데이트
 */
export async function processUserQuery(userId: string, query: string, language: string = 'en', chatHistory?: ChatHistoryEntry[]): Promise<WikiResponse> {
    const normalizedName = query.trim().toLowerCase();

    // 1. 별칭(Alias)을 통해 주제(Topic) 찾기
    let topic = await prismaContent.topic.findUnique({
        where: { name: normalizedName },
        include: { articles: { where: { language } } }
    });

    // 이름으로 찾지 못한 경우 별칭 테이블 검색 (case-insensitive)
    if (!topic) {
        const alias = await prismaContent.alias.findUnique({
            where: { name: query.trim().toLowerCase() },
            include: { topic: { include: { articles: { where: { language } } } } }
        });
        if (alias) {
            topic = alias.topic;
        }
    }

    // 1-2. Fuzzy 사전 조회 (Gemini 호출 전 유사 Topic 검색)
    // 정확 일치가 실패한 경우, DB에서 유사한 주제를 검색하여 중복 생성 방지.
    // 점수화로 가장 유사한 후보만 채택. 임계값 미달이면 신규 생성으로 진행.
    if (!topic && normalizedName.length >= 3) {
        const candidates = await prismaContent.topic.findMany({
            where: {
                OR: [
                    { name: { contains: normalizedName } },
                    { name: { startsWith: normalizedName.substring(0, Math.min(normalizedName.length, 10)) } },
                ]
            },
            include: { articles: { where: { language } }, aliases: true },
            take: 5,
        });

        const bestTopic = pickBestFuzzyMatch(normalizedName, candidates);
        if (bestTopic) {
            topic = bestTopic;
        } else {
            // 별칭에서도 fuzzy 검색
            const aliasCandidates = await prismaContent.alias.findMany({
                where: {
                    name: { contains: normalizedName },
                },
                include: { topic: { include: { articles: { where: { language } } } } },
                take: 5,
            });
            const bestAlias = pickBestFuzzyMatch(normalizedName, aliasCandidates);
            if (bestAlias) {
                topic = bestAlias.topic;
            }
        }
    }

    // 2. 데이터 최신성 확인
    const now = new Date();
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(now.getMonth() - 3);

    let content = "";
    let answer = "";
    let isNew = false;
    let topicId = topic?.id;

    // 기사(Article) 찾기
    // 1:N 관계지만 특정 언어로 필터링했으므로 최대 1개
    const article = topic?.articles?.[0];

    // 주제가 없거나, 기사가 없거나, 기사 내용이 비어있거나(Lazy Loading 스텁), 기사가 3개월 이상 된 경우 재생성 필요
    const needsGeneration = !topic || !article || !article.content || article.updatedAt < threeMonthsAgo;

    if (needsGeneration) {
        logger.info(`[WikiEngine] 콘텐츠 생성 중: ${query} (언어: ${language})`);

        // 3. AI 콘텐츠 생성 (대화 이력 포함)
        let generated = await generateWikiContent(query, language, chatHistory);

        // 3-0. 품질 검증: 나무위키 스타일 프롬프트가 요구하는 구조를 만족하는지 확인.
        // Unknown/Follow-up 경로는 검증 대상이 아님 (위키 본문 저장 자체를 안 함).
        if (generated.topic !== 'Unknown' && !generated.isFollowUp) {
            const quality = evaluateWikiContent(generated.content);
            if (!quality.ok) {
                logger.warn(`[WikiEngine] 콘텐츠 품질 미달, 1회 재생성 시도`, {
                    query, language, reasons: quality.reasons,
                    headings: quality.headings, links: quality.links, words: quality.words,
                });
                // 재생성: 부족한 점을 알려주는 보강 지시를 history에 추가
                const retryHint = `이전 응답이 다음 기준에 미달했습니다: ${quality.reasons.join(', ')}. 반드시 \`##\` 헤딩 3개 이상, [[링크]] 5개 이상, 400단어 이상으로 다시 작성해주세요.`;
                const retryHistory: ChatHistoryEntry[] = [
                    ...(chatHistory ?? []),
                    { role: 'user', content: query },
                    { role: 'assistant', content: generated.content || '(empty)' },
                    { role: 'user', content: retryHint },
                ];
                try {
                    const retried = await generateWikiContent(query, language, retryHistory);
                    const retriedQuality = evaluateWikiContent(retried.content);
                    if (retriedQuality.ok || retriedQuality.words > quality.words) {
                        generated = retried;
                    } else {
                        logger.warn(`[WikiEngine] 재생성도 품질 미달, 첫 결과 유지`, {
                            firstWords: quality.words, retryWords: retriedQuality.words,
                        });
                    }
                } catch (e) {
                    logger.warn(`[WikiEngine] 재생성 실패, 첫 결과 유지`, {
                        message: e instanceof Error ? e.message : String(e),
                    });
                }
            }
        }

        // [추가] 마크다운 링크 정규화
        // AI가 생성한 [Text](URL) 형식을 내부 링크 형식 [[Text]]로 변환
        const normalizeMarkdownLinks = (text: string) => {
            return text.replace(/\[([^\]]+)\]\([^)]+\)/g, '[[$1]]');
        };

        content = normalizeMarkdownLinks(generated.content);
        answer = normalizeMarkdownLinks(generated.chatResponse);

        // [추가] "Unknown" 주제 처리
        // Gemini가 주제를 "Unknown"으로 식별한 경우 (잘못된 요청 또는 복잡한 관련 없는 명령),
        // 답변만 반환하고 DB에 저장하지 않음.
        if (generated.topic === "Unknown") {
            return { answer, content, isNew: false, topicId: "" };
        }

        // [추가] 후속 질문 경량 경로
        // Gemini가 isFollowUp: true 반환 시, WikiArticle을 건드리지 않고 chatResponse만 사용
        if (generated.isFollowUp) {
            const followUpCanonical = (generated.canonicalName || generated.topic).trim().toLowerCase();
            const followUpTopic = await prismaContent.topic.findUnique({
                where: { name: followUpCanonical },
                include: { articles: { where: { language } } }
            });

            if (followUpTopic) {
                // 기존 Topic 발견: chatResponse만 반환, WikiArticle 미수정
                topicId = followUpTopic.id;

                // ShipLog 업데이트 (재방문)
                try {
                    await prismaContent.user.upsert({
                        where: { id: userId },
                        update: {},
                        create: { id: userId }
                    });
                    await prismaContent.shipLog.upsert({
                        where: { userId_topicId: { userId, topicId: topicId! } },
                        update: { discoveredAt: new Date() },
                        create: { userId, topicId: topicId!, discoveredAt: new Date() }
                    });
                } catch (e) {
                    logger.error("[WikiEngine] Follow-up ShipLog 업데이트 실패:", { error: e instanceof Error ? e.message : e });
                }

                return { answer, content: followUpTopic.articles?.[0]?.content || '', isNew: false, topicId };
            }
            // 기존 Topic 미발견 시 정상 생성 경로로 폴스루
            logger.info(`[WikiEngine] Follow-up topic not found in DB, proceeding with full generation: ${followUpCanonical}`);
        }

        // 정식 명칭(Canonical Name) 사용 (중복 방지)
        const canonicalName = generated.canonicalName || generated.topic;
        const mainTopicName = canonicalName.trim().toLowerCase(); // DB 키
        const extractedTopicName = generated.topic.trim(); // 원래 추출된 주제
        const tags = normalizeTags(generated.tags || []);

        // Post-Generation 중복 검사: Gemini가 반환한 canonicalName으로 기존 Topic 확인
        const existingByCanonical = await prismaContent.topic.findUnique({
            where: { name: mainTopicName },
            include: { articles: { where: { language } } }
        });

        if (existingByCanonical?.articles?.[0]?.content &&
            existingByCanonical.articles[0].updatedAt >= threeMonthsAgo) {
            // 기존 캐시 사용, 별칭만 추가 등록
            content = existingByCanonical.articles[0].content;
            const overview = extractOverview(content);
            answer = `**[ARCHIVE RETRIEVED]** *"${existingByCanonical.name}"*에 대한 기록을 발견했습니다.\n\n${overview}`;
            topicId = existingByCanonical.id;

            // 별칭 등록 (user query -> existing topic)
            if (normalizedName !== mainTopicName) {
                try {
                    await prismaContent.alias.upsert({
                        where: { name: normalizedName },
                        update: {},
                        create: { name: normalizedName, topicId: existingByCanonical.id }
                    });
                    KeywordCache.invalidate();
                } catch { /* 중복 무시 */ }
            }

            // ShipLog 업데이트
            try {
                await prismaContent.user.upsert({
                    where: { id: userId },
                    update: {},
                    create: { id: userId }
                });
                await prismaContent.shipLog.upsert({
                    where: { userId_topicId: { userId, topicId: topicId! } },
                    update: { discoveredAt: new Date() },
                    create: { userId, topicId: topicId!, discoveredAt: new Date() }
                });
            } catch (e) {
                logger.error("[WikiEngine] ShipLog 업데이트 실패:", { error: e instanceof Error ? e.message : e });
            }

            return { answer, content, isNew: false, topicId };
        }

        // 3-1. 자동 링크 생성기 (후처리)
        const { processedKeywords, nameMap: cachedNameMap } = await KeywordCache.getKeywordsData();

        // 마스킹 및 자동 링크 생성 (하이브리드 최적화: 선별 후 단일 패스 교체)
        const performAutoLink = (text: string) => {
            if (!text) return text;

            // 1. 후보 키워드 선별 (전체 키워드 중 텍스트에 포함된 것만 골라냄)
            // .includes()는 매우 최적화되어 있어 수만 개의 키워드에 대해서도 루프보다 빠름
            const lowerText = text.toLowerCase();

            // Optimization: check against pre-lowercased word
            const candidates = processedKeywords.filter(k => lowerText.includes(k.word));

            if (candidates.length === 0) return text;

            const placeholders: string[] = [];
            // 2. 기존 링크 [[...]] 마스킹
            let masked = text.replace(/\[\[(.*?)\]\]/g, (match) => {
                placeholders.push(match);
                return `__PH_${placeholders.length - 1}__`;
            });

            // 3. 단일 정규식 구성 (이미 길이 역순으로 정렬되어 있어 최장 일치 우선 매칭됨)
            // Optimization: use pre-calculated patterns
            const patternParts = candidates.map(k => k.pattern);

            if (patternParts.length > 0) {
                // 선별된 후보에 대해서만 정규식 매칭 수행 (성능 대폭 향상)
                // 위키 관례: 같은 키워드는 첫 등장에서만 [[link]] 처리해 시각적 노이즈와 그래프 가중치 왜곡 방지
                const combinedPattern = new RegExp(`(${patternParts.join('|')})`, 'gi');
                const seen = new Set<string>();
                masked = masked.replace(combinedPattern, (match) => {
                    const key = match.toLowerCase().replace(/\s+/g, '');
                    if (seen.has(key)) return match;
                    seen.add(key);
                    return `[[${match}]]`;
                });
            }

            // 4. 플레이스홀더 복원
            return masked.replace(/__PH_(\d+)__/g, (_, index) => placeholders[parseInt(index)]);
        };

        content = performAutoLink(content);
        answer = performAutoLink(answer); // UI를 위해 채팅 답변에도 링크 적용

        // 링크 파싱 [[Keyword]] (다시 수행)
        const linkRegex = /\[\[(.*?)\]\]/g;
        const matches = [...content.matchAll(linkRegex)];
        const linkedKeywords = matches.map(match => match[1]);

        // 4. 이중 트랜잭션 (Content DB + Neo4j)
        const savedTopic = await withDualTransaction(async (prismaTx, neo4jTx) => {
            // A. 주제(Topic) 생성 또는 업데이트
            // 참고: 주제가 이미 존재하면 태그만 업데이트하고, 없으면 생성
            const t = await prismaTx.topic.upsert({
                where: { name: mainTopicName },
                update: {
                    tags: {
                        connectOrCreate: tags.map(tag => ({
                            where: { name: tag },
                            create: { name: tag }
                        }))
                    }
                },
                create: {
                    name: mainTopicName,
                    tags: {
                        connectOrCreate: tags.map(tag => ({
                            where: { name: tag },
                            create: { name: tag }
                        }))
                    }
                }
            });

            // B. 기사(Article) 생성 또는 업데이트 (복합 키: topicId + language)
            await prismaTx.wikiArticle.upsert({
                where: {
                    topicId_language: {
                        topicId: t.id,
                        language: language
                    }
                },
                update: { content, language, title: generated.title || extractedTopicName },
                create: { topicId: t.id, content, language, title: generated.title || extractedTopicName }
            });

            // C. 별칭(Alias) 등록 (일관되게 lowercase로 저장)
            // 1) 사용자가 입력한 쿼리 (검색어) -> 주제
            if (query.trim().toLowerCase() !== mainTopicName) {
                try {
                    await prismaTx.alias.upsert({
                        where: { name: query.trim().toLowerCase() },
                        update: {},
                        create: { name: query.trim().toLowerCase(), topicId: t.id }
                    });
                } catch {
                    // 무시 (중복 등)
                }
            }

            // 2) AI가 추출한 짧은 주제명 (generated.topic) -> 주제
            if (extractedTopicName.toLowerCase() !== mainTopicName) {
                try {
                    await prismaTx.alias.upsert({
                        where: { name: extractedTopicName.toLowerCase() },
                        update: {},
                        create: { name: extractedTopicName.toLowerCase(), topicId: t.id }
                    });
                } catch {
                    // 무시
                }
            }

            // D. Neo4j 그래프 동기화
            // Optimization: Avoid O(N) map copy by using look-aside map
            const localNameMap = new Map<string, string>();

            // 맵 추가 헬퍼 (Adds to local map only)
            const addToMap = (key: string, value: string) => {
                const lower = key.toLowerCase();
                const stripped = lower.replace(/\s+/g, '');
                localNameMap.set(lower, value);
                localNameMap.set(stripped, value);
            };

            // 현재 생성된 주제 및 별칭을 맵에 추가
            const mainTopicNameLower = mainTopicName.toLowerCase();
            addToMap(mainTopicName, mainTopicNameLower);
            if (query.trim().toLowerCase() !== mainTopicNameLower) {
                addToMap(query.trim(), mainTopicNameLower);
            }
            if (extractedTopicName.toLowerCase() !== mainTopicNameLower) {
                addToMap(extractedTopicName, mainTopicNameLower);
            }

            // Helper to resolve keyword using local map then cached map
            const resolveKeyword = (k: string) => {
                const lower = k.trim().toLowerCase();
                const stripped = lower.replace(/\s+/g, '');

                // Check local map first
                if (localNameMap.has(lower)) return localNameMap.get(lower)!;
                if (localNameMap.has(stripped)) return localNameMap.get(stripped)!;

                // Check cached map
                if (cachedNameMap.has(lower)) return cachedNameMap.get(lower)!;
                if (cachedNameMap.has(stripped)) return cachedNameMap.get(stripped)!;

                return k.trim();
            };

            const resolvedKeywords = linkedKeywords.map(k => resolveKeyword(k));

            // 중복 제거
            const uniqueKeywords = Array.from(new Set(resolvedKeywords));

            await syncArticleToGraph(neo4jTx, mainTopicName, uniqueKeywords, tags, t.id);

            // 3-2.5. 고스트 노드 병합 (Alias -> Canonical)
            // 별칭(검색어, 추출된 주제명)이 있다면, 해당 이름으로 존재하는 고스트 노드를 메인 노드로 병합해야 함.
            const aliasesToMerge = Array.from(new Set([
                query.trim().toLowerCase() !== mainTopicName ? query.trim() : null,
                extractedTopicName.toLowerCase() !== mainTopicName ? extractedTopicName : null
            ].filter(Boolean) as string[]));

            if (aliasesToMerge.length > 0) {
                await mergeAliasesToCanonical(neo4jTx, mainTopicName, aliasesToMerge);
            }

            // 3-3. 채팅 답변은 chatResponse만 유지. 위키 본문은 KnowledgePanel(topicId)에서 별도 렌더.
            // Why: 나무위키 스타일 프롬프트로 본문이 600~1000단어가 되어 chat bubble에 inline 표시하면 가독성 저하.

            return t;
        });

        // 신규 주제/별칭이 생성되었으므로 캐시 무효화
        KeywordCache.invalidate();

        topicId = savedTopic.id;
        isNew = true;
    } else {
        // 캐시된 콘텐츠 반환
        content = article!.content || "";
        // 캐시된 경우 채팅 답변에는 개요 섹션만 미리보기로 노출 (전체 본문은 KnowledgePanel에서)
        const overview = extractOverview(content);
        answer = `**[ARCHIVE RETRIEVED]** *"${topic!.name}"*에 대한 기록을 발견했습니다.\n\n${overview}`;
        topicId = topic!.id;
    }

    // 5. 탐사 기록(ShipLog) 업데이트 (Content DB - constella)
    try {
        await prismaContent.user.upsert({
            where: { id: userId },
            update: {},
            create: { id: userId }
        });

        await prismaContent.shipLog.upsert({
            where: {
                userId_topicId: {
                    userId,
                    topicId: topicId!
                }
            },
            update: {
                discoveredAt: new Date() // 발견 시간 업데이트
            },
            create: {
                userId,
                topicId: topicId!,
                discoveredAt: new Date()
            }
        });
    } catch (e) {
        logger.error("[WikiEngine] ShipLog 업데이트 실패:", { error: e instanceof Error ? e.message : e });
    }

    return { answer, content, isNew, topicId: topicId! };
}
