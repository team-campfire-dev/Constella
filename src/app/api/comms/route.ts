import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prismaContent from "@/lib/prisma-content";
import prisma from "@/lib/prisma";
import logger from "@/lib/logger";

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    try {
        const { message, channel = 'global' } = await req.json();

        if (!message) {
            return NextResponse.json({ error: 'Message is required' }, { status: 400 });
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

        return NextResponse.json({
            success: true,
            data: {
                id: newMsg.id,
                content: newMsg.content,
                timestamp: newMsg.createdAt,
                user: {
                    id: userId,
                    name: userDetails?.name || 'Unknown',
                    image: userDetails?.image
                }
            }
        });
    } catch (error) {
        logger.error("Comms API Error", { error: error instanceof Error ? error.message : error });
        return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const channel = searchParams.get('channel') || 'global';
    // Optional: cursor pagination or limit

    try {
        // 1. Fetch messages from Content DB
        const messages = await prismaContent.commsMessage.findMany({
            where: { channel },
            orderBy: { createdAt: 'asc' },
            take: 50 // Last 50 messages
        });

        if (messages.length === 0) {
            return NextResponse.json({ success: true, data: [] });
        }

        // 2. Collect User IDs
        const userIds = Array.from(new Set(messages.map(m => m.userId)));

        // 3. Fetch User Details from Main DB
        const users = await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, image: true }
        });

        const userMap = new Map(users.map(u => [u.id, u]));

        // 4. Combine
        const enrichedMessages = messages.map(msg => ({
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
