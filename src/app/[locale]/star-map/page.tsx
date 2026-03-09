'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import DashboardLayout from '@/components/DashboardLayout';
import StarGraph, { GraphNode, DiscoveryEvent } from '@/components/StarGraph';
import KnowledgePanel from '@/components/KnowledgePanel';
import ChatPanel from '@/components/ChatPanel';

export default function StarMapPage() {
    const t = useTranslations('StarMap');
    const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
    const [chatOpen, setChatOpen] = useState(false);
    const [chatQuery, setChatQuery] = useState<string | null>(null);
    const [lastDiscovery, setLastDiscovery] = useState<DiscoveryEvent | null>(null);

    const handleNodeClick = useCallback((node: GraphNode) => {
        // Mystery Node: Open ChatPanel, close KnowledgePanel
        if (node.group === 'mystery') {
            setSelectedTopicId(null);
            setChatQuery(node.name);
            setChatOpen(true);
            return;
        }

        // Known Node: Show details panel, close ChatPanel
        if (node && node.id) {
            setChatOpen(false);
            setChatQuery(null);
            setSelectedTopicId(node.id.toString());
        }
    }, []);

    const handleQueryAI = useCallback((query: string) => {
        setSelectedTopicId(null);
        setChatQuery(query);
        setChatOpen(true);
    }, []);

    const handleTopicDiscovered = useCallback((topicId: string, topicName: string, isNew: boolean) => {
        setLastDiscovery({ topicId, topicName, isNew });
    }, []);

    return (
        <DashboardLayout>
            <div className="p-3 md:p-6 h-full flex flex-col relative w-full h-full">
                <div className="mb-4 flex items-center justify-between">
                    <h1 className="text-xl font-bold text-gray-100">{t('cardTitle')}</h1>
                    {/* Chat panel toggle */}
                    <button
                        onClick={() => { setChatOpen(!chatOpen); setChatQuery(null); }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono uppercase tracking-wider border transition-all ${chatOpen
                            ? 'bg-cyan-900/40 border-cyan-500/40 text-cyan-300'
                            : 'bg-[#1C1E2D]/80 border-gray-700/50 text-gray-400 hover:text-cyan-400 hover:border-cyan-600/40'
                            }`}
                    >
                        <span>🛰️</span>
                        <span>{t('chatToggle')}</span>
                    </button>
                </div>
                <div className="flex-1 min-h-0 relative w-full h-full">
                    <StarGraph
                        onNodeClick={handleNodeClick}
                        selectedNodeId={selectedTopicId}
                        onQueryAI={handleQueryAI}
                        newDiscovery={lastDiscovery}
                    />

                    {/* Knowledge Panel Overlay */}
                    <KnowledgePanel
                        topicId={selectedTopicId}
                        onClose={() => setSelectedTopicId(null)}
                        onNavigate={(id) => setSelectedTopicId(id)}
                    />

                    {/* AI Chat Panel */}
                    <ChatPanel
                        isOpen={chatOpen}
                        onClose={() => { setChatOpen(false); setChatQuery(null); }}
                        initialQuery={chatQuery}
                        onTopicDiscovered={handleTopicDiscovered}
                    />
                </div>
            </div>
        </DashboardLayout>
    );
}
