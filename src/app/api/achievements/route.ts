import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prismaContent from "@/lib/prisma-content";
import { ACHIEVEMENT_DEFINITIONS, checkAndGrantAchievements } from "@/lib/achievements";
import logger from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";

const RATE_LIMIT_WINDOW_MS = 1000;

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!checkRateLimit('achievements_get', session.user.id, RATE_LIMIT_WINDOW_MS)) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || session.user.id;

    try {
        // First, check and grant any new achievements
        if (userId === session.user.id) {
            await checkAndGrantAchievements(userId);
        }

        // Fetch all achievements for this user
        const achievements = await prismaContent.achievement.findMany({
            where: { userId },
            orderBy: [{ type: 'asc' }, { tier: 'desc' }],
        });

        // Enrich with metadata from definitions
        const enriched = achievements.map(a => {
            const def = ACHIEVEMENT_DEFINITIONS.find(d => d.type === a.type);
            const tierDef = def?.tiers.find(t => t.tier === a.tier);
            return {
                id: a.id,
                type: a.type,
                tier: a.tier,
                unlockedAt: a.unlockedAt,
                name: def?.name || { en: a.type, ko: a.type },
                description: def?.description || { en: '', ko: '' },
                icon: def?.icon || '🏆',
                tierLabel: tierDef?.label || { en: `Tier ${a.tier}`, ko: `${a.tier}단계` },
                threshold: tierDef?.threshold || 0,
            };
        });

        // Group by type, only show highest tier per type
        const bestByType = new Map<string, typeof enriched[0]>();
        for (const a of enriched) {
            const existing = bestByType.get(a.type);
            if (!existing || a.tier > existing.tier) {
                bestByType.set(a.type, a);
            }
        }

        // Build full catalog with progress for the requesting user
        const catalog = ACHIEVEMENT_DEFINITIONS.map(def => {
            const earned = achievements.filter(a => a.type === def.type);
            const highestTier = earned.length > 0 ? Math.max(...earned.map(a => a.tier)) : 0;
            const nextTier = def.tiers.find(t => t.tier === highestTier + 1);

            return {
                type: def.type,
                name: def.name,
                description: def.description,
                icon: def.icon,
                highestTier,
                tiers: def.tiers.map(t => ({
                    tier: t.tier,
                    threshold: t.threshold,
                    label: t.label,
                    unlocked: earned.some(a => a.tier === t.tier),
                    unlockedAt: earned.find(a => a.tier === t.tier)?.unlockedAt || null,
                })),
                nextGoal: nextTier ? {
                    tier: nextTier.tier,
                    threshold: nextTier.threshold,
                    label: nextTier.label,
                } : null,
            };
        });

        return NextResponse.json({
            success: true,
            data: {
                all: enriched,
                best: Array.from(bestByType.values()),
                total: enriched.length,
                catalog,
            },
        });
    } catch (error) {
        logger.error("Achievements API Error", { error: error instanceof Error ? error.message : error });
        return NextResponse.json({ error: 'Failed to fetch achievements' }, { status: 500 });
    }
}
