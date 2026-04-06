/**
 * 🏆 Achievement Engine
 * Checks and grants achievements for a user based on their activity.
 * Called after key actions: topic discovery, message send, etc.
 */

import prismaContent from '@/lib/prisma-content';
import logger from '@/lib/logger';

export interface AchievementDef {
    type: string;
    name: { en: string; ko: string };
    description: { en: string; ko: string };
    icon: string;
    tiers: {
        tier: number;
        threshold: number;
        label: { en: string; ko: string };
    }[];
}

export const ACHIEVEMENT_DEFINITIONS: AchievementDef[] = [
    {
        type: 'first_contact',
        name: { en: 'First Contact', ko: '첫 접촉' },
        description: { en: 'Discover topics', ko: '토픽을 발견하세요' },
        icon: '⭐',
        tiers: [
            { tier: 1, threshold: 1, label: { en: 'Bronze', ko: '브론즈' } },
            { tier: 2, threshold: 5, label: { en: 'Silver', ko: '실버' } },
            { tier: 3, threshold: 20, label: { en: 'Gold', ko: '골드' } },
        ],
    },
    {
        type: 'pioneer',
        name: { en: 'Pioneer', ko: '선구자' },
        description: { en: 'Be the first to discover topics', ko: '최초로 토픽을 발견하세요' },
        icon: '🚀',
        tiers: [
            { tier: 1, threshold: 1, label: { en: 'Bronze', ko: '브론즈' } },
            { tier: 2, threshold: 5, label: { en: 'Silver', ko: '실버' } },
            { tier: 3, threshold: 15, label: { en: 'Gold', ko: '골드' } },
        ],
    },
    {
        type: 'cartographer',
        name: { en: 'Cartographer', ko: '항해사' },
        description: { en: 'Use AI Chat', ko: 'AI 채팅을 이용하세요' },
        icon: '🗺️',
        tiers: [
            { tier: 1, threshold: 10, label: { en: 'Bronze', ko: '브론즈' } },
            { tier: 2, threshold: 50, label: { en: 'Silver', ko: '실버' } },
            { tier: 3, threshold: 200, label: { en: 'Gold', ko: '골드' } },
        ],
    },
    {
        type: 'social_butterfly',
        name: { en: 'Signal Master', ko: '교신왕' },
        description: { en: 'Send Comms messages', ko: 'Comms 메시지를 전송하세요' },
        icon: '📡',
        tiers: [
            { tier: 1, threshold: 10, label: { en: 'Bronze', ko: '브론즈' } },
            { tier: 2, threshold: 50, label: { en: 'Silver', ko: '실버' } },
            { tier: 3, threshold: 200, label: { en: 'Gold', ko: '골드' } },
        ],
    },
    {
        type: 'constellation_maker',
        name: { en: 'Constellation Maker', ko: '별자리 창조자' },
        description: { en: 'Discover connected topic clusters', ko: '연결된 토픽 클러스터를 발견하세요' },
        icon: '✨',
        tiers: [
            { tier: 1, threshold: 3, label: { en: 'Bronze', ko: '브론즈' } },
            { tier: 2, threshold: 5, label: { en: 'Silver', ko: '실버' } },
            { tier: 3, threshold: 10, label: { en: 'Gold', ko: '골드' } },
        ],
    },
    {
        type: 'deep_diver',
        name: { en: 'Deep Diver', ko: '심해 탐사가' },
        description: { en: 'Explore topics with many connections', ko: '많은 연결을 가진 토픽을 탐사하세요' },
        icon: '🌊',
        tiers: [
            { tier: 1, threshold: 3, label: { en: 'Bronze', ko: '브론즈' } },
            { tier: 2, threshold: 5, label: { en: 'Silver', ko: '실버' } },
            { tier: 3, threshold: 10, label: { en: 'Gold', ko: '골드' } },
        ],
    },
];

/**
 * Compute raw achievement metrics for a user
 */
async function computeMetrics(userId: string) {
    const [totalDiscoveries, totalChats, totalComms] = await Promise.all([
        prismaContent.shipLog.count({ where: { userId } }),
        prismaContent.chatHistory.count({ where: { userId, role: 'user' } }),
        prismaContent.commsMessage.count({ where: { userId } }),
    ]);

    // Count first discoveries (topics where this user discovered first)
    // 🛡️ Sentinel: N+1 OOM vulnerability fixed using groupBy and Map
    let firstDiscoveries = 0;
    if (totalDiscoveries > 0) {
        const userLogs = await prismaContent.shipLog.findMany({
            where: { userId },
            select: { topicId: true, discoveredAt: true },
        });

        const topicIds = Array.from(new Set(userLogs.map(log => log.topicId)));

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

    return {
        first_contact: totalDiscoveries,
        pioneer: firstDiscoveries,
        cartographer: totalChats,
        social_butterfly: totalComms,
        // constellation_maker and deep_diver require Neo4j queries;
        // we'll use totalDiscoveries as a proxy for now (can enhance later with graph analysis)
        constellation_maker: Math.floor(totalDiscoveries / 3), // approximate: clusters ≈ discoveries/3
        deep_diver: Math.floor(totalDiscoveries / 4), // approximate: deep topics ≈ discoveries/4
    };
}

/**
 * Check all achievements for a user and grant any newly earned ones.
 * Returns the list of newly granted achievements.
 */
export async function checkAndGrantAchievements(userId: string): Promise<
    { type: string; tier: number }[]
> {
    try {
        const metrics = await computeMetrics(userId);
        const newlyGranted: { type: string; tier: number }[] = [];

        // Get existing achievements
        const existing = await prismaContent.achievement.findMany({
            where: { userId },
            select: { type: true, tier: true },
        });

        const existingSet = new Set(existing.map(a => `${a.type}:${a.tier}`));

        for (const def of ACHIEVEMENT_DEFINITIONS) {
            const metricValue = metrics[def.type as keyof typeof metrics] || 0;

            for (const tierDef of def.tiers) {
                const key = `${def.type}:${tierDef.tier}`;
                if (existingSet.has(key)) continue; // Already granted

                if (metricValue >= tierDef.threshold) {
                    // Grant the achievement
                    try {
                        await prismaContent.achievement.create({
                            data: {
                                userId,
                                type: def.type,
                                tier: tierDef.tier,
                            },
                        });
                        newlyGranted.push({ type: def.type, tier: tierDef.tier });
                    } catch {
                        // Unique constraint violation — already exists, skip
                    }
                }
            }
        }

        if (newlyGranted.length > 0) {
            logger.info(`Granted ${newlyGranted.length} achievements to user ${userId}`, {
                achievements: newlyGranted,
            });
        }

        return newlyGranted;
    } catch (error) {
        logger.error('Achievement check failed', {
            userId,
            error: error instanceof Error ? error.message : error,
        });
        return [];
    }
}
