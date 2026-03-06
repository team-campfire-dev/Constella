import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prismaContent from "@/lib/prisma-content";
import prisma from "@/lib/prisma";
import logger from "@/lib/logger";

// POST /api/follow — Follow a user (Add to Crew)
export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    try {
        const { targetUserId } = await req.json();

        if (!targetUserId || targetUserId === userId) {
            return NextResponse.json({ error: 'Invalid target user' }, { status: 400 });
        }

        // Ensure both users exist in Content DB
        await prismaContent.user.upsert({ where: { id: userId }, create: { id: userId }, update: {} });
        await prismaContent.user.upsert({ where: { id: targetUserId }, create: { id: targetUserId }, update: {} });

        // Create follow relationship
        await prismaContent.follow.create({
            data: {
                followerId: userId,
                followingId: targetUserId
            }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        // Handle duplicate follow
        if (error instanceof Error && error.message.includes('Unique constraint')) {
            return NextResponse.json({ error: 'Already following this explorer' }, { status: 409 });
        }
        logger.error("Follow API Error", { error: error instanceof Error ? error.message : error });
        return NextResponse.json({ error: 'Failed to follow user' }, { status: 500 });
    }
}

// DELETE /api/follow — Unfollow a user (Remove from Crew)
export async function DELETE(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    try {
        const { targetUserId } = await req.json();

        if (!targetUserId) {
            return NextResponse.json({ error: 'Target user ID required' }, { status: 400 });
        }

        await prismaContent.follow.delete({
            where: {
                followerId_followingId: {
                    followerId: userId,
                    followingId: targetUserId
                }
            }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error("Unfollow API Error", { error: error instanceof Error ? error.message : error });
        return NextResponse.json({ error: 'Failed to unfollow user' }, { status: 500 });
    }
}

// GET /api/follow — Get my crew list (following) + check if following a specific user
export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(req.url);
    const checkUserId = searchParams.get('check'); // Check if following a specific user

    try {
        if (checkUserId) {
            // Check if current user follows checkUserId
            const follow = await prismaContent.follow.findUnique({
                where: {
                    followerId_followingId: {
                        followerId: userId,
                        followingId: checkUserId
                    }
                }
            });
            return NextResponse.json({ success: true, isFollowing: !!follow });
        }

        // Get full crew list (users I'm following)
        const following = await prismaContent.follow.findMany({
            where: { followerId: userId },
            select: { followingId: true, createdAt: true }
        });

        // Fetch user details from Main DB
        const userIds = following.map(f => f.followingId);
        const users = await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, image: true }
        });

        const userMap = new Map(users.map(u => [u.id, u]));

        const crew = following.map(f => ({
            id: f.followingId,
            name: userMap.get(f.followingId)?.name || 'Unknown Explorer',
            image: userMap.get(f.followingId)?.image || null,
            followedAt: f.createdAt
        }));

        return NextResponse.json({ success: true, data: crew });
    } catch (error) {
        logger.error("Get Follow API Error", { error: error instanceof Error ? error.message : error });
        return NextResponse.json({ error: 'Failed to fetch crew' }, { status: 500 });
    }
}
