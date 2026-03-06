'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import DashboardLayout from '@/components/DashboardLayout';
import UserAvatar from '@/components/UserAvatar';
import { Link } from '@/i18n/navigation';

interface ExplorerData {
    id: string;
    name: string;
    image: string | null;
    bio: string | null;
    isOwnProfile: boolean;
    isFollowing: boolean;
    stats: {
        totalDiscoveries: number;
        firstDiscoveries: number;
        followers: number;
        following: number;
    };
    recentTopics: {
        id: string;
        name: string;
        discoveredAt: string;
    }[];
}

export default function ExplorerPage() {
    const params = useParams();
    const locale = useLocale();
    const t = useTranslations('Explorer');
    const explorerId = params.id as string;

    const [data, setData] = useState<ExplorerData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [followLoading, setFollowLoading] = useState(false);
    const [achievements, setAchievements] = useState<{
        id: string; type: string; tier: number; icon: string;
        name: { en: string; ko: string }; tierLabel: { en: string; ko: string };
    }[]>([]);

    useEffect(() => {
        const fetchExplorer = async () => {
            try {
                const res = await fetch(`/api/explorer/${explorerId}?lang=${locale}`);
                if (res.status === 404) {
                    setError('not_found');
                    return;
                }
                if (!res.ok) throw new Error('Failed to fetch');
                const json = await res.json();
                if (json.success) {
                    setData(json.data);
                }
            } catch (err) {
                console.error(err);
                setError('error');
            } finally {
                setLoading(false);
            }
        };

        fetchExplorer();
    }, [explorerId, locale]);

    // Fetch achievements
    useEffect(() => {
        const fetchAchievements = async () => {
            try {
                const res = await fetch(`/api/achievements?userId=${explorerId}`);
                const json = await res.json();
                if (json.success) {
                    setAchievements(json.data.best);
                }
            } catch (e) {
                console.error('Failed to fetch achievements:', e);
            }
        };
        fetchAchievements();
    }, [explorerId]);

    const handleFollowToggle = useCallback(async () => {
        if (!data || followLoading) return;
        setFollowLoading(true);
        try {
            const method = data.isFollowing ? 'DELETE' : 'POST';
            const res = await fetch('/api/follow', {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetUserId: explorerId })
            });
            if (res.ok) {
                setData(prev => prev ? {
                    ...prev,
                    isFollowing: !prev.isFollowing,
                    stats: {
                        ...prev.stats,
                        followers: prev.stats.followers + (prev.isFollowing ? -1 : 1)
                    }
                } : null);
            }
        } catch (err) {
            console.error('Follow toggle failed:', err);
        } finally {
            setFollowLoading(false);
        }
    }, [data, followLoading, explorerId]);

    if (loading) {
        return (
            <DashboardLayout>
                <div className="flex items-center justify-center h-full text-cyan-500 animate-pulse font-mono">
                    {t('loading')}
                </div>
            </DashboardLayout>
        );
    }

    if (error || !data) {
        return (
            <DashboardLayout>
                <div className="flex items-center justify-center h-full text-red-400 font-mono">
                    {t('notFound')}
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <div className="p-8 max-w-4xl mx-auto space-y-8">
                {/* Header Section */}
                <div className="flex items-start gap-6 pb-6 border-b border-cyan-900/30">
                    <div className="flex-shrink-0">
                        <div className="w-24 h-24 rounded-full border-2 border-cyan-500/50 shadow-[0_0_20px_rgba(0,240,255,0.2)] overflow-hidden">
                            <UserAvatar name={data.name} image={data.image} size="xl" />
                        </div>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-4">
                            <h1 className="text-3xl font-bold text-cyan-100 tracking-wide">
                                {data.name}
                            </h1>
                            {!data.isOwnProfile && (
                                <>
                                    <button
                                        onClick={handleFollowToggle}
                                        disabled={followLoading}
                                        className={`px-4 py-1.5 rounded text-sm font-mono uppercase tracking-wider transition-all ${data.isFollowing
                                            ? 'bg-cyan-900/30 border border-cyan-500/30 text-cyan-400 hover:bg-red-900/30 hover:border-red-500/30 hover:text-red-400'
                                            : 'bg-cyan-600 text-black hover:bg-cyan-500'
                                            } disabled:opacity-50`}
                                    >
                                        {followLoading ? '...' : data.isFollowing ? t('removeCrew') : t('addCrew')}
                                    </button>
                                    <Link
                                        href={`/dm?partner=${explorerId}`}
                                        className="px-4 py-1.5 rounded text-sm font-mono uppercase tracking-wider transition-all bg-slate-800 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-900/30 hover:text-cyan-300"
                                    >
                                        📨 {t('sendSignal')}
                                    </Link>
                                </>
                            )}
                        </div>
                        <div className="flex gap-4 mt-2 text-xs text-cyan-600 font-mono">
                            <span>{t('followers', { count: data.stats.followers })}</span>
                            <span>{t('followingCount', { count: data.stats.following })}</span>
                        </div>
                        <div className="mt-3">
                            {data.bio ? (
                                <p className="text-slate-300 text-sm leading-relaxed">
                                    {data.bio}
                                </p>
                            ) : (
                                <p className="text-cyan-800 text-sm italic">
                                    {t('noBio')}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-cyan-950/30 border border-cyan-500/20 rounded-lg p-5 text-center">
                        <div className="text-4xl font-bold text-cyan-300 mb-1">
                            {data.stats.totalDiscoveries}
                        </div>
                        <div className="text-xs text-cyan-600 font-mono uppercase tracking-widest">
                            {t('totalDiscoveries')}
                        </div>
                    </div>
                    <div className="bg-yellow-950/20 border border-yellow-500/20 rounded-lg p-5 text-center">
                        <div className="text-4xl font-bold text-yellow-300 mb-1">
                            {data.stats.firstDiscoveries}
                        </div>
                        <div className="text-xs text-yellow-600 font-mono uppercase tracking-widest">
                            {t('firstDiscoveries')}
                        </div>
                    </div>
                </div>

                {/* Achievement Badges */}
                {achievements.length > 0 && (
                    <div>
                        <h2 className="text-lg font-bold text-yellow-400 uppercase tracking-widest mb-4 font-mono">
                            🏆 {t('achievements')}
                        </h2>
                        <div className="flex flex-wrap gap-3">
                            {achievements.map(a => {
                                const tierClass = a.tier === 3
                                    ? 'border-yellow-500/50 bg-yellow-900/20 shadow-[0_0_10px_rgba(234,179,8,0.15)]'
                                    : a.tier === 2
                                        ? 'border-slate-400/50 bg-slate-800/20'
                                        : 'border-amber-700/50 bg-amber-900/20';
                                const textClass = a.tier === 3 ? 'text-yellow-400' : a.tier === 2 ? 'text-slate-300' : 'text-amber-600';
                                return (
                                    <div key={a.id} className={`rounded-lg border p-3 text-center min-w-[80px] ${tierClass}`}>
                                        <div className="text-xl mb-1">{a.icon}</div>
                                        <div className={`text-xs font-bold ${textClass}`}>
                                            {locale === 'ko' ? a.name.ko : a.name.en}
                                        </div>
                                        <div className={`text-[10px] uppercase tracking-wider ${textClass} opacity-70`}>
                                            {locale === 'ko' ? a.tierLabel.ko : a.tierLabel.en}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Recent Discoveries */}
                <div>
                    <h2 className="text-lg font-bold text-cyan-400 uppercase tracking-widest mb-4 font-mono">
                        {t('recentTopics')}
                    </h2>
                    {data.recentTopics.length === 0 ? (
                        <p className="text-cyan-800 italic text-sm">{t('noTopics')}</p>
                    ) : (
                        <div className="space-y-2">
                            {data.recentTopics.map((topic) => (
                                <Link
                                    key={topic.id}
                                    href={`/console?q=${encodeURIComponent(topic.name)}`}
                                    className="flex items-center justify-between p-3 bg-slate-900/50 border border-cyan-500/20 rounded hover:bg-cyan-900/20 hover:border-cyan-500/40 transition-all group"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-cyan-500 text-xs">⭐</span>
                                        <span className="text-cyan-200 group-hover:text-cyan-100 capitalize">
                                            {topic.name}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs text-cyan-700 font-mono">
                                            {new Date(topic.discoveredAt).toLocaleDateString()}
                                        </span>
                                        <span className="text-xs text-cyan-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {t('exploreThis')} →
                                        </span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}
