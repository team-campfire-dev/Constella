'use client';

import { useState, useEffect, useCallback } from 'react';
import StarGraph, { GraphNode, DiscoveryEvent } from '@/components/StarGraph';
import KnowledgePanel from '@/components/KnowledgePanel';
import ChatPanel from '@/components/ChatPanel';
import { useTranslations } from 'next-intl';

interface CrewMember {
    id: string;
    name: string;
    image: string | null;
}

export default function StarMapWrapper() {
    const t = useTranslations('StarMap');
    const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
    const [crew, setCrew] = useState<CrewMember[]>([]);
    const [selectedOverlayIds, setSelectedOverlayIds] = useState<string[]>([]);
    const [showCrewPanel, setShowCrewPanel] = useState(false);
    const [chatOpen, setChatOpen] = useState(false);
    const [chatQuery, setChatQuery] = useState<string | null>(null);
    const [lastDiscovery, setLastDiscovery] = useState<DiscoveryEvent | null>(null);

    // Fetch crew list
    useEffect(() => {
        const fetchCrew = async () => {
            try {
                const res = await fetch('/api/follow');
                const json = await res.json();
                if (json.success && json.data) {
                    setCrew(json.data);
                }
            } catch (e) {
                console.error('Failed to fetch crew:', e);
            }
        };
        fetchCrew();
    }, []);

    const handleNodeClick = useCallback((node: GraphNode) => {
        if (node.group === 'mystery' || node.group === 'overlay') {
            // Open ChatPanel, close KnowledgePanel
            setSelectedTopicId(null);
            setChatQuery(node.name);
            setChatOpen(true);
        } else if (node.topicId) {
            // Open KnowledgePanel, close ChatPanel
            setChatOpen(false);
            setChatQuery(null);
            setSelectedTopicId(node.topicId);
        } else if (node.group === 'known' && !node.topicId) {
            console.warn("Node missing topicId", node);
            setSelectedTopicId(null);
            setChatQuery(node.name);
            setChatOpen(true);
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

    const toggleOverlay = useCallback((userId: string) => {
        setSelectedOverlayIds(prev =>
            prev.includes(userId)
                ? prev.filter(id => id !== userId)
                : [...prev, userId]
        );
    }, []);

    return (
        <div className="relative w-full h-full">
            <StarGraph
                onNodeClick={handleNodeClick}
                overlayUserIds={selectedOverlayIds}
                selectedNodeId={selectedTopicId}
                onQueryAI={handleQueryAI}
                newDiscovery={lastDiscovery}
            />
            <KnowledgePanel
                topicId={selectedTopicId}
                onClose={() => setSelectedTopicId(null)}
                onNavigate={(topicId) => setSelectedTopicId(topicId)}
            />

            {/* AI Chat Panel */}
            <ChatPanel
                isOpen={chatOpen}
                onClose={() => { setChatOpen(false); setChatQuery(null); }}
                initialQuery={chatQuery}
                onTopicDiscovered={handleTopicDiscovered}
            />

            {/* Crew Overlay Toggle */}
            {crew.length > 0 && (
                <div className="absolute top-4 left-4 z-40">
                    <button
                        onClick={() => setShowCrewPanel(!showCrewPanel)}
                        className={`px-3 py-2 rounded text-xs font-mono uppercase tracking-wider transition-all ${selectedOverlayIds.length > 0
                            ? 'bg-purple-900/50 border border-purple-500/50 text-purple-300'
                            : 'bg-black/60 border border-cyan-900/30 text-cyan-500 hover:text-cyan-300'
                            }`}
                    >
                        👥 {t('crewOverlay')} {selectedOverlayIds.length > 0 && `(${selectedOverlayIds.length})`}
                    </button>

                    {showCrewPanel && (
                        <div className="mt-2 bg-black/80 backdrop-blur-md border border-cyan-900/30 rounded-lg p-3 min-w-[200px] space-y-2">
                            {crew.map(member => (
                                <label
                                    key={member.id}
                                    className="flex items-center gap-3 cursor-pointer text-sm hover:bg-cyan-900/20 p-1.5 rounded transition-colors"
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedOverlayIds.includes(member.id)}
                                        onChange={() => toggleOverlay(member.id)}
                                        className="accent-purple-500"
                                    />
                                    <span className={selectedOverlayIds.includes(member.id) ? 'text-purple-300' : 'text-cyan-500'}>
                                        {member.name}
                                    </span>
                                </label>
                            ))}
                            {/* Legend */}
                            <div className="pt-2 border-t border-cyan-900/30 space-y-1 text-[10px] font-mono text-cyan-700">
                                <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block"></span> {t('legendMine')}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-purple-500 inline-block"></span> {t('legendOverlay')}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block"></span> {t('legendShared')}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
