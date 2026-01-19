import prisma from '@/lib/prisma'; // Main DB (User)
import prismaContent from '@/lib/prisma-content'; // Content DB
import { withDualTransaction } from '@/lib/transaction';
import { syncArticleToGraph } from '@/lib/graph';
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

    // 주제가 없거나, 기사가 없거나, 기사가 3개월 이상 된 경우 재생성 필요
    const needsGeneration = !topic || !article || article.updatedAt < threeMonthsAgo;

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

        // 링크 파싱 [[Keyword]]
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
                update: { content, language }, // Language shouldn't verify update but safe
                create: { topicId: t.id, content, language }
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
                } catch (e) {
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
                } catch (e) {
                    // 무시
                }
            }

            // D. Neo4j 그래프 동기화
            // Graph represents CONCEPTS, so language agnostic logic is better?
            // Actually, node.name is mainTopicName (e.g. "black hole").
            // If user queries "블랙홀", canonical is "black hole" (if mapped).
            // But if "블랙홀" is the canonical name (e.g. first discovery was in KR), node name is "블랙홀".
            // It's acceptable for now.
            await syncArticleToGraph(neo4jTx, mainTopicName, linkedKeywords, tags);

            return t;
        });

        topicId = savedTopic.id;
        isNew = true;
    } else {
        // 캐시된 콘텐츠 반환
        content = article!.content;
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

        await prismaContent.shipLog.create({
            data: {
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
