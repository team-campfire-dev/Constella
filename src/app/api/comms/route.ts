import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prismaContent from "@/lib/prisma-content";
import prisma from "@/lib/prisma";
import logger from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import commsPubSub from "@/lib/comms-pubsub";
import { checkAndGrantAchievements } from "@/lib/achievements";

const RATE_LIMIT_WINDOW_MS = 1000; // 1 second per request for chat messages

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // 🛡️ Sentinel: Apply rate limiting to prevent spam
    if (!checkRateLimit('comms_post', userId, RATE_LIMIT_WINDOW_MS)) {
        logger.warn(`Rate limit exceeded for user: ${userId} on endpoint: comms_post`);
        return NextResponse.json({ error: 'You are sending messages too quickly.' }, { status: 429 });
    }

    try {
        const { message, channel = 'global' } = await req.json();

        if (!message) {
            return NextResponse.json({ error: 'Message is required' }, { status: 400 });
        }

        // 🛡️ Sentinel: Limit message length to prevent DoS and memory exhaustion
        if (message.length > 1000) {
            return NextResponse.json({ error: 'Message is too long' }, { status: 400 });
        }

        // 🛡️ Sentinel: Authorize channel access
        if (channel.startsWith('dm:')) {
            const participants = channel.replace('dm:', '').split('_');
            if (participants.length !== 2 || !participants.includes(userId)) {
                logger.warn(`Unauthorized Comms POST access attempt: user=${userId}, channel=${channel}`);
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }
            const expectedChannel = `dm:${[participants[0], participants[1]].sort().join('_')}`;
            if (channel !== expectedChannel) {
                logger.warn(`Invalid DM channel format attempt: user=${userId}, channel=${channel}`);
                return NextResponse.json({ error: 'Invalid channel format' }, { status: 400 });
            }
        } else if (channel.startsWith('expedition:')) {
            const expeditionId = channel.replace('expedition:', '');
            const membership = await prismaContent.expeditionMember.findUnique({
                where: { expeditionId_userId: { expeditionId, userId } }
            });
            if (!membership) {
                logger.warn(`Unauthorized Comms POST access attempt: user=${userId}, channel=${channel}`);
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }
        }

        // 0. Ensure User exists in Content DB (Sync)
        // Just in case, though normally done elsewhere
        await prismaContent.user.upsert({
            where: { id: userId },
            create: { id: userId },
            update: {}
        });

        // 1. Save Comms Message
        const newMsg = await prismaContent.commsMessage.create({
            data: {
                userId,
                content: message,
                channel
            }
        });

        // 2. Fetch User Details for response
        const userDetails = await prisma.user.findUnique({
            where: { id: userId },
            select: { name: true, image: true }
        });

        const messageData = {
            id: newMsg.id,
            content: newMsg.content,
            timestamp: newMsg.createdAt,
            channel,
            user: {
                id: userId,
                name: userDetails?.name || 'Unknown',
                image: userDetails?.image
            }
        };

        // 3. 📡 Publish to SSE subscribers for real-time delivery
        commsPubSub.emit(`comms:${channel}`, messageData);

        return NextResponse.json({
            success: true,
            data: messageData
        });
    } catch (error) {
        logger.error("Comms API Error", { error: error instanceof Error ? error.message : error });
        return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
    } finally {
        // 🏆 Fire-and-forget: check achievements after message send
        checkAndGrantAchievements(userId).catch(() => { });
    }
}

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const { searchParams } = new URL(req.url);
    const channel = searchParams.get('channel') || 'global';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const before = searchParams.get('before'); // ISO timestamp cursor for pagination

    // 🛡️ Sentinel: Authorize channel access
    if (channel.startsWith('dm:')) {
        const participants = channel.replace('dm:', '').split('_');
        if (participants.length !== 2 || !participants.includes(userId)) {
            logger.warn(`Unauthorized Comms GET access attempt: user=${userId}, channel=${channel}`);
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        const expectedChannel = `dm:${[participants[0], participants[1]].sort().join('_')}`;
        if (channel !== expectedChannel) {
            logger.warn(`Invalid DM channel format attempt: user=${userId}, channel=${channel}`);
            return NextResponse.json({ error: 'Invalid channel format' }, { status: 400 });
        }
    } else if (channel.startsWith('expedition:')) {
        const expeditionId = channel.replace('expedition:', '');
        const membership = await prismaContent.expeditionMember.findUnique({
            where: { expeditionId_userId: { expeditionId, userId } }
        });
        if (!membership) {
            logger.warn(`Unauthorized Comms GET access attempt: user=${userId}, channel=${channel}`);
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
    }

    try {
        // 1. Fetch messages from Content DB (with optional cursor pagination)
        const messages = await prismaContent.commsMessage.findMany({
            where: before
                ? { channel, createdAt: { lt: new Date(before) } }
                : { channel },
            orderBy: { createdAt: 'desc' }, // newest first for cursor pagination
            take: limit,
        });

        // Reverse to ascending order for display
        const sorted = [...messages].reverse();

        if (sorted.length === 0) {
            return NextResponse.json({ success: true, data: [] });
        }

        // 3. Collect User IDs
        const userIds = Array.from(new Set(sorted.map(m => m.userId))) as string[];

        // 4. Fetch User Details from Main DB
        const users = await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, image: true }
        });

        const userMap = new Map(users.map(u => [u.id, u]));

        // 5. Combine
        const enrichedMessages = sorted.map(msg => ({
            id: msg.id,
            content: msg.content,
            timestamp: msg.createdAt,
            user: {
                id: msg.userId,
                name: userMap.get(msg.userId)?.name || 'Unknown',
                image: userMap.get(msg.userId)?.image
            }
        }));

        return NextResponse.json({
            success: true,
            data: enrichedMessages
        });

    } catch (error) {
        logger.error("Fetch Comms Error", { error: error instanceof Error ? error.message : error });
        return NextResponse.json({ error: 'Failed to fetch comms' }, { status: 500 });
    }
}
