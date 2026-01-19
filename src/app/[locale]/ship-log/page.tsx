'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import DashboardLayout from '@/components/DashboardLayout';

interface ShipLogEntry {
    id: string;
    topicId: string;
    name: string;
    discoveredAt: string;
    lastUpdated: string | null;
}

export default function ShipLogPage() {
    const t = useTranslations('ShipLog');
    const [logs, setLogs] = useState<ShipLogEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/ship-log')
            .then(res => res.json())
            .then(data => {
                if (data.logs) {
                    setLogs(data.logs);
                }
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, []);

    if (loading) {
        return (
            <DashboardLayout>
                <div className="p-8 text-cyan-500 animate-pulse">{t('loading')}...</div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <div className="p-8 h-full flex flex-col text-white">
                <h1 className="text-3xl font-bold mb-6 text-cyan-400 font-mono uppercase tracking-widest border-b border-cyan-500/30 pb-4">
                    {t('title')}
                </h1>

                {logs.length === 0 ? (
                    <div className="text-slate-400 italic">
                        {t('empty')}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto pr-2 custom-scrollbar">
                        {logs.map(log => (
                            <div key={log.id}
                                className="bg-slate-900/50 border border-cyan-500/30 p-4 rounded-lg hover:bg-cyan-900/20 transition-all cursor-pointer group"
                                onClick={() => window.location.href = `/console?q=${log.name}`}
                            >
                                <h2 className="text-xl font-bold text-cyan-200 group-hover:text-cyan-100 mb-2 capitalize">
                                    {log.name}
                                </h2>
                                <div className="text-xs text-cyan-600/80 font-mono flex justify-between">
                                    <span>{new Date(log.discoveredAt).toLocaleDateString()}</span>
                                    <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                                        OPEN CONSOLE &gt;
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}
