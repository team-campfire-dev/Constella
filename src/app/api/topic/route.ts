import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prismaContent from "@/lib/prisma-content";
import logger from "@/lib/logger";
import { processUserQuery } from "@/lib/wiki-engine";

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const name = searchParams.get('name');
    const lang = searchParams.get('lang') || 'en';

    if (!id && !name) {
        return NextResponse.json({ error: 'Topic ID or Name is required' }, { status: 400 });
    }

    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const userId = (session.user as any).id;

        // Find Topic first (by ID or Name)
        let topic;

        if (id) {
            topic = await prismaContent.topic.findUnique({
                where: { id },
                include: {
                    articles: { where: { language: lang } },
                    tags: true
                }
            });
        } else if (name) {
            // Normalize name (lowercase) for lookup
            topic = await prismaContent.topic.findUnique({
                where: { name: name.trim().toLowerCase() },
                include: {
                    articles: { where: { language: lang } },
                    tags: true
                }
            });
        }

        if (!topic) {
            return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
        }

        // Verify Access (ShipLog)
        const canAccess = await prismaContent.shipLog.findUnique({
            where: {
                userId_topicId: { userId, topicId: topic.id }
            }
        });

        if (!canAccess) {
            // Return simplified response for undiscovered topics (so frontend knows it exists but is locked)
            // Or just return 403. Frontend handles 403 as "Go to Chat".
            return NextResponse.json({ error: 'Undiscovered topic.' }, { status: 403 });
        }

        // ... continue with article generation/return

        // 2. If Article in requested language is missing, Generate it!
        let article = topic.articles[0];

        if (!article || !article.content) {
            // We have the topic name, so we can ask the WikiEngine to fill in this language
            // processUserQuery handles finding the topic by name and adding the article
            await processUserQuery(userId, topic.name, lang);

            // Re-fetch to get the new article
            const refreshedTopic = await prismaContent.topic.findUnique({
                where: { id },
                include: {
                    articles: { where: { language: lang } },
                    tags: true
                }
            });

            if (refreshedTopic && refreshedTopic.articles[0]) {
                topic = refreshedTopic;
                article = refreshedTopic.articles[0];
            }
        }

        return NextResponse.json({
            success: true,
            data: {
                id: topic.id,
                name: topic.name,
                content: article?.content || "Data corrupted. Translation failed.",
                language: article?.language || lang,
                updatedAt: article?.updatedAt || new Date(),
                tags: topic.tags.map(t => t.name)
            }
        });
    } catch (error) {
        logger.error("Fetch Topic Error", { error: error instanceof Error ? error.message : error });
        return NextResponse.json({ error: 'Failed to fetch topic' }, { status: 500 });
    }
}
