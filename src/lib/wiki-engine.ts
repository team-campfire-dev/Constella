import prisma from '@/lib/prisma'; // Main DB (User)
import prismaContent from '@/lib/prisma-content'; // Content DB
import { withDualTransaction } from '@/lib/transaction';
import { syncArticleToGraph } from '@/lib/graph';
import { generateWikiContent } from '@/lib/gemini';

interface WikiResponse {
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
        include: { article: true }
    });

    // 이름으로 찾지 못한 경우 별칭 테이블 검색
    if (!topic) {
        const alias = await prismaContent.alias.findUnique({
            where: { name: query.trim() },
            include: { topic: { include: { article: true } } }
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
    let isNew = false;
    let topicId = topic?.id;

    // 주제가 없거나, 기사가 없거나, 기사가 3개월 이상 된 경우 재생성 필요
    const needsGeneration = !topic || !topic.article || topic.article.updatedAt < threeMonthsAgo;

    if (needsGeneration) {
        console.log(`[WikiEngine] 콘텐츠 생성 중: ${query}`);

        // 3. AI 콘텐츠 생성
        const generated = await generateWikiContent(query, language);
        content = generated.content;
        const extractedTopicName = generated.topic.trim();
        const mainTopicName = extractedTopicName.toLowerCase(); // DB Key

        // 링크 파싱 [[Keyword]]
        const linkRegex = /\[\[(.*?)\]\]/g;
        const matches = [...content.matchAll(linkRegex)];
        const linkedKeywords = matches.map(match => match[1]);

        // 4. 듀얼 트랜잭션 (Content DB + Neo4j)
        const savedTopic = await withDualTransaction(async (prismaTx, neo4jTx) => {
            // A. 주제(Topic) 생성 또는 업데이트 (AI가 추출한 주제명 사용)
            const t = await prismaTx.topic.upsert({
                where: { name: mainTopicName },
                update: {},
                create: { name: mainTopicName }
            });

            // B. 기사(Article) 생성 또는 업데이트
            await prismaTx.wikiArticle.upsert({
                where: { topicId: t.id },
                update: { content, language },
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

            // 2) AI가 추출한 주제의 원본 표기 (대소문자 포함) -> 주제
            // 예: "Black Hole" (Alias) -> "black hole" (Topic)
            if (extractedTopicName !== mainTopicName) {
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
            await syncArticleToGraph(neo4jTx, mainTopicName, linkedKeywords);

            return t;
        });

        topicId = savedTopic.id;
        isNew = true;
    } else {
        // 캐시된 콘텐츠 반환
        content = topic!.article!.content;
        topicId = topic!.id;
    }

    // 5. 탐사 기록(ShipLog) 업데이트 (Content DB - constella)
    // 트랜잭션 외부에서 실행 (발견 자체는 성공/실패가 콘텐츠 생성에 영향을 주지 않도록)
    try {
        // Ensure User exists in Content DB (Sync purpose)
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
        console.error("[WikiEngine] ShipLog 업데이트 실패:", e);
        // 이미 발견한 경우(Unique 제약조건) 무시
    }

    return { content, isNew, topicId: topicId! };
}
