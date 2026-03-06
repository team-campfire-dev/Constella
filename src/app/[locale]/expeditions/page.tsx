'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import DashboardLayout from '@/components/DashboardLayout';
import UserAvatar from '@/components/UserAvatar';
import { Link } from '@/i18n/navigation';

interface ExpeditionItem {
    id: string;
    name: string;
    description: string | null;
    status: string;
    role: string;
    owner: { id: string; name: string; image: string | null };
    memberCount: number;
    discoveryCount: number;
    createdAt: string;
}

export default function ExpeditionsPage() {
    const t = useTranslations('Expedition');
    const [expeditions, setExpeditions] = useState<ExpeditionItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [createName, setCreateName] = useState('');
    const [createDesc, setCreateDesc] = useState('');
    const [creating, setCreating] = useState(false);

    const fetchExpeditions = useCallback(async () => {
        try {
            const res = await fetch('/api/expedition');
            const json = await res.json();
            if (json.success) {
                setExpeditions(json.data);
            }
        } catch (err) {
            console.error('Failed to fetch expeditions:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchExpeditions();
    }, [fetchExpeditions]);

    const handleCreate = async () => {
        if (!createName.trim() || creating) return;
        setCreating(true);
        try {
            const res = await fetch('/api/expedition', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: createName, description: createDesc }),
            });
            const json = await res.json();
            if (json.success) {
                setShowCreate(false);
                setCreateName('');
                setCreateDesc('');
                fetchExpeditions();
            }
        } catch (err) {
            console.error('Create expedition failed:', err);
        } finally {
            setCreating(false);
        }
    };

    const statusColor = (status: string) => {
        switch (status) {
            case 'active': return 'text-emerald-400 bg-emerald-900/20 border-emerald-500/30';
            case 'completed': return 'text-yellow-400 bg-yellow-900/20 border-yellow-500/30';
            case 'archived': return 'text-slate-500 bg-slate-900/20 border-slate-500/30';
            default: return 'text-cyan-400 bg-cyan-900/20 border-cyan-500/30';
        }
    };

    return (
        <DashboardLayout>
            <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold tracking-wider text-cyan-400 font-mono uppercase">
                        🚀 {t('title')}
                    </h1>
                    <button
                        onClick={() => setShowCreate(!showCreate)}
                        className="px-4 py-2 rounded bg-cyan-600 text-black text-sm font-bold font-mono uppercase tracking-wider hover:bg-cyan-500 transition-all"
                    >
                        + {t('create')}
                    </button>
                </div>

                {/* Create Modal */}
                {showCreate && (
                    <div className="bg-slate-900/80 border border-cyan-500/20 rounded-lg p-5 space-y-4">
                        <h2 className="text-sm font-bold text-cyan-500 uppercase tracking-widest font-mono">
                            {t('newExpedition')}
                        </h2>
                        <input
                            type="text"
                            value={createName}
                            onChange={(e) => setCreateName(e.target.value)}
                            placeholder={t('namePlaceholder')}
                            className="w-full bg-black/50 border border-cyan-900/50 rounded px-4 py-3 text-cyan-100 placeholder-cyan-800 font-mono focus:border-cyan-500/50 outline-none"
                        />
                        <textarea
                            value={createDesc}
                            onChange={(e) => setCreateDesc(e.target.value)}
                            placeholder={t('descPlaceholder')}
                            rows={3}
                            className="w-full bg-black/50 border border-cyan-900/50 rounded px-4 py-3 text-cyan-100 placeholder-cyan-800 font-mono focus:border-cyan-500/50 outline-none resize-none"
                        />
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setShowCreate(false)}
                                className="px-4 py-2 text-cyan-700 text-sm font-mono uppercase"
                            >
                                {t('cancel')}
                            </button>
                            <button
                                onClick={handleCreate}
                                disabled={!createName.trim() || creating}
                                className="px-6 py-2 bg-cyan-600 text-black rounded text-sm font-bold font-mono uppercase disabled:opacity-30 hover:bg-cyan-500 transition-all"
                            >
                                {creating ? '...' : t('create')}
                            </button>
                        </div>
                    </div>
                )}

                {/* Expedition List */}
                {loading ? (
                    <div className="text-center py-12 text-cyan-700 animate-pulse font-mono">{t('loading')}</div>
                ) : expeditions.length === 0 ? (
                    <div className="text-center py-12 text-cyan-800 font-mono space-y-3">
                        <div className="text-4xl">🚀</div>
                        <div>{t('noExpeditions')}</div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {expeditions.map(exp => (
                            <Link
                                key={exp.id}
                                href={`/expeditions/${exp.id}`}
                                className="block p-5 bg-slate-900/50 border border-cyan-500/10 rounded-lg hover:border-cyan-500/30 transition-all group"
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3 mb-2">
                                            <h3 className="text-lg font-bold text-cyan-200 group-hover:text-cyan-100 truncate">
                                                {exp.name}
                                            </h3>
                                            <span className={`text-[10px] uppercase px-2 py-0.5 rounded border font-mono ${statusColor(exp.status)}`}>
                                                {t(`status_${exp.status}`)}
                                            </span>
                                        </div>
                                        {exp.description && (
                                            <p className="text-sm text-cyan-600 truncate mb-2">{exp.description}</p>
                                        )}
                                        <div className="flex items-center gap-4 text-xs text-cyan-700 font-mono">
                                            <span className="flex items-center gap-1">
                                                <div className="w-4 h-4 rounded-full overflow-hidden">
                                                    <UserAvatar name={exp.owner.name} image={exp.owner.image} size="sm" />
                                                </div>
                                                {exp.owner.name}
                                            </span>
                                            <span>👥 {exp.memberCount}</span>
                                            <span>⭐ {exp.discoveryCount}</span>
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}
