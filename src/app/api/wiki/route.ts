import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
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

        // 2. 위키 링크 파싱 [[Link]]
        // Regex to find content inside [[ ]]
        const linkRegex = /\[\[(.*?)\]\]/g;
        const matches = [...content.matchAll(linkRegex)];
        const linkedKeywords = matches.map(match => match[1]);

        // 3. 듀얼 트랜잭션 실행 (MySQL + Neo4j)
        const result = await withDualTransaction(async (prismaTx, neo4jTx) => {
            // A. MySQL 저장 (컨텐츠 DB)
            const article = await prismaTx.wikiArticle.upsert({
                where: { title: title },
                update: {
                    content: content,
                    authorId: session.user.id || 'unknown',
                },
                create: {
                    title: title,
                    content: content,
                    authorId: session.user.id || 'unknown',
                },
            });

            // B. Neo4j 그래프 동기화
            await syncArticleToGraph(neo4jTx, title, linkedKeywords);

            return article;
        });

        return NextResponse.json({
            success: true,
            data: {
                article: result,
                links: linkedKeywords
            }
        });

    } catch (error) {
        console.error('Wiki Article Creation Failed:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
