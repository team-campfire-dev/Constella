
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
 * 2. 신선도(Staleness) 확인 (3개월)
 * 3. 필요 시 AI 생성 및 그래프 동기화
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

    // 2. 신선도(Staleness) 확인
    const now = new Date();
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(now.getMonth() - 3);

    let content = "";
    let answer = "";
    let isNew = false;
    let topicId = topic?.id;

    // 기사(Article) 찾기
    const article = topic?.articles?.[0]; // Prism returns array because of 1:N but we filtered by specific language so max 1

    // 주제가 없거나, 기사가 없거나, 기사 내용이 비어있거나(Lazy Loading Stub), 기사가 3개월 이상 된 경우 재생성 필요
    const needsGeneration = !topic || !article || !article.content || article.updatedAt < threeMonthsAgo;

    if (needsGeneration) {
        logger.info(`[WikiEngine] 콘텐츠 생성 중: ${query} (언어: ${language})`);

        // 3. AI 콘텐츠 생성
        const generated = await generateWikiContent(query, language);
        content = generated.content;
        answer = generated.chatResponse;

        // Canonical Name 사용 (중복 방지)
        const canonicalName = generated.canonicalName || generated.topic;
        const mainTopicName = canonicalName.trim().toLowerCase(); // DB Key
        const extractedTopicName = generated.topic.trim(); // Original extracted topic
        const tags = generated.tags || [];

        // 3-1. Auto-Linker (Post-Processing)
        // Fetch known topics to automatically link them in the text
        const allTopics = await prismaContent.topic.findMany({ select: { name: true } });
        const allAliases = await prismaContent.alias.findMany({ select: { name: true } });

        // Merge and sort by length descending to match longest phrases first
        const keywordsToLink = Array.from(new Set([
            ...allTopics.map(t => t.name),
            ...allAliases.map(a => a.name)
        ])).sort((a, b) => b.length - a.length);

        // Proper Masking Implementation
        const performAutoLink = (text: string) => {
            const placeholders: string[] = [];
            // Mask existing links [[...]]
            let masked = text.replace(/\[\[(.*?)\]\]/g, (match) => {
                placeholders.push(match);
                return `__PH_${placeholders.length - 1}__`;
            });

            // Iterate and link
            keywordsToLink.forEach(keyword => {
                if (keyword.length < 2) return;
                // Escape literal regex characters in keyword
                const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

                // For English, we want \b boundaries. For Korean, we usually don't want boundaries (particles attach).
                // Detect if keyword is Korean or English?
                const isKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(keyword);
                const boundary = isKorean ? '' : '\\b';

                const pattern = new RegExp(`(${boundary}${escaped}${boundary})`, 'gi');
                masked = masked.replace(pattern, '[[$1]]');
            });

            // Restore placeholders
            return masked.replace(/__PH_(\d+)__/g, (_, index) => placeholders[parseInt(index)]);
        };

        content = performAutoLink(content);
        answer = performAutoLink(answer); // Also linkify chat response for UI

        // 링크 파싱 [[Keyword]] (다시 수행)
        const linkRegex = /\[\[(.*?)\]\]/g;
        const matches = [...content.matchAll(linkRegex)];
        const linkedKeywords = matches.map(match => match[1]);

        // 4. 듀얼 트랜잭션 (Content DB + Neo4j)
        const savedTopic = await withDualTransaction(async (prismaTx, neo4jTx) => {
            // A. 주제(Topic) 생성 또는 업데이트
            // Note: If topic exists, we just update tags. If not, create.
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

            // B. 기사(Article) 생성 또는 업데이트 (Composite Key: topicId + language)
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
                    // 무시
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
            // Build a map for fast lookup: Name -> Canonical Name
            const nameMap = new Map<string, string>();

            // Helper to add keys
            const addToMap = (key: string, value: string) => {
                const lower = key.toLowerCase();
                const stripped = lower.replace(/\s+/g, '');
                nameMap.set(lower, value);
                nameMap.set(stripped, value);
            };

            // Allow self-mapping for existing topics
            allTopics.forEach(t => addToMap(t.name, t.name.toLowerCase()));

            // Fetch Alias -> Topic mapping
            const aliasesWithTopic = await prismaTx.alias.findMany({
                include: { topic: { select: { name: true } } }
            });
            aliasesWithTopic.forEach(a => {
                addToMap(a.name, a.topic.name.toLowerCase());
            });

            const resolvedKeywords = linkedKeywords.map(k => {
                const lower = k.trim().toLowerCase();
                const stripped = lower.replace(/\s+/g, '');
                // Try exact match, then stripped match, then original
                return nameMap.get(lower) || nameMap.get(stripped) || k.trim();
            });

            // Deduplicate
            const uniqueKeywords = Array.from(new Set(resolvedKeywords));

            logger.info(`[WikiEngine] Keywords Debug: `, {
                linked: linkedKeywords,
                resolved: resolvedKeywords,
                unique: uniqueKeywords
            });

            await syncArticleToGraph(neo4jTx, mainTopicName, uniqueKeywords, tags, t.id);

            // 3-2.5. Merge Ghost Nodes (Alias -> Canonical)
            // If we have aliases (query, extractedTopicName), we must merge any existing ghost nodes with these names into main.
            const aliasesToMerge = Array.from(new Set([
                query.trim().toLowerCase() !== mainTopicName ? query.trim() : null,
                extractedTopicName.toLowerCase() !== mainTopicName ? extractedTopicName : null
            ].filter(Boolean) as string[]));

            if (aliasesToMerge.length > 0) {
                await mergeAliasesToCanonical(neo4jTx, mainTopicName, aliasesToMerge);
            }

            // 3-3. UI Feedback: Append Wiki Content (instead of Detected Signals)
            // User requested to show full content below chat response.
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
                discoveredAt: new Date() // Update discovery time or keep original? Update makes recently viewed logic easier.
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
