
import prismaContent from '@/lib/prisma-content'; // Content DB
import { withDualTransaction } from '@/lib/transaction';
import { syncArticleToGraph, mergeAliasesToCanonical } from '@/lib/graph';
import { generateWikiContent } from '@/lib/gemini';
import logger from "@/lib/logger";

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
export async function processUserQuery(userId: string, query: string, language: string = 'en'): Promise<WikiResponse> {
    const normalizedName = query.trim().toLowerCase();

    // 1. 별칭(Alias)을 통해 주제(Topic) 찾기
    let topic = await prismaContent.topic.findUnique({
        where: { name: normalizedName },
        include: { articles: { where: { language } } }
    });

    // 이름으로 찾지 못한 경우 별칭 테이블 검색
    if (!topic) {
        const alias = await prismaContent.alias.findUnique({
            where: { name: query.trim() },
            include: { topic: { include: { articles: { where: { language } } } } }
        });
        if (alias) {
            topic = alias.topic;
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

        // 3. AI 콘텐츠 생성
        const generated = await generateWikiContent(query, language);

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

        // 정식 명칭(Canonical Name) 사용 (중복 방지)
        const canonicalName = generated.canonicalName || generated.topic;
        const mainTopicName = canonicalName.trim().toLowerCase(); // DB 키
        const extractedTopicName = generated.topic.trim(); // 원래 추출된 주제
        const tags = generated.tags || [];

        // 3-1. 자동 링크 생성기 (후처리)
        // 알려진 주제를 가져와 텍스트 내에서 자동으로 링크 연결
        const allTopics = await prismaContent.topic.findMany({ select: { name: true } });
        const allAliases = await prismaContent.alias.findMany({ select: { name: true } });

        // 병합 후 길이 역순 정렬 (긴 구문을 우선 매칭하기 위함)
        const keywordsToLink = Array.from(new Set([
            ...allTopics.map(t => t.name),
            ...allAliases.map(a => a.name)
        ])).sort((a, b) => b.length - a.length);

        // 마스킹 구현
        const performAutoLink = (text: string) => {
            const placeholders: string[] = [];
            // 기존 링크 [[...]] 마스킹
            let masked = text.replace(/\[\[(.*?)\]\]/g, (match) => {
                placeholders.push(match);
                return `__PH_${placeholders.length - 1}__`;
            });

            // 순회하며 링크 연결
            keywordsToLink.forEach(keyword => {
                if (keyword.length < 2) return;
                // 키워드 내의 정규식 특수 문자 이스케이프
                const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

                // 영어의 경우 단어 경계(\b)가 필요하지만, 한국어는 조사가 붙으므로 경계를 두면 안 됨.
                // 키워드가 한국어인지 영어인지 감지
                const isKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(keyword);
                const boundary = isKorean ? '' : '\\b';

                const pattern = new RegExp(`(${boundary}${escaped}${boundary})`, 'gi');
                masked = masked.replace(pattern, '[[$1]]');
            });

            // 플레이스홀더 복원
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

            // C. 별칭(Alias) 등록
            // 1) 사용자가 입력한 쿼리 (검색어) -> 주제
            if (query.trim().toLowerCase() !== mainTopicName) {
                try {
                    await prismaTx.alias.upsert({
                        where: { name: query.trim() },
                        update: {},
                        create: { name: query.trim(), topicId: t.id }
                    });
                } catch {
                    // 무시 (중복 등)
                }
            }

            // 2) AI가 추출한 짧은 주제명 (generated.topic) -> 주제
            if (extractedTopicName.toLowerCase() !== mainTopicName) {
                try {
                    await prismaTx.alias.upsert({
                        where: { name: extractedTopicName },
                        update: {},
                        create: { name: extractedTopicName, topicId: t.id }
                    });
                } catch {
                    // 무시
                }
            }

            // D. Neo4j 그래프 동기화
            // 빠른 조회를 위한 맵 생성: 이름 -> 정식 명칭
            const nameMap = new Map<string, string>();

            // 맵 추가 헬퍼
            const addToMap = (key: string, value: string) => {
                const lower = key.toLowerCase();
                const stripped = lower.replace(/\s+/g, '');
                nameMap.set(lower, value);
                nameMap.set(stripped, value);
            };

            // 기존 주제들에 대해 자기 자신 매핑
            allTopics.forEach(t => addToMap(t.name, t.name.toLowerCase()));

            // 별칭 -> 주제 매핑 가져오기
            const aliasesWithTopic = await prismaTx.alias.findMany({
                include: { topic: { select: { name: true } } }
            });
            aliasesWithTopic.forEach(a => {
                addToMap(a.name, a.topic.name.toLowerCase());
            });

            const resolvedKeywords = linkedKeywords.map(k => {
                const lower = k.trim().toLowerCase();
                const stripped = lower.replace(/\s+/g, '');
                // 정확한 일치, 공백 제거 일치, 또는 원본 순으로 시도
                return nameMap.get(lower) || nameMap.get(stripped) || k.trim();
            });

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

            // 3-3. UI 피드백: 위키 콘텐츠 추가
            // 사용자가 채팅 응답 하단에 전체 내용을 보여달라고 요청함.
            answer += `\n\n---\n\n${content}`;

            return t;
        });

        topicId = savedTopic.id;
        isNew = true;
    } else {
        // 캐시된 콘텐츠 반환
        content = article!.content || "";
        // 캐시된 경우 채팅 답변 생성
        answer = `**[ARCHIVE RETRIEVED]**\n\n기록 보관소에서 *"${topic!.name}"*에 대한 데이터를 찾았습니다.\n\n---\n\n${content}`;
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
