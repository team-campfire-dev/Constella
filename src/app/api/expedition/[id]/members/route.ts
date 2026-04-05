import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prismaContent from "@/lib/prisma-content";
import prisma from "@/lib/prisma";
import logger from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";

const RATE_LIMIT_WINDOW_MS = 1000;

/**
 * POST /api/expedition/{id}/members — Add a member
 * Body: { userId }
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
    const currentUserId = session.user.id;

    // 🛡️ Sentinel: Apply rate limiting
    if (!checkRateLimit('expedition_member_post', currentUserId, RATE_LIMIT_WINDOW_MS)) {
        logger.warn(`Rate limit exceeded for user: ${currentUserId} on endpoint: expedition_member_post`);
        return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
    }

    try {
        // Verify the requester is a member (owner can invite)
        const membership = await prismaContent.expeditionMember.findUnique({
            where: { expeditionId_userId: { expeditionId: id, userId: currentUserId } },
        });

        if (!membership) {
            return NextResponse.json({ error: 'Not a member of this expedition' }, { status: 403 });
        }

        const { userId: targetUserId } = await req.json();
        if (!targetUserId) {
            return NextResponse.json({ error: 'userId is required' }, { status: 400 });
        }

        // 🛡️ Sentinel: Verify target user exists in Main DB before writing to Content DB (prevent IDOR/Ghost Users)
        const targetUserExists = await prisma.user.findUnique({ where: { id: targetUserId } });
        if (!targetUserExists) {
            return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
        }

        // Ensure target user exists in content DB
        await prismaContent.user.upsert({
            where: { id: targetUserId },
            create: { id: targetUserId },
            update: {},
        });

        // Add member
        await prismaContent.expeditionMember.create({
            data: {
                expeditionId: id,
                userId: targetUserId,
                role: 'member',
            },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        // Handle unique constraint (already a member)
        if (error instanceof Error && error.message.includes('Unique constraint')) {
            return NextResponse.json({ error: 'Already a member' }, { status: 409 });
        }
        logger.error("Expedition add member error", { error: error instanceof Error ? error.message : error });
        return NextResponse.json({ error: 'Failed to add member' }, { status: 500 });
    }
}

/**
 * DELETE /api/expedition/{id}/members — Remove a member or leave
 * Body: { userId } (owner removes) or no body (self-leave)
 */
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const currentUserId = session.user.id;

    // 🛡️ Sentinel: Apply rate limiting
    if (!checkRateLimit('expedition_member_delete', currentUserId, RATE_LIMIT_WINDOW_MS)) {
        logger.warn(`Rate limit exceeded for user: ${currentUserId} on endpoint: expedition_member_delete`);
        return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
    }

    try {
        const body = await req.json().catch(() => ({})) as { userId?: string };
        const targetUserId = body.userId || currentUserId;

        // If removing someone else, verify requester is owner
        if (targetUserId !== currentUserId) {
            const expedition = await prismaContent.expedition.findUnique({ where: { id } });
            if (!expedition || expedition.ownerId !== currentUserId) {
                return NextResponse.json({ error: 'Only the owner can remove members' }, { status: 403 });
            }
        }

        // Cannot remove the owner
        const expedition = await prismaContent.expedition.findUnique({ where: { id } });
        if (expedition?.ownerId === targetUserId) {
            return NextResponse.json({ error: 'Owner cannot leave. Delete the expedition instead.' }, { status: 400 });
        }

        await prismaContent.expeditionMember.delete({
            where: { expeditionId_userId: { expeditionId: id, userId: targetUserId } },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error("Expedition remove member error", { error: error instanceof Error ? error.message : error });
        return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 });
    }
}
