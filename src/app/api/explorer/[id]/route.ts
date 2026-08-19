import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import prismaContent from "@/lib/prisma-content";
import logger from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";

const RATE_LIMIT_WINDOW_MS = 1000;

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!checkRateLimit('explorer_get', session.user.id, RATE_LIMIT_WINDOW_MS)) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const { id } = await params;

    try {
        // 1. Fetch user from Main DB
        const user = await prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                image: true,
                bio: true,
                emailVerified: true, // used as proxy for join date
            }
        });

        if (!user) {
            return NextResponse.json({ error: 'Explorer not found' }, { status: 404 });
        }

        // 2. Fetch exploration stats from Content DB
        const { searchParams } = new URL(req.url);
        const lang = searchParams.get('lang') || 'en';

        const [totalDiscoveries, shipLogs] = await Promise.all([
            prismaContent.shipLog.count({
                where: { userId: id }
            }),
            prismaContent.shipLog.findMany({
                where: { userId: id },
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
                take: 10 // Recent 10 topics
            })
        ]);

        // 3. Count first discoveries (topics where this user was the first to discover)
        // 🛡️ Sentinel: N+1 OOM vulnerability fixed using groupBy and Map
        let firstDiscoveries = 0;
        if (totalDiscoveries > 0) {
            // Get all this user's shipLogs with their discoveredAt
            const userLogs = await prismaContent.shipLog.findMany({
                where: { userId: id },
                select: { topicId: true, discoveredAt: true }
            });

            const topicIds = Array.from(new Set(userLogs.map(log => log.topicId)));

            // Pre-compute earliest discoveries only for the topics this user has discovered
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

            for (const log of userLogs) {
                const earliestTime = earliestDiscoveryMap.get(log.topicId);
                if (earliestTime !== undefined && log.discoveredAt.getTime() === earliestTime) {
                    firstDiscoveries++;
                }
            }
        }

        // 4. Format recent topics
        const recentTopics = shipLogs.map(log => ({
            id: log.topic.id,
            name: log.topic.articles[0]?.title || log.topic.name,
            discoveredAt: log.discoveredAt
        }));

        // 5. Follow stats
        const [followersCount, followingCount, isFollowing] = await Promise.all([
            prismaContent.follow.count({ where: { followingId: id } }),
            prismaContent.follow.count({ where: { followerId: id } }),
            session.user.id !== id
                ? prismaContent.follow.findUnique({
                    where: {
                        followerId_followingId: {
                            followerId: session.user.id,
                            followingId: id
                        }
                    }
                }).then(f => !!f)
                : Promise.resolve(false)
        ]);

        return NextResponse.json({
            success: true,
            data: {
                id: user.id,
                name: user.name || 'Unknown Explorer',
                image: user.image,
                bio: user.bio,
                isOwnProfile: session.user.id === id,
                isFollowing,
                stats: {
                    totalDiscoveries,
                    firstDiscoveries,
                    followers: followersCount,
                    following: followingCount,
                },
                recentTopics
            }
        });
    } catch (error) {
        logger.error("Explorer API Error", { error: error instanceof Error ? error.message : error });
        return NextResponse.json({ error: 'Failed to fetch explorer profile' }, { status: 500 });
    }
}
