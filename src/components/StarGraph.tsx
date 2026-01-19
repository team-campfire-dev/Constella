'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

// Define types for Node and Link
export interface GraphNode {
    id: number | string;
    name: string;
    val: number;
    color?: string;
    group?: string;
    x?: number;
    y?: number;
}

interface GraphLink {
    source: number | string | GraphNode;
    target: number | string | GraphNode;
}

interface GraphData {
    nodes: GraphNode[];
    links: GraphLink[];
}

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
    ssr: false,
    loading: () => <div className="flex items-center justify-center h-full text-[#38BDF8]">Loading Star Map...</div>
});

interface StarGraphProps {
    onNodeClick?: (node: GraphNode) => void;
}

export default function StarGraph({ onNodeClick }: StarGraphProps) {
    const fgRef = useRef<any>(null);
    const [data, setData] = useState<GraphData>({ nodes: [], links: [] });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch('/api/graph');
                if (!res.ok) throw new Error('Failed to fetch');
                const graphData = await res.json();

                // If API returns empty or error, maybe fallback or show empty state?
                // For now, let's assume it works or returns { nodes: [], links: [] }

                // Fallback for demo purposes if DB is empty or connection fails (optional, but good for dev)
                if (graphData.nodes?.length === 0) {
                    console.warn("Neo4j returned no data, falling back to demo data for visualization");
                    // We can put the random tree generator back here if needed, but for now let's trust the API
                }

                setData(graphData);
            } catch (error) {
                console.error("Error loading graph:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    const isMysteryLink = (link: any) => {
        // Check if either end of the link is a mystery node
        const sourceGroup = link.source.group || (link.source as GraphNode).group;
        const targetGroup = link.target.group || (link.target as GraphNode).group;
        return sourceGroup === 'mystery' || targetGroup === 'mystery';
    };

    return (
        <div className="w-full h-full bg-black rounded-lg overflow-hidden relative border border-gray-800">
            <ForceGraph2D
                ref={fgRef}
                graphData={data}
                nodeLabel="name"
                nodeRelSize={6}

                // Link styling: dashed and orange for mystery connections
                linkColor={(link: any) => isMysteryLink(link) ? "#FFA500" : "#00F0FF33"}
                linkLineDash={(link: any) => isMysteryLink(link) ? [5, 5] : null}

                backgroundColor="#000000"
                enableNodeDrag={false}
                onNodeClick={onNodeClick as any}

                // Custom node painting
                nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
                    const x = node.x;
                    const y = node.y;

                    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

                    const label = node.name;
                    const fontSize = 12 / globalScale;
                    ctx.font = `${fontSize}px Sans-Serif`;

                    // Size calculation (Scaled down significantly)
                    const r = (node.val || 4) * 0.3;

                    if (node.group === 'mystery') {
                        // Mystery Node Style: Dashed Orange Outline, Transparent Fill, "?" Center

                        // Size adjustment for visibility
                        // Ensure the outline is at least visible enough to contain the "?"
                        const visualR = Math.max(r, 6);

                        // Dashed Outline
                        ctx.beginPath();
                        ctx.setLineDash([2, 2]); // Tighter dashes
                        ctx.lineWidth = 1; // Thinner line
                        ctx.strokeStyle = '#FFA500';
                        ctx.arc(x, y, visualR, 0, 2 * Math.PI, false);
                        ctx.stroke();
                        ctx.setLineDash([]); // Reset dash for other elements

                        // Center "?" Text
                        ctx.fillStyle = '#FFA500';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';

                        // Keep text readable: min 10px, max restricted slightly so it doesn't look huge
                        // But allow scaling with zoom
                        const textSz = Math.max(fontSize, 10);
                        ctx.font = `bold ${textSz}px Sans-Serif`;
                        ctx.fillText("?", x, y - 0.5); // Slight optical centering

                        // Label below node (Name like "Black Hole") - Restore label as requested
                        ctx.font = `${fontSize}px Sans-Serif`;
                        ctx.fillStyle = '#FFA500'; // Orange text
                        ctx.fillText(label, x, y + r + fontSize + 2); // Position below

                    } else {
                        // Known Node Style: Solid Cyan Core, Glow

                        if (Number.isFinite(r) && r > 0) {
                            try {
                                const gradient = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 1.5);
                                gradient.addColorStop(0, node.color || "#00F0FF");
                                gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

                                ctx.fillStyle = gradient;
                                ctx.beginPath();
                                ctx.arc(x, y, r * 1.5, 0, 2 * Math.PI, false); // Glow slightly larger
                                ctx.fill();

                                // Solid core
                                ctx.fillStyle = node.color || "#00F0FF";
                                ctx.beginPath();
                                ctx.arc(x, y, r * 0.6, 0, 2 * Math.PI, false);
                                ctx.fill();
                            } catch (e) {
                                ctx.fillStyle = node.color || "#00F0FF";
                                ctx.beginPath();
                                ctx.arc(x, y, 4, 0, 2 * Math.PI, false);
                                ctx.fill();
                            }
                        }

                        // Label below node
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillStyle = "#00F0FF"; // Cyan text for known nodes
                        ctx.fillText(label, x, y + r + fontSize);
                    }
                }}
                // Paint interaction area (hit detection)
                nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
                    const r = (node.val || 4) * 0.3;
                    const hitR = node.group === 'mystery' ? Math.max(r, 6) : r * 1.5; // Match visual size

                    ctx.fillStyle = color;
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, hitR + 2, 0, 2 * Math.PI, false); // Slightly larger for better UX
                    ctx.fill();
                }}
            />

            {/* Input overlay at bottom */}
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 w-1/2 max-w-lg">
                <div className="relative">
                    <input
                        type="text"
                        placeholder="Transmitting signal..."
                        className="w-full bg-[#1C1E2D] text-gray-300 rounded-md py-3 px-4 pl-4 pr-12 border border-gray-700 focus:outline-none focus:border-[#38BDF8] focus:ring-1 focus:ring-[#38BDF8]"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                const target = e.target as HTMLInputElement;
                                if (target.value.trim()) {
                                    window.location.href = `/console?q=${encodeURIComponent(target.value)}`;
                                }
                            }
                        }}
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-gray-400">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                        </svg>
                    </div>
                </div>
            </div>

            {/* Zoom controls */}
            <div className="absolute bottom-4 right-4 flex space-x-2">
                <button className="bg-[#1C1E2D] p-2 rounded text-gray-400 hover:text-white border border-gray-700">
                    <span className="text-xl">+</span>
                </button>
                <button className="bg-[#1C1E2D] p-2 rounded text-gray-400 hover:text-white border border-gray-700">
                    <span className="text-xl">-</span>
                </button>
                <button className="bg-[#1C1E2D] p-2 rounded text-gray-400 hover:text-white border border-gray-700">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                    </svg>
                </button>
            </div>
        </div>
    );
}
