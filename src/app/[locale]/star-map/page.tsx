'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import StarGraph, { GraphNode } from '@/components/StarGraph';
import KnowledgePanel from '@/components/KnowledgePanel';

export default function StarMapPage() {
    const t = useTranslations('StarMap');
    const router = useRouter();
    const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);

    const handleNodeClick = (node: GraphNode) => {
        // Mystery Node: Navigate to Chat Console to ask about it
        if (node.group === 'mystery') {
            // We use 'name' to ask the AI.
            // node.name is the text like "Black Hole"
            router.push(`/console?q=${encodeURIComponent(node.name)}`);
            return;
        }

        // Known Node: Show details panel
        if (node && node.id) {
            setSelectedTopicId(node.id.toString());
        }
    };

    return (
        <DashboardLayout>
            <div className="p-6 h-full flex flex-col relative w-full h-full">
                <div className="mb-4">
                    <h1 className="text-xl font-bold text-gray-100">{t('cardTitle')}</h1>
                </div>
                <div className="flex-1 min-h-0 relative w-full h-full">
                    <StarGraph onNodeClick={handleNodeClick} />

                    {/* Knowledge Panel Overlay */}
                    <KnowledgePanel
                        topicId={selectedTopicId}
                        onClose={() => setSelectedTopicId(null)}
                        onNavigate={(id) => setSelectedTopicId(id)}
                    />
                </div>
            </div>
        </DashboardLayout>
    );
}
