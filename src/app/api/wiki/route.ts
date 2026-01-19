import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import logger from "@/lib/logger";
import { withDualTransaction } from '@/lib/transaction';
import { syncArticleToGraph } from '@/lib/graph';

export async function POST(req: Request) {
    // 1. 인증 확인
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { title, content } = body;

        if (!title || !content) {
            return NextResponse.json({ error: 'Title and content are required' }, { status: 400 });
        }

        // 2. 수동 제출을 위한 듀얼 트랜잭션
        // 참고: 새로운 Schema (Topic + WikiArticle)를 사용합니다.
        // Manual submission implies we treat 'title' as the Topic Name.

        await withDualTransaction(async (prismaTx, neo4jTx) => {
            // A. 주제(Topic) 찾기 또는 생성 (이름 정규화)
            const normalizedTitle = title.trim().toLowerCase();

            // 이름으로 기존 Topic 확인
            const topic = await prismaTx.topic.upsert({
                where: { name: normalizedTitle },
                update: {},
                create: { name: normalizedTitle }
            });

            // B. 기사(WikiArticle) 생성 또는 업데이트
            // Note: 'authorId' is not in the schema anymore as it's a shared wiki (wiki-engine style).
            // Ideally we should track who edited it (Review Log/History), but for now we just save content.
            await prismaTx.wikiArticle.upsert({
                where: {
                    topicId_language: {
                        topicId: topic.id,
                        language: 'en' // Assuming 'en' is the default language for upsert based on the create clause
                    }
                },
                update: {
                    content: content,
                    updatedAt: new Date()
                },
                create: {
                    topicId: topic.id,
                    content: content,
                    language: 'en' // 기본값 en
                }
            });

            // C. 별칭(Alias) 생성 (화면 표시 제목이 정규화된 제목과 다른 경우)
            if (title.trim() !== normalizedTitle) {
                try {
                    await prismaTx.alias.upsert({
                        where: { name: title.trim() },
                        update: {},
                        create: { name: title.trim(), topicId: topic.id }
                    });
                } catch {
                    // 별칭 충돌 무시
                }
            }

            // D. 그래프 동기화
            const linkRegex = /\[\[(.*?)\]\]/g;
            const matches = [...content.matchAll(linkRegex)];
            const linkedKeywords = matches.map(match => match[1]);

            await syncArticleToGraph(neo4jTx, normalizedTitle, linkedKeywords);
        });

        return NextResponse.json({ success: true });

    } catch (e) {
        logger.error("Wiki processing error", { error: e });
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
