'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import DashboardLayout from '@/components/DashboardLayout';
import UserAvatar from '@/components/UserAvatar';
import { Link } from '@/i18n/navigation';

interface FeedItem {
    id: string;
    user: {
        id: string;
        name: string;
        image: string | null;
    };
    topic: {
        id: string;
        name: string;
    };
    discoveredAt: string;
}

function timeAgo(dateStr: string, agoLabel: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ${agoLabel}`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${agoLabel}`;
    const days = Math.floor(hours / 24);
    return `${days}d ${agoLabel}`;
}

export default function FeedPage() {
    const locale = useLocale();
    const t = useTranslations('Feed');

    const [feed, setFeed] = useState<FeedItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'crew'>('all');
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loadingMore, setLoadingMore] = useState(false);

    const fetchFeed = useCallback(async (cursor?: string) => {
        const isMore = !!cursor;
        if (isMore) setLoadingMore(true);
        else setLoading(true);

        try {
            const params = new URLSearchParams({ filter, lang: locale });
            if (cursor) params.set('cursor', cursor);
            const res = await fetch(`/api/feed?${params}`);
            const json = await res.json();
            if (json.success) {
                if (isMore) {
                    setFeed(prev => {
                        const existingIds = new Set(prev.map(i => i.id));
                        const newItems = json.data.filter((i: FeedItem) => !existingIds.has(i.id));
                        return [...prev, ...newItems];
                    });
                } else {
                    setFeed(json.data);
                }
                setNextCursor(json.nextCursor);
            }
        } catch (err) {
            console.error('Feed fetch error:', err);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [filter, locale]);

    useEffect(() => {
        fetchFeed();
    }, [fetchFeed]);

    return (
        <DashboardLayout>
            <div className="p-6 max-w-3xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-xl font-bold text-cyan-400 uppercase tracking-widest font-mono">
                        {t('title')}
                    </h1>
                    <div className="flex gap-1 bg-black/40 rounded p-0.5 border border-cyan-900/30">
                        <button
                            onClick={() => setFilter('all')}
                            className={`px-3 py-1 rounded text-xs font-mono uppercase transition-all ${filter === 'all'
                                ? 'bg-cyan-900/50 text-cyan-300'
                                : 'text-cyan-700 hover:text-cyan-400'
                                }`}
                        >
                            {t('allExplorers')}
                        </button>
                        <button
                            onClick={() => setFilter('crew')}
                            className={`px-3 py-1 rounded text-xs font-mono uppercase transition-all ${filter === 'crew'
                                ? 'bg-cyan-900/50 text-cyan-300'
                                : 'text-cyan-700 hover:text-cyan-400'
                                }`}
                        >
                            {t('myCrew')}
                        </button>
                    </div>
                </div>

                {/* Feed Items */}
                {loading ? (
                    <div className="flex items-center justify-center h-40 text-cyan-500 animate-pulse font-mono text-sm">
                        {t('loading')}
                    </div>
                ) : feed.length === 0 ? (
                    <div className="flex items-center justify-center h-40 text-cyan-800 font-mono text-sm">
                        {t('noActivity')}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {feed.map((item) => (
                            <div
                                key={item.id}
                                className="flex items-center gap-4 p-4 bg-slate-900/50 border border-cyan-500/10 rounded-lg hover:border-cyan-500/30 transition-all"
                            >
                                <Link href={`/explorer/${item.user.id}`} className="flex-shrink-0">
                                    <div className="w-10 h-10 rounded-full border border-cyan-500/30 overflow-hidden">
                                        <UserAvatar name={item.user.name} image={item.user.image} />
                                    </div>
                                </Link>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 text-sm">
                                        <Link
                                            href={`/explorer/${item.user.id}`}
                                            className="font-bold text-cyan-300 hover:text-cyan-100 transition-colors"
                                        >
                                            {item.user.name}
                                        </Link>
                                        <span className="text-cyan-700">{t('discovered')}</span>
                                        <Link
                                            href={`/console?q=${encodeURIComponent(item.topic.name)}`}
                                            className="text-cyan-400 hover:text-cyan-200 transition-colors font-medium"
                                        >
                                            ✨ {item.topic.name}
                                        </Link>
                                    </div>
                                    <div className="text-xs text-cyan-800 mt-1 font-mono">
                                        {timeAgo(item.discoveredAt, t('ago'))}
                                    </div>
                                </div>
                            </div>
                        ))}

                        {/* Load More */}
                        {nextCursor && (
                            <button
                                onClick={() => fetchFeed(nextCursor)}
                                disabled={loadingMore}
                                className="w-full py-3 text-center text-sm text-cyan-600 hover:text-cyan-400 border border-cyan-900/30 rounded-lg hover:bg-cyan-900/20 transition-all font-mono disabled:opacity-50"
                            >
                                {loadingMore ? '...' : '▼ Load more'}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}
