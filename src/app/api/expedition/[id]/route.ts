import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prismaContent from "@/lib/prisma-content";
import prisma from "@/lib/prisma";
import logger from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";

const RATE_LIMIT_WINDOW_MS = 1000;

/**
 * GET /api/expedition/{id} — Expedition detail
 */
export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const userId = session.user.id;
    const { searchParams } = new URL(req.url);
    const lang = searchParams.get('lang') || 'en';

    try {
        const expedition = await prismaContent.expedition.findUnique({
            where: { id },
            include: {
                members: true,
                sharedLogs: {
                    include: {
                        topic: {
                            include: {
                                articles: { where: { language: lang }, select: { title: true } },
                            },
                        },
                    },
                    orderBy: { discoveredAt: 'desc' },
                },
            },
        });

        if (!expedition) {
            return NextResponse.json({ error: 'Expedition not found' }, { status: 404 });
        }

        // Verify membership
        const isMember = expedition.members.some(m => m.userId === userId);
        if (!isMember) {
            return NextResponse.json({ error: 'Not a member of this expedition' }, { status: 403 });
        }

        // Fetch member details
        const memberIds = expedition.members.map(m => m.userId);
        const memberDetails = await prisma.user.findMany({
            where: { id: { in: memberIds } },
            select: { id: true, name: true, image: true },
        });
        const memberMap = new Map(memberDetails.map(u => [u.id, u]));

        const members = expedition.members.map(m => ({
            id: m.id,
            userId: m.userId,
            name: memberMap.get(m.userId)?.name || 'Unknown',
            image: memberMap.get(m.userId)?.image || null,
            role: m.role,
            joinedAt: m.joinedAt,
        }));

        const sharedLogs = expedition.sharedLogs.map(log => ({
            id: log.id,
            topicId: log.topicId,
            topicName: log.topic.articles[0]?.title || log.topic.name,
            addedBy: log.userId,
            discoveredAt: log.discoveredAt,
        }));

        return NextResponse.json({
            success: true,
            data: {
                id: expedition.id,
                name: expedition.name,
                description: expedition.description,
                status: expedition.status,
                ownerId: expedition.ownerId,
                isOwner: expedition.ownerId === userId,
                members,
                sharedLogs,
                commsChannel: `expedition:${expedition.id}`,
                createdAt: expedition.createdAt,
            },
        });
    } catch (error) {
        logger.error("Expedition detail error", { error: error instanceof Error ? error.message : error });
        return NextResponse.json({ error: 'Failed to fetch expedition' }, { status: 500 });
    }
}

/**
 * PATCH /api/expedition/{id} — Update expedition (status, name, description)
 */
export async function PATCH(
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
    if (!checkRateLimit('expedition_patch', userId, RATE_LIMIT_WINDOW_MS)) {
        logger.warn(`Rate limit exceeded for user: ${userId} on endpoint: expedition_patch`);
        return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
    }

    try {
        const expedition = await prismaContent.expedition.findUnique({
            where: { id },
        });

        if (!expedition || expedition.ownerId !== userId) {
            return NextResponse.json({ error: 'Only the owner can update this expedition' }, { status: 403 });
        }

        const body = await req.json();
        const updateData: Record<string, string> = {};
        if (body.name) updateData.name = body.name.trim();
        if (body.description !== undefined) updateData.description = body.description?.trim() || '';
        if (body.status && ['active', 'completed', 'archived'].includes(body.status)) {
            updateData.status = body.status;
        }

        const updated = await prismaContent.expedition.update({
            where: { id },
            data: updateData,
        });

        return NextResponse.json({ success: true, data: { id: updated.id, status: updated.status } });
    } catch (error) {
        logger.error("Expedition update error", { error: error instanceof Error ? error.message : error });
        return NextResponse.json({ error: 'Failed to update expedition' }, { status: 500 });
    }
}

/**
 * DELETE /api/expedition/{id} — Delete expedition (owner only)
 */
export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const userId = session.user.id;

    try {
        const expedition = await prismaContent.expedition.findUnique({ where: { id } });

        if (!expedition || expedition.ownerId !== userId) {
            return NextResponse.json({ error: 'Only the owner can delete this expedition' }, { status: 403 });
        }

        await prismaContent.expedition.delete({ where: { id } });

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error("Expedition delete error", { error: error instanceof Error ? error.message : error });
        return NextResponse.json({ error: 'Failed to delete expedition' }, { status: 500 });
    }
}
