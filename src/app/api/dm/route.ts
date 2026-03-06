import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prismaContent from "@/lib/prisma-content";
import prisma from "@/lib/prisma";
import logger from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import commsPubSub from "@/lib/comms-pubsub";

const RATE_LIMIT_WINDOW_MS = 1000;

/**
 * Generate a consistent DM channel ID from two user IDs.
 * Always sorts alphabetically for consistency.
 */
function getDmChannelId(userA: string, userB: string): string {
    const sorted = [userA, userB].sort();
    return `dm:${sorted[0]}_${sorted[1]}`;
}

/**
 * GET /api/dm
 * - No params: list all DM conversations for the current user
 * - ?partner={userId}: get message history with a specific user
 */
export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(req.url);
    const partnerId = searchParams.get('partner');

    try {
        if (partnerId) {
            // === Get DM history with a specific partner ===
            const channel = getDmChannelId(userId, partnerId);

            const messages = await prismaContent.commsMessage.findMany({
                where: { channel },
                orderBy: { createdAt: 'asc' },
                take: 100,
            });

            // Fetch user details for all participants
            const allUserIds = Array.from(new Set(messages.map(m => m.userId)));
            const users = await prisma.user.findMany({
                where: { id: { in: allUserIds } },
                select: { id: true, name: true, image: true },
            });
            const userMap = new Map(users.map(u => [u.id, u]));

            const enriched = messages.map(msg => ({
                id: msg.id,
                content: msg.content,
                timestamp: msg.createdAt,
                user: {
                    id: msg.userId,
                    name: userMap.get(msg.userId)?.name || 'Unknown',
                    image: userMap.get(msg.userId)?.image || null,
                },
            }));

            // Also fetch partner info
            const partner = await prisma.user.findUnique({
                where: { id: partnerId },
                select: { id: true, name: true, image: true },
            });

            return NextResponse.json({
                success: true,
                data: {
                    channel,
                    partner: partner || { id: partnerId, name: 'Unknown', image: null },
                    messages: enriched,
                },
            });
        } else {
            // === List all DM conversations ===
            // Find all DM channels this user participates in
            const dmMessages = await prismaContent.commsMessage.findMany({
                where: {
                    channel: { startsWith: 'dm:' },
                    OR: [
                        { channel: { contains: userId } },
                    ],
                },
                orderBy: { createdAt: 'desc' },
            });

            // Group by channel, keep only the latest message per channel
            const channelMap = new Map<string, typeof dmMessages[0]>();
            for (const msg of dmMessages) {
                // Verify this user is actually in the channel
                if (!msg.channel.includes(userId)) continue;
                if (!channelMap.has(msg.channel)) {
                    channelMap.set(msg.channel, msg);
                }
            }

            // Extract partner IDs
            const conversations = Array.from(channelMap.entries()).map(([channel, lastMsg]) => {
                // Channel format: dm:{userIdA}_{userIdB}
                const parts = channel.replace('dm:', '').split('_');
                const partnerId = parts[0] === userId ? parts[1] : parts[0];
                return {
                    channel,
                    partnerId,
                    lastMessage: lastMsg.content,
                    lastTimestamp: lastMsg.createdAt,
                };
            });

            // Fetch partner details
            const partnerIds = conversations.map(c => c.partnerId);
            const partners = await prisma.user.findMany({
                where: { id: { in: partnerIds } },
                select: { id: true, name: true, image: true },
            });
            const partnerMap = new Map(partners.map(u => [u.id, u]));

            const enriched = conversations.map(c => ({
                channel: c.channel,
                partner: {
                    id: c.partnerId,
                    name: partnerMap.get(c.partnerId)?.name || 'Unknown',
                    image: partnerMap.get(c.partnerId)?.image || null,
                },
                lastMessage: c.lastMessage.length > 50
                    ? c.lastMessage.slice(0, 50) + '...'
                    : c.lastMessage,
                lastTimestamp: c.lastTimestamp,
            }));

            return NextResponse.json({
                success: true,
                data: enriched,
            });
        }
    } catch (error) {
        logger.error("DM API GET Error", { error: error instanceof Error ? error.message : error });
        return NextResponse.json({ error: 'Failed to fetch DMs' }, { status: 500 });
    }
}

/**
 * POST /api/dm
 * Send a new DM message
 * Body: { recipientId, message }
 */
export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    if (!checkRateLimit('dm_post', userId, RATE_LIMIT_WINDOW_MS)) {
        return NextResponse.json({ error: 'Too many messages.' }, { status: 429 });
    }

    try {
        const { recipientId, message } = await req.json();

        if (!recipientId || !message?.trim()) {
            return NextResponse.json({ error: 'recipientId and message are required' }, { status: 400 });
        }

        if (recipientId === userId) {
            return NextResponse.json({ error: 'Cannot send DM to yourself' }, { status: 400 });
        }

        const channel = getDmChannelId(userId, recipientId);

        // Ensure users exist in content DB
        await prismaContent.user.upsert({ where: { id: userId }, create: { id: userId }, update: {} });
        await prismaContent.user.upsert({ where: { id: recipientId }, create: { id: recipientId }, update: {} });

        // Save message
        const newMsg = await prismaContent.commsMessage.create({
            data: {
                userId,
                content: message.trim(),
                channel,
            },
        });

        // Fetch sender details
        const sender = await prisma.user.findUnique({
            where: { id: userId },
            select: { name: true, image: true },
        });

        const messageData = {
            id: newMsg.id,
            content: newMsg.content,
            timestamp: newMsg.createdAt,
            channel,
            user: {
                id: userId,
                name: sender?.name || 'Unknown',
                image: sender?.image || null,
            },
        };

        // Publish via SSE to both the DM channel
        commsPubSub.emit(`comms:${channel}`, messageData);

        return NextResponse.json({ success: true, data: messageData });
    } catch (error) {
        logger.error("DM API POST Error", { error: error instanceof Error ? error.message : error });
        return NextResponse.json({ error: 'Failed to send DM' }, { status: 500 });
    }
}
