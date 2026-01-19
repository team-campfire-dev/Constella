import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { processUserQuery } from "@/lib/wiki-engine";
import prismaContent from "@/lib/prisma-content";
import logger from "@/lib/logger";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.email) {
        if (!session?.user && !('id' in (session?.user || {}))) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    const userId = (session?.user as any).id;

    try {
        const { message, language } = await req.json();

        if (!message) {
            return NextResponse.json({ error: 'Message is required' }, { status: 400 });
        }

        // 0. Ensure User exists in Content DB (Sync)
        await prismaContent.user.upsert({
            where: { id: userId },
            create: { id: userId },
            update: {}
        });

        // 1. Save User Message
        const userMsg = await prismaContent.chatHistory.create({
            data: {
                userId,
                role: 'user',
                content: message
            }
        });

        // Wiki Engine Query
        const wikiResult = await processUserQuery(userId, message, language);

        // Save AI Response to Chat History (Content DB)
        // Note: We save the "answer" (chat response) to chat history, but the "content" (wiki data) is already saved in WikiArticle.
        await prismaContent.chatHistory.create({
            data: {
                userId,
                role: 'assistant',
                content: wikiResult.answer
            }
        });

        return NextResponse.json({
            success: true,
            role: 'assistant',
            content: wikiResult.answer,
            isNew: wikiResult.isNew,
            topicId: wikiResult.topicId
        });
    } catch (error) {
        logger.error("Chat API Error", { error: error instanceof Error ? error.message : error });
        return NextResponse.json({ error: 'Failed to process query' }, { status: 500 });
    }
}

export async function GET(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id;

    try {
        const history = await prismaContent.chatHistory.findMany({
            where: { userId },
            orderBy: { createdAt: 'asc' },
            take: 50
        });

        return NextResponse.json({
            success: true,
            data: history.map(msg => ({
                id: msg.id,
                role: msg.role,
                content: msg.content,
                timestamp: msg.createdAt
            }))
        });
    } catch (error) {
        logger.error("Fetch History Error", { error: error instanceof Error ? error.message : error });
        return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
    }
}
