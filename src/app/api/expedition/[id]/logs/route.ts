import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prismaContent from "@/lib/prisma-content";
import logger from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";

const RATE_LIMIT_WINDOW_MS = 1000;

/**
 * POST /api/expedition/{id}/logs — Share a topic with the expedition
 * Body: { topicId }
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const userId = session.user.id;

    // 🛡️ Sentinel: Apply rate limiting
    if (!checkRateLimit('expedition_log_post', userId, RATE_LIMIT_WINDOW_MS)) {
        logger.warn(`Rate limit exceeded for user: ${userId} on endpoint: expedition_log_post`);
        return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
    }

    try {
        // Verify membership
        const membership = await prismaContent.expeditionMember.findUnique({
            where: { expeditionId_userId: { expeditionId: id, userId } },
        });

        if (!membership) {
            return NextResponse.json({ error: 'Not a member of this expedition' }, { status: 403 });
        }

        const { topicId } = await req.json();
        if (!topicId) {
            return NextResponse.json({ error: 'topicId is required' }, { status: 400 });
        }

        // Verify the user has discovered this topic
        const personalLog = await prismaContent.shipLog.findUnique({
            where: { userId_topicId: { userId, topicId } },
        });

        if (!personalLog) {
            return NextResponse.json({ error: 'You must discover a topic before sharing it' }, { status: 400 });
        }

        // Add to expedition shared logs
        const log = await prismaContent.expeditionShipLog.create({
            data: {
                expeditionId: id,
                userId,
                topicId,
            },
        });

        return NextResponse.json({ success: true, data: { id: log.id } });
    } catch (error) {
        if (error instanceof Error && error.message.includes('Unique constraint')) {
            return NextResponse.json({ error: 'Topic already shared in this expedition' }, { status: 409 });
        }
        logger.error("Expedition share log error", { error: error instanceof Error ? error.message : error });
        return NextResponse.json({ error: 'Failed to share topic' }, { status: 500 });
    }
}
