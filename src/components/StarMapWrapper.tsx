'use client';

import { useState } from 'react';
import StarGraph, { GraphNode } from '@/components/StarGraph';
import KnowledgePanel from '@/components/KnowledgePanel';

import { useRouter } from '@/i18n/navigation';

export default function StarMapWrapper() {
    const router = useRouter();
    const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);

    const handleNodeClick = (node: GraphNode) => {
        // Use topicId (Prisma UUID) if available, otherwise fall back to id (Neo4j ID)
        // But api/topic expects UUID. Neo4j ID won't work.
        if (node.topicId) {
            setSelectedTopicId(node.topicId);
        } else if (node.group === 'mystery') {
            // Mystery Node: Redirect to Console to discover it
            // Use window.location as fallback or router? 
            // Better to use router for SPA feel if possible, but Console might need fresh state? No, SPA is fine.
            console.log("Navigating to mystery node:", node.name);
            router.push(`/console?q=${encodeURIComponent(node.name)}`);
        } else if (node.group === 'known' && !node.topicId) {
            console.warn("Node missing topicId", node);
            // Try fallback to name based search as if it was mystery?
            router.push(`/console?q=${encodeURIComponent(node.name)}`);
        }
    };

    return (
        <div className="relative w-full h-full">
            <StarGraph onNodeClick={handleNodeClick} />
            <KnowledgePanel
                topicId={selectedTopicId}
                onClose={() => setSelectedTopicId(null)}
                onNavigate={(topicId) => setSelectedTopicId(topicId)}
            />
        </div>
    );
}
