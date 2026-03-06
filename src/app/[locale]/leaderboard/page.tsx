'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import DashboardLayout from '@/components/DashboardLayout';
import UserAvatar from '@/components/UserAvatar';
import { Link } from '@/i18n/navigation';

interface LeaderboardEntry {
    rank: number;
    userId: string;
    name: string;
    image: string | null;
    totalDiscoveries: number;
    firstDiscoveries: number;
    achievementCount: number;
}

interface CatalogTier {
    tier: number;
    threshold: number;
    label: { en: string; ko: string };
    unlocked: boolean;
    unlockedAt: string | null;
}

interface CatalogItem {
    type: string;
    name: { en: string; ko: string };
    description: { en: string; ko: string };
    icon: string;
    highestTier: number;
    tiers: CatalogTier[];
    nextGoal: { tier: number; threshold: number; label: { en: string; ko: string } } | null;
}

type SortType = 'discoveries' | 'firstDiscoveries' | 'achievements';

export default function LeaderboardPage() {
    const t = useTranslations('Leaderboard');
    const locale = useLocale();
    const l = (obj: { en: string; ko: string }) => locale === 'ko' ? obj.ko : obj.en;

    const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [sort, setSort] = useState<SortType>('discoveries');
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loadingMore, setLoadingMore] = useState(false);

    // Achievement catalog
    const [catalog, setCatalog] = useState<CatalogItem[]>([]);
    const [achievementsLoading, setAchievementsLoading] = useState(true);

    const fetchLeaderboard = useCallback(async (cursor?: string) => {
        const isMore = !!cursor;
        if (isMore) setLoadingMore(true);
        else setLoading(true);

        try {
            const params = new URLSearchParams({ sort });
            if (cursor) params.set('cursor', cursor);
            const res = await fetch(`/api/leaderboard?${params}`);
            const json = await res.json();
            if (json.success) {
                if (isMore) {
                    setEntries(prev => {
                        const existingIds = new Set(prev.map(e => e.userId));
                        const newItems = json.data.filter((e: LeaderboardEntry) => !existingIds.has(e.userId));
                        return [...prev, ...newItems];
                    });
                } else {
                    setEntries(json.data);
                }
                setNextCursor(json.nextCursor);
            }
        } catch (err) {
            console.error('Leaderboard fetch error:', err);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [sort]);

    useEffect(() => {
        fetchLeaderboard();
    }, [fetchLeaderboard]);

    // Fetch achievement catalog
    useEffect(() => {
        const fetchAchievements = async () => {
            try {
                const res = await fetch('/api/achievements');
                const json = await res.json();
                if (json.success && json.data.catalog) {
                    setCatalog(json.data.catalog);
                }
            } catch (err) {
                console.error('Achievements fetch error:', err);
            } finally {
                setAchievementsLoading(false);
            }
        };
        fetchAchievements();
    }, []);

    const tierColor = (tier: number, unlocked: boolean) => {
        if (!unlocked) return 'text-slate-700';
        switch (tier) {
            case 1: return 'text-amber-600';
            case 2: return 'text-slate-300';
            case 3: return 'text-yellow-400';
            default: return 'text-cyan-500';
        }
    };

    const rankDisplay = (rank: number) => {
        if (rank === 1) return '🥇';
        if (rank === 2) return '🥈';
        if (rank === 3) return '🥉';
        return `#${rank}`;
    };

    const sortOptions: { key: SortType; label: string }[] = [
        { key: 'discoveries', label: t('sortDiscoveries') },
        { key: 'firstDiscoveries', label: t('sortFirstDiscoveries') },
        { key: 'achievements', label: t('sortAchievements') },
    ];

    return (
        <DashboardLayout>
            <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-8">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold tracking-wider text-cyan-400 font-mono uppercase">
                        🏆 {t('title')}
                    </h1>
                </div>

                {/* Achievement Catalog — full descriptions + tier progress */}
                <div className="bg-slate-900/50 border border-cyan-500/10 rounded-lg p-5">
                    <h2 className="text-sm font-bold text-cyan-500 uppercase tracking-widest mb-4 font-mono">
                        {t('myAchievements')}
                    </h2>
                    {achievementsLoading ? (
                        <div className="text-cyan-700 text-sm animate-pulse">{t('loading')}</div>
                    ) : catalog.length === 0 ? (
                        <div className="text-cyan-800 text-sm">{t('noAchievements')}</div>
                    ) : (
                        <div className="space-y-3">
                            {catalog.map(item => (
                                <div
                                    key={item.type}
                                    className={`rounded-lg border p-4 transition-all ${item.highestTier >= 3
                                            ? 'border-yellow-500/30 bg-yellow-900/10'
                                            : item.highestTier >= 1
                                                ? 'border-cyan-500/20 bg-cyan-900/10'
                                                : 'border-slate-800/50 bg-slate-900/30'
                                        }`}
                                >
                                    <div className="flex items-start gap-4">
                                        {/* Icon */}
                                        <div className={`text-3xl ${item.highestTier === 0 ? 'opacity-30 grayscale' : ''}`}>
                                            {item.icon}
                                        </div>

                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`font-bold text-sm ${item.highestTier > 0 ? 'text-cyan-200' : 'text-slate-500'
                                                    }`}>
                                                    {l(item.name)}
                                                </span>
                                                {item.nextGoal && (
                                                    <span className="text-[10px] text-cyan-700 font-mono">
                                                        → {t('nextGoal')}: {item.nextGoal.threshold}
                                                    </span>
                                                )}
                                            </div>
                                            <p className={`text-xs mb-3 ${item.highestTier > 0 ? 'text-cyan-600' : 'text-slate-600'
                                                }`}>
                                                {l(item.description)}
                                            </p>

                                            {/* Tier badges */}
                                            <div className="flex gap-2">
                                                {item.tiers.map(tier => (
                                                    <div
                                                        key={tier.tier}
                                                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] font-mono transition-all ${tier.unlocked
                                                                ? tier.tier === 3
                                                                    ? 'border-yellow-500/50 bg-yellow-900/30 text-yellow-400'
                                                                    : tier.tier === 2
                                                                        ? 'border-slate-400/50 bg-slate-700/30 text-slate-300'
                                                                        : 'border-amber-600/50 bg-amber-900/30 text-amber-500'
                                                                : 'border-slate-800 bg-slate-900/50 text-slate-700'
                                                            }`}
                                                    >
                                                        <span>{tier.unlocked ? '✓' : '○'}</span>
                                                        <span className="uppercase font-bold">{l(tier.label)}</span>
                                                        <span className={`${tier.unlocked ? tierColor(tier.tier, true) : 'text-slate-700'}`}>
                                                            ({tier.threshold})
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Sort Tabs */}
                <div className="flex gap-1 bg-slate-900/50 rounded p-1 border border-cyan-500/10">
                    {sortOptions.map(opt => (
                        <button
                            key={opt.key}
                            onClick={() => setSort(opt.key)}
                            className={`flex-1 px-3 py-2 rounded text-xs font-bold uppercase tracking-wider transition-all font-mono ${sort === opt.key
                                    ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-500/20'
                                    : 'text-cyan-700 hover:text-cyan-400'
                                }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>

                {/* Leaderboard Table */}
                {loading ? (
                    <div className="text-center text-cyan-700 animate-pulse py-12">{t('loading')}</div>
                ) : entries.length === 0 ? (
                    <div className="text-center text-cyan-800 py-12">{t('noData')}</div>
                ) : (
                    <div className="space-y-2">
                        {entries.map(entry => (
                            <Link
                                key={entry.userId}
                                href={`/explorer/${entry.userId}`}
                                className={`flex items-center gap-4 p-4 rounded-lg border transition-all hover:border-cyan-500/30 hover:bg-slate-900/50 ${entry.rank <= 3
                                        ? 'bg-slate-900/60 border-cyan-500/20'
                                        : 'bg-slate-900/30 border-cyan-900/20'
                                    }`}
                            >
                                {/* Rank */}
                                <div className={`w-10 text-center font-bold font-mono ${entry.rank === 1 ? 'text-2xl' : entry.rank <= 3 ? 'text-xl' : 'text-sm text-cyan-700'
                                    }`}>
                                    {rankDisplay(entry.rank)}
                                </div>

                                {/* Avatar */}
                                <div className="w-10 h-10 rounded-full overflow-hidden border border-cyan-500/30 flex-shrink-0">
                                    <UserAvatar name={entry.name} image={entry.image} />
                                </div>

                                {/* Name */}
                                <div className="flex-1 min-w-0">
                                    <div className={`font-bold truncate ${entry.rank <= 3 ? 'text-cyan-200' : 'text-cyan-400'
                                        }`}>
                                        {entry.name}
                                    </div>
                                </div>

                                {/* Stats */}
                                <div className="flex gap-6 text-right text-sm font-mono">
                                    <div>
                                        <div className={`font-bold ${sort === 'discoveries' ? 'text-cyan-300' : 'text-cyan-600'}`}>
                                            {entry.totalDiscoveries}
                                        </div>
                                        <div className="text-[10px] text-cyan-800 uppercase">{t('discoveries')}</div>
                                    </div>
                                    <div className="hidden sm:block">
                                        <div className={`font-bold ${sort === 'firstDiscoveries' ? 'text-cyan-300' : 'text-cyan-600'}`}>
                                            {entry.firstDiscoveries}
                                        </div>
                                        <div className="text-[10px] text-cyan-800 uppercase">{t('firsts')}</div>
                                    </div>
                                    <div>
                                        <div className={`font-bold ${sort === 'achievements' ? 'text-yellow-400' : 'text-cyan-600'}`}>
                                            {entry.achievementCount}
                                        </div>
                                        <div className="text-[10px] text-cyan-800 uppercase">{t('badges')}</div>
                                    </div>
                                </div>
                            </Link>
                        ))}

                        {nextCursor && (
                            <button
                                onClick={() => fetchLeaderboard(nextCursor)}
                                disabled={loadingMore}
                                className="w-full py-3 text-sm text-cyan-500 hover:text-cyan-300 border border-cyan-900/30 rounded-lg hover:border-cyan-500/30 transition-all font-mono uppercase tracking-wider disabled:opacity-30"
                            >
                                {loadingMore ? t('loading') : t('loadMore')}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}
