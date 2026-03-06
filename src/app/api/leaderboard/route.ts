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

        // 2. Calculate first discoveries and achievement counts for each user
        const userMetrics = await Promise.all(
            users.map(async (u) => {
                let firstDiscoveries = 0;
                if (u._count.shipLogs > 0) {
                    const logs = await prismaContent.shipLog.findMany({
                        where: { userId: u.id },
                        select: { topicId: true, discoveredAt: true },
                    });
                    for (const log of logs) {
                        const earlier = await prismaContent.shipLog.findFirst({
                            where: {
                                topicId: log.topicId,
                                discoveredAt: { lt: log.discoveredAt },
                            },
                            select: { id: true },
                        });
                        if (!earlier) firstDiscoveries++;
                    }
                }

                const achievementCount = await prismaContent.achievement.count({
                    where: { userId: u.id },
                });

                return {
                    userId: u.id,
                    totalDiscoveries: u._count.shipLogs,
                    firstDiscoveries,
                    achievementCount,
                };
            })
        );

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
        const userIds = page.map(u => u.userId);
        const userDetails = await prisma.user.findMany({
            where: { id: { in: userIds } },
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
