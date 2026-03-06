import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prismaContent from "@/lib/prisma-content";
import prisma from "@/lib/prisma";
import logger from "@/lib/logger";

// GET /api/feed — Discovery Feed (all explorers or crew only)
export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(req.url);
    const filter = searchParams.get('filter') || 'all'; // 'all' or 'crew'
    const lang = searchParams.get('lang') || 'en';
    const cursor = searchParams.get('cursor'); // pagination cursor (ShipLog id)
    const limit = 20;

    try {
        // Build user filter for crew mode
        let userFilter: { userId?: { in: string[] } } = {};
        if (filter === 'crew') {
            const following = await prismaContent.follow.findMany({
                where: { followerId: userId },
                select: { followingId: true }
            });
            const crewIds = following.map(f => f.followingId);
            // Include self in crew feed
            crewIds.push(userId);
            userFilter = { userId: { in: crewIds } };
        }

        // Fetch discoveries
        const shipLogs = await prismaContent.shipLog.findMany({
            where: {
                ...userFilter,
                ...(cursor ? { id: { lt: cursor } } : {})
            },
            include: {
                topic: {
                    include: {
                        articles: {
                            where: { language: lang },
                            select: { title: true }
                        }
                    }
                }
            },
            orderBy: { discoveredAt: 'desc' },
            take: limit + 1 // Fetch one extra for pagination check
        });

        const hasMore = shipLogs.length > limit;
        const items = shipLogs.slice(0, limit);

        // Fetch user details from Main DB
        const userIds = [...new Set(items.map(log => log.userId))];
        const users = await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, image: true }
        });
        const userMap = new Map(users.map(u => [u.id, u]));

        const feed = items.map(log => ({
            id: log.id,
            user: {
                id: log.userId,
                name: userMap.get(log.userId)?.name || 'Unknown Explorer',
                image: userMap.get(log.userId)?.image || null
            },
            topic: {
                id: log.topic.id,
                name: log.topic.articles[0]?.title || log.topic.name
            },
            discoveredAt: log.discoveredAt
        }));

        return NextResponse.json({
            success: true,
            data: feed,
            nextCursor: hasMore ? items[items.length - 1].id : null
        });
    } catch (error) {
        logger.error("Feed API Error", { error: error instanceof Error ? error.message : error });
        return NextResponse.json({ error: 'Failed to fetch feed' }, { status: 500 });
    }
}
