import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import prismaContent from "@/lib/prisma-content";
import logger from "@/lib/logger";

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const sort = searchParams.get('sort') || 'discoveries'; // discoveries, firstDiscoveries, achievements
    const cursor = searchParams.get('cursor');
    const take = 20;

    try {
        // 1. Get all users with ship log counts
        const users = await prismaContent.user.findMany({
            select: {
                id: true,
                _count: {
                    select: {
                        shipLogs: true,
                    },
                },
            },
        });

        if (users.length === 0) {
            return NextResponse.json({ success: true, data: [], nextCursor: null });
        }

        // 2. Calculate first discoveries and achievement counts for each user efficiently
        const userIds = users.map((u) => u.id);

        // Fetch all relevant shipLogs for these users to extract topicIds
        const allLogs = await prismaContent.shipLog.findMany({
            where: { userId: { in: userIds } },
            select: { userId: true, topicId: true, discoveredAt: true },
        });

        const topicIds = Array.from(new Set(allLogs.map((log) => log.topicId)));

        // Pre-compute earliest discoveries only for the topics these users have discovered
        const earliestDiscoveries = await prismaContent.shipLog.groupBy({
            by: ['topicId'],
            where: { topicId: { in: topicIds } },
            _min: { discoveredAt: true },
        });

        const earliestDiscoveryMap = new Map<string, number>();
        for (const ed of earliestDiscoveries) {
            if (ed._min.discoveredAt) {
                earliestDiscoveryMap.set(ed.topicId, ed._min.discoveredAt.getTime());
            }
        }

        // Count first discoveries per user
        const userFirstDiscoveriesMap = new Map<string, number>();
        for (const log of allLogs) {
            const earliestTime = earliestDiscoveryMap.get(log.topicId);
            if (earliestTime !== undefined && log.discoveredAt.getTime() === earliestTime) {
                const count = userFirstDiscoveriesMap.get(log.userId) || 0;
                userFirstDiscoveriesMap.set(log.userId, count + 1);
            }
        }

        // Pre-compute achievement counts per user, scoped to active users
        const achievementsGrouped = await prismaContent.achievement.groupBy({
            by: ['userId'],
            where: { userId: { in: userIds } },
            _count: { _all: true },
        });

        const achievementCountMap = new Map<string, number>();
        for (const a of achievementsGrouped) {
            achievementCountMap.set(a.userId, a._count._all);
        }

        const userMetrics = users.map((u) => ({
            userId: u.id,
            totalDiscoveries: u._count.shipLogs,
            firstDiscoveries: userFirstDiscoveriesMap.get(u.id) || 0,
            achievementCount: achievementCountMap.get(u.id) || 0,
        }));

        // 3. Sort
        const sortKey =
            sort === 'firstDiscoveries'
                ? 'firstDiscoveries'
                : sort === 'achievements'
                    ? 'achievementCount'
                    : 'totalDiscoveries';

        userMetrics.sort((a, b) => b[sortKey] - a[sortKey]);

        // 4. Cursor-based pagination
        let startIndex = 0;
        if (cursor) {
            const cursorIndex = userMetrics.findIndex(u => u.userId === cursor);
            if (cursorIndex >= 0) startIndex = cursorIndex + 1;
        }

        const page = userMetrics.slice(startIndex, startIndex + take);
        const nextCursor = page.length === take ? page[page.length - 1].userId : null;

        // 5. Fetch user details from main DB
        const pageUserIds = page.map(u => u.userId);
        const userDetails = await prisma.user.findMany({
            where: { id: { in: pageUserIds } },
            select: { id: true, name: true, image: true },
        });

        const userMap = new Map(userDetails.map(u => [u.id, u]));

        // 6. Combine
        const data = page.map((m, idx) => ({
            rank: startIndex + idx + 1,
            userId: m.userId,
            name: userMap.get(m.userId)?.name || 'Unknown Explorer',
            image: userMap.get(m.userId)?.image || null,
            totalDiscoveries: m.totalDiscoveries,
            firstDiscoveries: m.firstDiscoveries,
            achievementCount: m.achievementCount,
        }));

        return NextResponse.json({
            success: true,
            data,
            nextCursor,
        });
    } catch (error) {
        logger.error("Leaderboard API Error", { error: error instanceof Error ? error.message : error });
        return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
    }
}
