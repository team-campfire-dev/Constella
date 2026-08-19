
import prismaContent from '@/lib/prisma-content'; // Content DB
import { withDualTransaction } from '@/lib/transaction';
import { syncArticleToGraph, mergeAliasesToCanonical } from '@/lib/graph';
import { routeQuery, generateArticleBody, evaluateWikiContent, ChatHistoryEntry } from '@/lib/gemini';
import logger from "@/lib/logger";

/** 이 기간이 지난 본문은 낡은 것으로 보고 다시 만든다. */
const STALE_AFTER_MONTHS = 3;

function staleBefore(): Date {
    const d = new Date();
    d.setMonth(d.getMonth() - STALE_AFTER_MONTHS);
    return d;
}

interface ArticleLike { content: string | null; updatedAt: Date }

/** 본문이 있고 낡지 않았는가. 이 판정이 "캐시 히트"의 정의다. */
function isFresh(article: ArticleLike | undefined | null): boolean {
    return !!article?.content && article.updatedAt >= staleBefore();
}

/**
 * 위키 본문에서 첫 번째 ## 섹션(보통 "개요"/"Overview")을 추출해 채팅 미리보기로 사용합니다.
 * 캐시 히트(모델 미호출) 경로에서 chat bubble이 빈약해지지 않도록 함.
 */
