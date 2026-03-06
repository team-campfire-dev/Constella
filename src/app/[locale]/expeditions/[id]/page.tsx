'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import DashboardLayout from '@/components/DashboardLayout';
import UserAvatar from '@/components/UserAvatar';
import { Link } from '@/i18n/navigation';

interface Member {
    id: string;
    userId: string;
    name: string;
    image: string | null;
    role: string;
    joinedAt: string;
}

interface SharedLog {
    id: string;
    topicId: string;
    topicName: string;
    addedBy: string;
    discoveredAt: string;
}

interface ExpeditionDetail {
    id: string;
    name: string;
    description: string | null;
    status: string;
    ownerId: string;
    isOwner: boolean;
    members: Member[];
    sharedLogs: SharedLog[];
    commsChannel: string;
    createdAt: string;
}

export default function ExpeditionDetailPage() {
    const params = useParams();
    const locale = useLocale();
    const t = useTranslations('Expedition');
    const searchParams = useSearchParams();
    const expeditionId = params.id as string;

    const [data, setData] = useState<ExpeditionDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [showInvite, setShowInvite] = useState(false);
    const [showShareTopic, setShowShareTopic] = useState(false);
    const [myTopics, setMyTopics] = useState<{ id: string; name: string }[]>([]);

    // For invite: get crew list
    const [crew, setCrew] = useState<{ id: string; name: string; image: string | null }[]>([]);

    const fetchDetail = useCallback(async () => {
        try {
            const res = await fetch(`/api/expedition/${expeditionId}?lang=${locale}`);
            const json = await res.json();
            if (json.success) {
                setData(json.data);
            }
        } catch (err) {
            console.error('Failed to fetch expedition:', err);
        } finally {
            setLoading(false);
        }
    }, [expeditionId, locale]);

    useEffect(() => {
        fetchDetail();
    }, [fetchDetail]);

    // Fetch crew for invite
    useEffect(() => {
        if (!showInvite) return;
        const fetchCrew = async () => {
            try {
                const res = await fetch('/api/follow');
                const json = await res.json();
                if (json.success) setCrew(json.data);
            } catch (e) { console.error(e); }
        };
        fetchCrew();
    }, [showInvite]);

    // Fetch my topics for sharing
    useEffect(() => {
        if (!showShareTopic) return;
        const fetchMyTopics = async () => {
            try {
                const res = await fetch('/api/ship-log');
                const json = await res.json();
                if (json.success) {
                    setMyTopics(json.data.map((log: { topicId: string; topicName: string }) => ({
                        id: log.topicId,
                        name: log.topicName,
                    })));
                }
            } catch (e) { console.error(e); }
        };
        fetchMyTopics();
    }, [showShareTopic]);

    const handleInvite = async (userId: string) => {
        try {
            const res = await fetch(`/api/expedition/${expeditionId}/members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId }),
            });
            if (res.ok) {
                fetchDetail();
                setShowInvite(false);
            }
        } catch (e) { console.error(e); }
    };

    const handleShareTopic = async (topicId: string) => {
        try {
            const res = await fetch(`/api/expedition/${expeditionId}/logs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topicId }),
            });
            if (res.ok) {
                fetchDetail();
                setShowShareTopic(false);
            }
        } catch (e) { console.error(e); }
    };

    const handleStatusChange = async (status: string) => {
        try {
            await fetch(`/api/expedition/${expeditionId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            });
            fetchDetail();
        } catch (e) { console.error(e); }
    };

    // Suppress unused searchParams warning
    void searchParams;

    if (loading) {
        return (
            <DashboardLayout>
                <div className="flex items-center justify-center h-full text-cyan-500 animate-pulse font-mono">
                    {t('loading')}
                </div>
            </DashboardLayout>
        );
    }

    if (!data) {
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
            <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-start justify-between pb-4 border-b border-cyan-900/30">
                    <div>
                        <h1 className="text-2xl font-bold text-cyan-200 tracking-wide">{data.name}</h1>
                        {data.description && (
                            <p className="text-sm text-cyan-600 mt-1">{data.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs text-cyan-700 font-mono">
                            <span className={`uppercase px-2 py-0.5 rounded border ${data.status === 'active' ? 'text-emerald-400 border-emerald-500/30' :
                                    data.status === 'completed' ? 'text-yellow-400 border-yellow-500/30' :
                                        'text-slate-500 border-slate-500/30'
                                }`}>
                                {t(`status_${data.status}`)}
                            </span>
                            <span>{new Date(data.createdAt).toLocaleDateString()}</span>
                        </div>
                    </div>
                    {data.isOwner && data.status === 'active' && (
                        <div className="flex gap-2">
                            <button
                                onClick={() => handleStatusChange('completed')}
                                className="px-3 py-1.5 text-xs font-mono uppercase bg-yellow-900/30 border border-yellow-500/30 text-yellow-400 rounded hover:bg-yellow-900/50 transition-all"
                            >
                                {t('complete')}
                            </button>
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="flex gap-3 flex-wrap">
                    <button
                        onClick={() => setShowInvite(!showInvite)}
                        className="px-4 py-2 bg-cyan-900/30 border border-cyan-500/30 text-cyan-400 rounded text-sm font-mono uppercase hover:bg-cyan-900/50 transition-all"
                    >
                        + {t('inviteMember')}
                    </button>
                    <button
                        onClick={() => setShowShareTopic(!showShareTopic)}
                        className="px-4 py-2 bg-cyan-900/30 border border-cyan-500/30 text-cyan-400 rounded text-sm font-mono uppercase hover:bg-cyan-900/50 transition-all"
                    >
                        ⭐ {t('shareTopic')}
                    </button>
                    <Link
                        href={`/console?channel=${encodeURIComponent(data.commsChannel)}&tab=comms`}
                        className="px-4 py-2 bg-purple-900/30 border border-purple-500/30 text-purple-400 rounded text-sm font-mono uppercase hover:bg-purple-900/50 transition-all"
                    >
                        📡 {t('commsChannel')}
                    </Link>
                </div>

                {/* Invite Dropdown */}
                {showInvite && (
                    <div className="bg-slate-900/80 border border-cyan-500/20 rounded-lg p-4 space-y-2">
                        <h3 className="text-xs font-bold text-cyan-500 uppercase tracking-widest mb-2">{t('selectCrew')}</h3>
                        {crew.length === 0 ? (
                            <p className="text-sm text-cyan-800">{t('noCrew')}</p>
                        ) : crew.filter(c => !data.members.some(m => m.userId === c.id)).map(c => (
                            <button
                                key={c.id}
                                onClick={() => handleInvite(c.id)}
                                className="flex items-center gap-3 w-full p-2 hover:bg-cyan-900/20 rounded transition-all text-left"
                            >
                                <div className="w-6 h-6 rounded-full overflow-hidden">
                                    <UserAvatar name={c.name} image={c.image} size="sm" />
                                </div>
                                <span className="text-sm text-cyan-300">{c.name}</span>
                            </button>
                        ))}
                    </div>
                )}

                {/* Share Topic Dropdown */}
                {showShareTopic && (
                    <div className="bg-slate-900/80 border border-cyan-500/20 rounded-lg p-4 max-h-48 overflow-y-auto space-y-1">
                        <h3 className="text-xs font-bold text-cyan-500 uppercase tracking-widest mb-2">{t('selectTopic')}</h3>
                        {myTopics.filter(t => !data.sharedLogs.some(l => l.topicId === t.id)).map(topic => (
                            <button
                                key={topic.id}
                                onClick={() => handleShareTopic(topic.id)}
                                className="flex items-center gap-2 w-full p-2 hover:bg-cyan-900/20 rounded transition-all text-left text-sm text-cyan-300"
                            >
                                ⭐ <span className="capitalize">{topic.name}</span>
                            </button>
                        ))}
                    </div>
                )}

                {/* Members */}
                <div className="bg-slate-900/50 border border-cyan-500/10 rounded-lg p-5">
                    <h2 className="text-sm font-bold text-cyan-500 uppercase tracking-widest mb-4 font-mono">
                        👥 {t('members')} ({data.members.length})
                    </h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {data.members.map(m => (
                            <Link
                                key={m.id}
                                href={`/explorer/${m.userId}`}
                                className="flex items-center gap-3 p-3 bg-black/30 rounded border border-cyan-900/20 hover:border-cyan-500/30 transition-all"
                            >
                                <div className="w-8 h-8 rounded-full overflow-hidden border border-cyan-500/30">
                                    <UserAvatar name={m.name} image={m.image} size="sm" />
                                </div>
                                <div>
                                    <div className="text-sm text-cyan-300 font-bold">{m.name}</div>
                                    <div className="text-[10px] text-cyan-700 font-mono uppercase">
                                        {m.role === 'owner' ? '👑 ' : ''}{m.role}
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>

                {/* Shared Discoveries */}
                <div>
                    <h2 className="text-lg font-bold text-cyan-400 uppercase tracking-widest mb-4 font-mono">
                        ⭐ {t('sharedDiscoveries')} ({data.sharedLogs.length})
                    </h2>
                    {data.sharedLogs.length === 0 ? (
                        <p className="text-cyan-800 text-sm italic">{t('noSharedTopics')}</p>
                    ) : (
                        <div className="space-y-2">
                            {data.sharedLogs.map(log => (
                                <Link
                                    key={log.id}
                                    href={`/console?q=${encodeURIComponent(log.topicName)}`}
                                    className="flex items-center justify-between p-3 bg-slate-900/50 border border-cyan-500/20 rounded hover:bg-cyan-900/20 hover:border-cyan-500/40 transition-all group"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-cyan-500 text-xs">⭐</span>
                                        <span className="text-cyan-200 group-hover:text-cyan-100 capitalize">
                                            {log.topicName}
                                        </span>
                                    </div>
                                    <span className="text-xs text-cyan-700 font-mono">
                                        {new Date(log.discoveredAt).toLocaleDateString()}
                                    </span>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}
