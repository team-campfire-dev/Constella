import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { processUserQuery } from "@/lib/wiki-engine";
import prismaContent from "@/lib/prisma-content";
import logger from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkAndGrantAchievements } from "@/lib/achievements";

const RATE_LIMIT_WINDOW_MS = 3000; // 3 seconds per request

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // 🛡️ Sentinel: Apply rate limiting
    if (!checkRateLimit('chat', userId, RATE_LIMIT_WINDOW_MS)) {
        logger.warn(`Rate limit exceeded for user: ${userId} on endpoint: chat`);
        return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
    }

    try {
        const { message, language } = await req.json();

        if (!message) {
            return NextResponse.json({ error: 'Message is required' }, { status: 400 });
        }

        // 🛡️ Sentinel: Limit message length to prevent DoS and memory exhaustion
        if (message.length > 1000) {
            return NextResponse.json({ error: 'Message is too long' }, { status: 400 });
        }

        // 0. Ensure User exists in Content DB (Sync)
        await prismaContent.user.upsert({
            where: { id: userId },
            create: { id: userId },
            update: {}
        });

        // 1. Save User Message
        await prismaContent.chatHistory.create({
            data: {
                userId,
                role: 'user',
                content: message
            }
        });

        // Wiki Engine Query
        // Fetch recent conversation history for context continuity
        const recentHistory = await prismaContent.chatHistory.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: { role: true, content: true }
        });

        // Reverse to chronological order and map to ChatHistoryEntry format
        const chatHistory = recentHistory.reverse().map(msg => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content
        }));

        const wikiResult = await processUserQuery(userId, message, language, chatHistory);

        // Save AI Response to Chat History (Content DB)
        // Note: We save the "answer" (chat response) to chat history, but the "content" (wiki data) is already saved in WikiArticle.
        // topicId lets the history reload restore the "View Wiki" affordance, and gives the
        // server its own record of what the last turn was about (instead of asking the model again).
        // Rejected queries return an empty topicId — store null, not "".
        await prismaContent.chatHistory.create({
            data: {
                userId,
                role: 'assistant',
                content: wikiResult.answer,
                topicId: wikiResult.topicId || null
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
    } finally {
        // 🏆 Fire-and-forget: check achievements after response
        checkAndGrantAchievements(userId).catch(() => { });
    }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    try {
        // 최신 50개를 가져온 뒤 시간순으로 되돌린다.
        // 'asc' + take는 가장 오래된 50개를 집어오므로, 메시지가 50개를 넘긴
        // 사용자는 최근 대화를 영영 볼 수 없었다. (POST 쪽 최근 10개 조회와 같은 패턴)
        const history = (await prismaContent.chatHistory.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 50
        })).reverse();

        return NextResponse.json({
            success: true,
            data: history.map(msg => ({
                id: msg.id,
                role: msg.role,
                content: msg.content,
                topicId: msg.topicId,
                timestamp: msg.createdAt
            }))
        });
    } catch (error) {
        logger.error("Fetch History Error", { error: error instanceof Error ? error.message : error });
        return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
    }
}