function extractOverview(content: string): string {
    if (!content) return '';
    const match = content.match(/##\s*[^\n]*\n([\s\S]*?)(?=\n##\s|$)/);
    if (match) return match[1].trim();
    // 헤딩이 없으면 첫 문단
    const firstPara = content.split(/\n\s*\n/)[0];
    return firstPara.trim();
}

/** 캐시 히트일 때의 말풍선. 모델을 부르지 않는다. */
function archiveAnswer(topicName: string, content: string): string {
    return `**[ARCHIVE RETRIEVED]** *"${topicName}"*에 대한 기록을 발견했습니다.\n\n${extractOverview(content)}`;
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
 * 라우터가 반환한 태그를 정규화하고 중복을 제거합니다.
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

/** AI가 생성한 [Text](URL) 형식을 내부 링크 형식 [[Text]]로 변환 */
function normalizeMarkdownLinks(text: string): string {
    return text.replace(/\[([^\]]+)\]\([^)]+\)/g, '[[$1]]');
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

/**
 * 본문 전체를 훑어 알려진 토픽·별칭을 [[링크]]로 감쌉니다.
 *
 * 이 후처리는 위키 본문에만 적용합니다. 여기서 추출된 링크가 곧 Neo4j 엣지가 되므로
 * 장식이 아니라 데이터입니다. (채팅 답변에는 적용하지 않습니다 — 그쪽은 UI에서
 * 굵은 글씨로만 렌더되고 그래프에도 기여하지 않아, 임계 경로에 KeywordCache 의존을
 * 남길 이유가 없습니다.)
 */
function performAutoLink(text: string, processedKeywords: CachedKeyword[]): string {
    if (!text) return text;

    // 1. 후보 키워드 선별 (전체 키워드 중 텍스트에 포함된 것만 골라냄)
    // .includes()는 매우 최적화되어 있어 수만 개의 키워드에 대해서도 루프보다 빠름
    const lowerText = text.toLowerCase();
    const candidates = processedKeywords.filter(k => lowerText.includes(k.word));
    if (candidates.length === 0) return text;

    const placeholders: string[] = [];
    // 2. 기존 링크 [[...]] 마스킹
    let masked = text.replace(/\[\[(.*?)\]\]/g, (match) => {
        placeholders.push(match);
        return `__PH_${placeholders.length - 1}__`;
    });

    // 3. 단일 정규식 구성 (이미 길이 역순으로 정렬되어 있어 최장 일치 우선 매칭됨)
    const patternParts = candidates.map(k => k.pattern);
    if (patternParts.length > 0) {
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
}

// ════════════════════════════════════════════════════════════════
// ⑤ 본문 보장 — 응답 이후 백그라운드, 그리고 위키 열람 시의 지연 생성.
//
// 두 경로가 같은 함수를 공유하고 in-flight Map이 중복 호출을 하나로 접는다.
// 키에 사용자 ID가 없다: 본문은 (canonicalName, language)의 함수이며 모든
// 탐험가가 같은 문서를 본다. 두 사람이 동시에 같은 새 토픽을 발견하면
// 생성은 한 번만 돌고 둘 다 그 결과를 받는다.
//
// 상태를 DB에 두지 않는 이유: 프로세스가 죽으면 이 Map도 함께 사라지고
// 남는 것은 빈 content뿐인데, 그건 이미 "생성 필요"를 뜻하는 기존 상태다.
// 재시작이 곧 자가 치유이고, 좀비 PENDING 행이 생기지 않는다.
// ════════════════════════════════════════════════════════════════

const inFlight = new Map<string, Promise<string>>();

/**
 * 해당 토픽·언어의 위키 본문이 존재하도록 보장하고 그 내용을 반환합니다.
 * 이미 생성이 진행 중이면 새로 호출하지 않고 그 작업을 기다립니다.
 */
export async function ensureArticle(canonicalName: string, language: string = 'en'): Promise<string> {
    const name = canonicalName.trim().toLowerCase();
    const key = `${name}:${language}`;

    const running = inFlight.get(key);
    if (running) {
        logger.info(`[WikiEngine] 본문 생성이 이미 진행 중, 대기: ${key}`);
        return running;
    }

    const task = buildArticle(name, language).finally(() => inFlight.delete(key));
    inFlight.set(key, task);
    return task;
}

async function buildArticle(name: string, language: string): Promise<string> {
    const topic = await prismaContent.topic.findUnique({
        where: { name },
        include: { articles: { where: { language } }, tags: true },
    });
    if (!topic) {
        throw new Error(`ensureArticle: 토픽을 찾을 수 없습니다 — ${name}`);
    }

    const existing = topic.articles[0];
    if (isFresh(existing)) return existing.content!;

    const tags = topic.tags.map(t => t.name);
    logger.info(`[WikiEngine] 본문 생성 시작: ${name} (${language})`);

    let body = await generateArticleBody({
        canonicalName: topic.name,
        title: existing?.title ?? undefined,
        tags,
        language,
    });

    // 품질 게이트. 미달이면 1회만 다시 시도한다.
    // 보강 지시는 대화 이력이 아니라 단일 턴으로 전달된다 — 본문 생성이
    // 사용자와 무관한 함수로 남아야 위쪽 in-flight 공유가 정당하다.
    const quality = evaluateWikiContent(body, language);
    if (!quality.ok) {
        logger.warn(`[WikiEngine] 본문 품질 미달, 1회 재생성 시도`, {
            name, language, reasons: quality.reasons,
            headings: quality.headings, links: quality.links, words: quality.words,
        });
        try {
            const retried = await generateArticleBody({
                canonicalName: topic.name,
                title: existing?.title ?? undefined,
                tags,
                language,
                deficiency: { reasons: quality.reasons, previous: body },
            });
            const retriedQuality = evaluateWikiContent(retried, language);
            // 단어 수 하나로 비교하면 헤딩과 링크가 퇴행해도 장황해지기만 하면 이긴다.
            // 세 지표를 정규화한 종합 점수로 비교해 그 경로를 막는다.
            if (retriedQuality.ok || retriedQuality.score > quality.score) {
                body = retried;
            } else {
                logger.warn(`[WikiEngine] 재생성이 더 낫지 않아 첫 결과 유지`, {
                    firstScore: quality.score, retryScore: retriedQuality.score,
                    firstReasons: quality.reasons, retryReasons: retriedQuality.reasons,
                });
            }
        } catch (e) {
            logger.warn(`[WikiEngine] 재생성 실패, 첫 결과 유지`, {
                message: e instanceof Error ? e.message : String(e),
            });
        }
    }

    body = normalizeMarkdownLinks(body);

    const { processedKeywords, nameMap } = await KeywordCache.getKeywordsData();
    body = performAutoLink(body, processedKeywords);

    // 본문의 [[링크]]가 곧 그래프 엣지가 된다.
    const linked = [...body.matchAll(/\[\[(.*?)\]\]/g)].map(m => m[1]);
    const resolveKeyword = (k: string) => {
        const lower = k.trim().toLowerCase();
        const stripped = lower.replace(/\s+/g, '');
        return nameMap.get(lower) ?? nameMap.get(stripped) ?? k.trim();
    };
    const uniqueKeywords = Array.from(new Set(linked.map(resolveKeyword)));

    const finalBody = body;
    await withDualTransaction(async (prismaTx, neo4jTx) => {
        await prismaTx.wikiArticle.upsert({
            where: { topicId_language: { topicId: topic.id, language } },
            update: { content: finalBody },
            create: {
                topicId: topic.id,
                language,
                content: finalBody,
                title: existing?.title ?? topic.name,
            },
        });
        // 노드는 ④에서 이미 만들어졌다. 이 호출이 엣지와 태그를 붙인다.
        await syncArticleToGraph(neo4jTx, topic.name, uniqueKeywords, tags, topic.id);
    });

    logger.info(`[WikiEngine] 본문 생성 완료: ${name} (${language}), 링크 ${uniqueKeywords.length}개`);
    return finalBody;
}

// ════════════════════════════════════════════════════════════════
// ①~④ 사용자 질의 처리 — 사용자가 기다리는 구간.
// ════════════════════════════════════════════════════════════════

export interface WikiResponse {
    /** 채팅 말풍선에 실릴 내용. */
    answer: string;
    isNew: boolean;
    /** 빈 문자열이면 연결된 토픽이 없다는 뜻 (거부, 또는 참조할 직전 토픽이 없는 후속질문). */
    topicId: string;
}

/** ① 정확 일치 → 별칭 → 퍼지. 모델을 부르지 않는다. */
async function findTopicByQuery(normalizedName: string, language: string) {
    const direct = await prismaContent.topic.findUnique({
        where: { name: normalizedName },
        include: { articles: { where: { language } } },
    });
    if (direct) return direct;

    const alias = await prismaContent.alias.findUnique({
        where: { name: normalizedName },
        include: { topic: { include: { articles: { where: { language } } } } },
    });
    if (alias) return alias.topic;

    if (normalizedName.length < 3) return null;

    const candidates = await prismaContent.topic.findMany({
        where: {
            OR: [
                { name: { contains: normalizedName } },
                { name: { startsWith: normalizedName.substring(0, Math.min(normalizedName.length, 10)) } },
            ],
        },
        include: { articles: { where: { language } } },
        take: 5,
    });
    const best = pickBestFuzzyMatch(normalizedName, candidates);
    if (best) return best;

    const aliasCandidates = await prismaContent.alias.findMany({
        where: { name: { contains: normalizedName } },
        include: { topic: { include: { articles: { where: { language } } } } },
        take: 5,
    });
    const bestAlias = pickBestFuzzyMatch(normalizedName, aliasCandidates);
    return bestAlias ? bestAlias.topic : null;
}

/**
 * 후속질문이 가리키는 토픽을 서버 기록에서 찾습니다.
 *
 * 모델에게 이름을 다시 말하게 하지 않는 이유: canonical 이름이 조금만 흔들려도
 * 조회가 빗나가고, 그러면 에러 없이 중복 토픽이 하나 더 생긴다. 서버가 기억한
 * topicId는 정의상 존재하므로 그 실패 모드 자체가 사라진다.
 */
async function lastDiscussedTopicId(userId: string): Promise<string | null> {
    const row = await prismaContent.chatHistory.findFirst({
        where: { userId, role: 'assistant', topicId: { not: null } },
        orderBy: { createdAt: 'desc' },
        select: { topicId: true },
    });
    return row?.topicId ?? null;
}

async function touchShipLog(userId: string, topicId: string) {
    try {
        await prismaContent.user.upsert({ where: { id: userId }, update: {}, create: { id: userId } });
        await prismaContent.shipLog.upsert({
            where: { userId_topicId: { userId, topicId } },
            update: { discoveredAt: new Date() },
            create: { userId, topicId, discoveredAt: new Date() },
        });
    } catch (e) {
        logger.error("[WikiEngine] ShipLog 업데이트 실패:", { error: e instanceof Error ? e.message : e });
    }
}

async function registerAlias(aliasName: string, topicId: string, canonicalName: string) {
    if (!aliasName || aliasName === canonicalName) return;
    try {
        await prismaContent.alias.upsert({
            where: { name: aliasName },
            update: {},
            create: { name: aliasName, topicId },
        });
        KeywordCache.invalidate();
    } catch { /* 중복 무시 */ }
}

/**
 * 사용자의 질문을 처리합니다.
 *
 *   ① 사전 DB 조회 (모델 호출 없음) → 히트면 템플릿 응답으로 종료
 *   ② 라우터 1콜 — 분류·이름·대화 답변
 *   ③ canonicalName으로 재조회 → 히트면 템플릿 응답으로 종료
 *   ④ Topic + 스텁 Article + Neo4j 노드를 만들고 즉시 반환
 *   ⑤ 본문 생성은 응답 이후 백그라운드에서 (ensureArticle)
 *
 * ②와 ⑤ 사이의 틈이 이 설계의 핵심이다. 캐시 히트·후속질문·거부 세 경우 모두
 * 본문 생성을 아예 호출하지 않는다.
 */
export async function processUserQuery(
    userId: string,
    query: string,
    language: string = 'en',
    chatHistory?: ChatHistoryEntry[]
): Promise<WikiResponse> {
    const normalizedName = query.trim().toLowerCase();

    // ① 사전 조회
    const pre = await findTopicByQuery(normalizedName, language);
    const preArticle = pre?.articles?.[0];
    if (pre && isFresh(preArticle)) {
        await touchShipLog(userId, pre.id);
        return { answer: archiveAnswer(pre.name, preArticle!.content!), isNew: false, topicId: pre.id };
    }

    // ② 라우터
    const routed = await routeQuery(query, language, chatHistory);

    // 거부: 아무것도 저장하지 않는다.
    if (routed.intent === 'reject') {
        return { answer: routed.chatResponse, isNew: false, topicId: "" };
    }

    // 후속질문: 본문을 건드리지 않고 참조 토픽만 갱신한다.
    if (routed.intent === 'follow_up') {
        const lastTopicId = await lastDiscussedTopicId(userId);
        if (lastTopicId) {
            await touchShipLog(userId, lastTopicId);
            return { answer: routed.chatResponse, isNew: false, topicId: lastTopicId };
        }
        // 참조할 직전 토픽이 없다 (예: 대화 첫 턴). 답변만 돌려준다.
        logger.info(`[WikiEngine] follow_up이지만 직전 토픽 기록이 없음: user=${userId}`);
        return { answer: routed.chatResponse, isNew: false, topicId: "" };
    }

    // ③ canonicalName으로 재조회 — 사전 조회가 놓친 동의어를 여기서 잡는다.
    const canonicalName = (routed.canonicalName || routed.topic).trim().toLowerCase();
    if (!canonicalName) {
        logger.warn(`[WikiEngine] new_topic인데 이름이 비어 있음`, { query });
        return { answer: routed.chatResponse, isNew: false, topicId: "" };
    }

    const existingByCanonical = await prismaContent.topic.findUnique({
        where: { name: canonicalName },
        include: { articles: { where: { language } } },
    });
    const existingArticle = existingByCanonical?.articles?.[0];
    if (existingByCanonical && isFresh(existingArticle)) {
        await registerAlias(normalizedName, existingByCanonical.id, canonicalName);
        await touchShipLog(userId, existingByCanonical.id);
        return {
            answer: archiveAnswer(existingByCanonical.name, existingArticle!.content!),
            isNew: false,
            topicId: existingByCanonical.id,
        };
    }

    // ④ Topic·스텁·Neo4j 노드를 만들고 곧바로 응답한다.
    const tags = normalizeTags(routed.tags);
    const extractedTopicName = (routed.topic || canonicalName).trim();
    const displayTitle = routed.title?.trim() || extractedTopicName;

    const aliasNames = Array.from(new Set(
        [normalizedName, extractedTopicName.toLowerCase()].filter(n => n && n !== canonicalName)
    ));

    const savedTopic = await withDualTransaction(async (prismaTx, neo4jTx) => {
        const t = await prismaTx.topic.upsert({
            where: { name: canonicalName },
            update: {
                tags: { connectOrCreate: tags.map(tag => ({ where: { name: tag }, create: { name: tag } })) },
            },
            create: {
                name: canonicalName,
                tags: { connectOrCreate: tags.map(tag => ({ where: { name: tag }, create: { name: tag } })) },
            },
        });

        // 본문 없는 스텁. 표제만 먼저 채워 두면 그래프 조회가 번역을 다시 부르지 않는다.
        await prismaTx.wikiArticle.upsert({
            where: { topicId_language: { topicId: t.id, language } },
            update: { title: displayTitle },
            create: { topicId: t.id, language, title: displayTitle, content: null },
        });

        for (const aliasName of aliasNames) {
            try {
                await prismaTx.alias.upsert({
                    where: { name: aliasName },
                    update: {},
                    create: { name: aliasName, topicId: t.id },
                });
            } catch { /* 중복 무시 */ }
        }

        // 노드만 먼저 만든다. 엣지는 본문의 [[링크]]에서 나오므로 ⑤에서 붙는다.
        // 이 노드가 없으면 /api/graph의 MATCH가 비어 새 별이 아예 뜨지 않는다.
        await syncArticleToGraph(neo4jTx, canonicalName, [], tags, t.id);

        if (aliasNames.length > 0) {
            await mergeAliasesToCanonical(neo4jTx, canonicalName, aliasNames);
        }

        return t;
    });

    KeywordCache.invalidate();
    await touchShipLog(userId, savedTopic.id);

    // ⑤ 사용자는 여기서 기다림을 끝낸다. 본문은 뒤따라 만들어진다.
    void ensureArticle(canonicalName, language).catch(e => {
        logger.error("[WikiEngine] 백그라운드 본문 생성 실패", {
            canonicalName, language,
            message: e instanceof Error ? e.message : String(e),
        });
    });

    return {
        answer: routed.chatResponse,
        isNew: !existingByCanonical,
        topicId: savedTopic.id,
    };
}
