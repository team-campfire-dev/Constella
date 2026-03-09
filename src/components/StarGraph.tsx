'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

// Define types for Node and Link
export interface GraphNode {
    id: number | string;
    topicId?: string;
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

export interface DiscoveryEvent {
    topicId: string;
    topicName: string;
    isNew: boolean;
}

interface StarGraphProps {
    onNodeClick?: (node: GraphNode) => void;
    overlayUserIds?: string[];
    selectedNodeId?: string | null;
    onQueryAI?: (query: string) => void;
    newDiscovery?: DiscoveryEvent | null;
}

// Internal Loading Component
function GraphLoading() {
    const t = useTranslations('StarMap');
    return <div className="flex items-center justify-center h-full text-[#38BDF8]">{t('loading')}</div>;
}

// Dynamic Import moved outside to prevent re-creation on every render
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
    ssr: false,
    loading: GraphLoading
});

// Helper Functions moved outside the component for referential stability

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isMysteryLink = (link: any) => {
    // Check if either end of the link is a mystery node
    const sourceGroup = link.source.group || (link.source as GraphNode).group;
    const targetGroup = link.target.group || (link.target as GraphNode).group;
    return sourceGroup === 'mystery' || targetGroup === 'mystery';
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getLinkColor = (link: any) => {
    const sourceGroup = link.source?.group || '';
    const targetGroup = link.target?.group || '';
    if (sourceGroup === 'overlay' || targetGroup === 'overlay') return '#A855F733';
    if (sourceGroup === 'shared' || targetGroup === 'shared') return '#FFD70044';
    return isMysteryLink(link) ? "#FFA500" : "#00F0FF33";
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getLinkLineDash = (link: any) => isMysteryLink(link) ? [5, 5] : null;

// Custom node painting
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handleNodeCanvasObject = (node: any, ctx: CanvasRenderingContext2D, globalScale: number, showLabel: boolean = true) => {
    const x = node.x;
    const y = node.y;

    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    const label = node.name;
    const fontSize = 12 / globalScale;
    ctx.font = `${fontSize}px Sans-Serif`;

    // Size calculation (Scaled down significantly)
    const r = (node.val || 4) * 0.3;

    if (node.group === 'mystery') {
        // Mystery Node Style: Amber glow + dashed outline + pulsing "?" center

        const visualR = Math.max(r, 6);

        // 1. Radial gradient glow (matching known/overlay/shared style)
        if (Number.isFinite(visualR) && visualR > 0) {
            try {
                const pulseAlpha = 0.5 + 0.3 * Math.sin(Date.now() * 0.003 + (node.id?.toString().length || 0));
                const gradient = ctx.createRadialGradient(x, y, visualR * 0.2, x, y, visualR * 1.8);
                gradient.addColorStop(0, '#FFB347');
                gradient.addColorStop(0.6, 'rgba(255, 163, 0, 0.3)');
                gradient.addColorStop(1, 'rgba(255, 103, 35, 0)');

                ctx.globalAlpha = pulseAlpha;
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(x, y, visualR * 1.8, 0, 2 * Math.PI, false);
                ctx.fill();
                ctx.globalAlpha = 1.0;

                // Solid amber core
                ctx.fillStyle = '#FFA500';
                ctx.beginPath();
                ctx.arc(x, y, visualR * 0.45, 0, 2 * Math.PI, false);
                ctx.fill();
            } catch {
                ctx.fillStyle = '#FFA500';
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, 2 * Math.PI, false);
                ctx.fill();
            }
        }

        // 2. Dashed outline ring (zoom-responsive lineWidth)
        ctx.beginPath();
        ctx.setLineDash([3 / globalScale, 3 / globalScale]);
        ctx.lineWidth = Math.max(1, 1.5 / globalScale);
        ctx.strokeStyle = '#FFA500';
        ctx.arc(x, y, visualR, 0, 2 * Math.PI, false);
        ctx.stroke();
        ctx.setLineDash([]);

        // 3. Center "?" text
        ctx.fillStyle = '#FFF8E7';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const textSz = Math.max(fontSize, 10);
        ctx.font = `bold ${textSz}px Sans-Serif`;
        ctx.fillText("?", x, y - 0.5);

        // 4. Label below node
        if (showLabel) {
            ctx.font = `${fontSize}px Sans-Serif`;
            ctx.fillStyle = '#FFA500';
            ctx.fillText(label, x, y + visualR + fontSize + 2);
        }

    } else if (node.group === 'overlay') {
        // Overlay Node Style: Purple glow, semi-transparent
        if (Number.isFinite(r) && r > 0) {
            try {
                const gradient = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 1.5);
                gradient.addColorStop(0, '#A855F7');
                gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.globalAlpha = 0.6;
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(x, y, r * 1.5, 0, 2 * Math.PI, false);
                ctx.fill();
                ctx.fillStyle = '#A855F7';
                ctx.beginPath();
                ctx.arc(x, y, r * 0.6, 0, 2 * Math.PI, false);
                ctx.fill();
                ctx.globalAlpha = 1.0;
            } catch {
                ctx.fillStyle = '#A855F7';
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, 2 * Math.PI, false);
            }
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#A855F7';
        if (showLabel) ctx.fillText(label, x, y + r + fontSize);

    } else if (node.group === 'shared') {
        // Shared Node Style: Gold glow
        if (Number.isFinite(r) && r > 0) {
            try {
                const gradient = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 1.5);
                gradient.addColorStop(0, '#FFD700');
                gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(x, y, r * 1.5, 0, 2 * Math.PI, false);
                ctx.fill();
                ctx.fillStyle = '#FFD700';
                ctx.beginPath();
                ctx.arc(x, y, r * 0.6, 0, 2 * Math.PI, false);
                ctx.fill();
            } catch {
                ctx.fillStyle = '#FFD700';
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, 2 * Math.PI, false);
            }
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFD700';
        if (showLabel) ctx.fillText(label, x, y + r + fontSize);

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
            } catch {
                ctx.fillStyle = node.color || "#00F0FF";
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, 2 * Math.PI, false);
            }
        }

        // Label below node
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = "#00F0FF";
        if (showLabel) ctx.fillText(label, x, y + r + fontSize);
    }
};

// Paint interaction area (hit detection)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const paintNodePointerArea = (node: any, color: string, ctx: CanvasRenderingContext2D) => {
    const r = (node.val || 4) * 0.3;
    const hitR = node.group === 'mystery' ? Math.max(r, 6) : r * 1.5; // Match visual size

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(node.x, node.y, hitR + 2, 0, 2 * Math.PI, false); // Slightly larger for better UX
    ctx.fill();
};

export default function StarGraph({ onNodeClick, overlayUserIds, selectedNodeId, onQueryAI, newDiscovery }: StarGraphProps) {
    const locale = useLocale();
    const t = useTranslations('StarMap');
    const router = useRouter();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fgRef = useRef<any>(null);
    const [data, setData] = useState<GraphData>({ nodes: [], links: [] });
    const [loading, setLoading] = useState(true);
    const [searchHighlightId, setSearchHighlightId] = useState<string | null>(null);
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
    const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const shouldZoomToFitRef = useRef(true); // Zoom to fit after engine stabilizes

    const handleZoomIn = () => {
        if (fgRef.current) {
            fgRef.current.zoom(fgRef.current.zoom() * 1.2, 400);
        }
    };

    const handleZoomOut = () => {
        if (fgRef.current) {
            fgRef.current.zoom(fgRef.current.zoom() / 1.2, 400);
        }
    };

    const handleResetZoom = () => {
        if (fgRef.current) {
            fgRef.current.zoomToFit(400);
        }
    };

    const handleSearch = useCallback((query: string) => {
        if (!query.trim()) return;
        const q = query.trim().toLowerCase();

        // Enhanced search: exact substring → prefix → fuzzy LCS
        let matchedNode = data.nodes.find(n => n.name.toLowerCase().includes(q));

        if (!matchedNode) {
            // Word-boundary prefix match (e.g. "bla" matches "Black Hole")
            matchedNode = data.nodes.find(n =>
                n.name.toLowerCase().split(/\s+/).some(word => word.startsWith(q))
            );
        }

        if (!matchedNode && q.length >= 2) {
            // Fuzzy: longest common subsequence ratio
            let bestScore = 0;
            for (const node of data.nodes) {
                const name = node.name.toLowerCase();
                let ni = 0;
                let qi = 0;
                let matched = 0;
                while (ni < name.length && qi < q.length) {
                    if (name[ni] === q[qi]) { matched++; qi++; }
                    ni++;
                }
                const score = qi === q.length ? matched / Math.max(name.length, q.length) : 0;
                if (score > bestScore && score > 0.3) {
                    bestScore = score;
                    matchedNode = node;
                }
            }
        }

        if (matchedNode && matchedNode.x != null && matchedNode.y != null && fgRef.current) {
            fgRef.current.centerAt(matchedNode.x, matchedNode.y, 800);
            fgRef.current.zoom(3, 800);
            setSearchHighlightId(matchedNode.id.toString());
            if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
            searchTimerRef.current = setTimeout(() => {
                setSearchHighlightId(null);
                searchTimerRef.current = null;
            }, 3000);
            if (inputRef.current) inputRef.current.value = '';
            // If the matched node is a mystery node, also open AI chat
            if (matchedNode.group === 'mystery' && onQueryAI) {
                onQueryAI(matchedNode.name);
            }
        } else {
            // No match in graph — ask AI
            if (onQueryAI) {
                onQueryAI(query);
            } else {
                router.push(`/${locale}/console?q=${encodeURIComponent(query)}`);
            }
            if (inputRef.current) inputRef.current.value = '';
        }
    }, [data.nodes, locale, router, onQueryAI]);

    // Handle node hover for custom tooltip
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleNodeHover = useCallback((node: any) => {
        if (node) {
            setHoveredNode(node as GraphNode);
            // Screen coords from the graph's internal transform
            const coords = fgRef.current?.graph2ScreenCoords(node.x, node.y);
            if (coords) {
                setHoverPos({ x: coords.x, y: coords.y });
            }
        } else {
            setHoveredNode(null);
            setHoverPos(null);
        }
        // Change cursor
        const canvas = fgRef.current?.canvas?.();
        if (canvas) {
            canvas.style.cursor = node ? 'pointer' : 'default';
        }
    }, []);

    // Phase 4: Re-fetch graph on new discovery
    const lastDiscoveryRef = useRef<string | null>(null);

    useEffect(() => {
        if (!newDiscovery || !newDiscovery.topicId) return;
        if (lastDiscoveryRef.current === newDiscovery.topicId) return;
        lastDiscoveryRef.current = newDiscovery.topicId;

        // Simply re-fetch the entire graph — clean and reliable
        const refetch = async () => {
            try {
                const overlayParam = overlayUserIds?.length
                    ? `&overlayUserIds=${overlayUserIds.join(',')}`
                    : '';
                const res = await fetch(`/api/graph?lang=${locale}${overlayParam}`);
                if (res.ok) {
                    const graphData = await res.json();
                    setData(graphData);
                    shouldZoomToFitRef.current = true;
                }
            } catch (e) {
                console.error('Graph refetch failed:', e);
            }
        };
        // Small delay to let the backend persist the new topic
        setTimeout(refetch, 2000);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [newDiscovery]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const overlayParam = overlayUserIds?.length
                    ? `&overlayUserIds=${overlayUserIds.join(',')}`
                    : '';
                const res = await fetch(`/api/graph?lang=${locale}${overlayParam}`);
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
                // Flag for zoomToFit on next engine stop
                shouldZoomToFitRef.current = true;
            } catch (error) {
                console.error("Error loading graph:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [locale, overlayUserIds]);

    // Build a set of neighbor node IDs for highlight logic
    // selectedNodeId can be a topicId (UUID) or a graph node id
    const selectedNeighborIds = useMemo(() => {
        if (!selectedNodeId) return null;
        // Resolve: selectedNodeId may be a topicId — find the matching graph node
        const matchedNode = data.nodes.find(
            n => n.id?.toString() === selectedNodeId || n.topicId === selectedNodeId
        );
        if (!matchedNode) return null;
        const resolvedId = matchedNode.id.toString();

        const neighborSet = new Set<string>();
        neighborSet.add(resolvedId);
        data.links.forEach(link => {
            const srcId = typeof link.source === 'object' ? (link.source as GraphNode).id?.toString() : link.source?.toString();
            const tgtId = typeof link.target === 'object' ? (link.target as GraphNode).id?.toString() : link.target?.toString();
            if (srcId === resolvedId && tgtId) neighborSet.add(tgtId);
            if (tgtId === resolvedId && srcId) neighborSet.add(srcId);
        });
        return neighborSet;
    }, [selectedNodeId, data.nodes, data.links]);

    // Wrap node canvas with selection-aware + zoom LOD + search highlight logic
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeCanvasWithSelection = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const nodeId = node.id?.toString();
        const isSelected = selectedNeighborIds?.has(nodeId);
        const isHighlighted = !selectedNeighborIds || isSelected;
        const isSearchHit = searchHighlightId === nodeId;
        const isHovered = hoveredNode?.id?.toString() === nodeId;

        if (!isHighlighted && !isSearchHit) {
            ctx.globalAlpha = 0.15;
        }

        // Determine if label should be shown (zoom LOD)
        const showLabel = globalScale >= 0.6 || !!isSelected || isSearchHit || isHovered;

        // Draw the base node with label control
        handleNodeCanvasObject(node, ctx, globalScale, showLabel);

        // Search highlight: bright ring
        if (isSearchHit) {
            const r = (node.val || 4) * 0.3;
            const visualR = node.group === 'mystery' ? Math.max(r, 6) : r * 1.5;
            ctx.strokeStyle = '#00FF88';
            ctx.lineWidth = Math.max(2, 3 / globalScale);
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(node.x, node.y, visualR + 3 / globalScale, 0, 2 * Math.PI, false);
            ctx.stroke();
        }

        // Hover highlight: subtle ring
        if (isHovered && !isSearchHit) {
            const r = (node.val || 4) * 0.3;
            const visualR = node.group === 'mystery' ? Math.max(r, 6) : r * 1.5;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = Math.max(1, 1.5 / globalScale);
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(node.x, node.y, visualR + 2 / globalScale, 0, 2 * Math.PI, false);
            ctx.stroke();
        }

        if (!isHighlighted && !isSearchHit) {
            ctx.globalAlpha = 1.0;
        }
    }, [selectedNeighborIds, searchHighlightId, hoveredNode]);

    // Wrap link color with selection-aware logic
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const linkColorWithSelection = useCallback((link: any) => {
        if (!selectedNeighborIds) return getLinkColor(link);
        const srcId = typeof link.source === 'object' ? link.source?.id?.toString() : link.source?.toString();
        const tgtId = typeof link.target === 'object' ? link.target?.id?.toString() : link.target?.toString();
        if (selectedNeighborIds.has(srcId) && selectedNeighborIds.has(tgtId)) {
            return getLinkColor(link);
        }
        return 'rgba(0, 240, 255, 0.03)';
    }, [selectedNeighborIds]);

    return (
        <div className="w-full h-full bg-black rounded-lg overflow-hidden relative border border-gray-800">
            <ForceGraph2D
                ref={fgRef}
                graphData={data}
                nodeLabel={() => ''}
                nodeRelSize={6}

                // Link styling: selection-aware
                linkColor={linkColorWithSelection}
                linkLineDash={getLinkLineDash}

                backgroundColor="#000000"
                enableNodeDrag={false}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                onNodeClick={onNodeClick as any}
                onNodeHover={handleNodeHover}
                onEngineStop={() => {
                    if (shouldZoomToFitRef.current && fgRef.current && data.nodes.length > 0) {
                        fgRef.current.zoomToFit(400, 100);
                        shouldZoomToFitRef.current = false;
                    }
                }}

                // Custom node painting (selection-aware + zoom LOD)
                nodeCanvasObject={nodeCanvasWithSelection}
                // Paint interaction area (hit detection)
                nodePointerAreaPaint={paintNodePointerArea}
            />

            {/* Empty state overlay */}
            {!loading && data.nodes.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-black/60 backdrop-blur-sm">
                    <div className="text-center max-w-sm px-6">
                        <div className="text-5xl mb-4">🌌</div>
                        <h2 className="text-xl font-bold text-cyan-400 mb-2">{t('emptyTitle')}</h2>
                        <p className="text-sm text-cyan-600 mb-6 leading-relaxed">{t('emptyDescription')}</p>
                        <button
                            onClick={() => router.push(`/${locale}/console`)}
                            className="px-6 py-2.5 bg-cyan-900/50 hover:bg-cyan-800/60 border border-cyan-500/40 rounded text-cyan-300 hover:text-cyan-100 text-sm font-mono uppercase tracking-wider transition-all"
                        >
                            {t('emptyAction')}
                        </button>
                    </div>
                </div>
            )}

            {/* Hover tooltip overlay */}
            {hoveredNode && hoverPos && (
                <div
                    className="absolute z-30 pointer-events-none"
                    style={{
                        left: hoverPos.x + 12,
                        top: hoverPos.y - 10,
                        transform: 'translateY(-100%)',
                    }}
                >
                    <div className="bg-black/90 backdrop-blur-md border border-cyan-800/50 rounded-lg px-3 py-2 shadow-lg max-w-[200px]">
                        <div className="text-xs font-bold text-cyan-300 truncate">{hoveredNode.name}</div>
                        <div className="flex items-center gap-1.5 mt-1">
                            <span className={`inline-block w-2 h-2 rounded-full ${hoveredNode.group === 'mystery' ? 'bg-amber-500' :
                                hoveredNode.group === 'overlay' ? 'bg-purple-500' :
                                    hoveredNode.group === 'shared' ? 'bg-yellow-400' :
                                        'bg-cyan-400'
                                }`} />
                            <span className="text-[10px] text-cyan-600 uppercase tracking-wider">
                                {hoveredNode.group === 'mystery' ? t('tooltipMystery') :
                                    hoveredNode.group === 'overlay' ? t('tooltipOverlay') :
                                        hoveredNode.group === 'shared' ? t('tooltipShared') :
                                            t('tooltipKnown')}
                            </span>
                        </div>
                        <div className="text-[10px] text-cyan-700 mt-1">
                            {hoveredNode.group === 'mystery' ? t('tooltipClickMystery') : t('tooltipClickKnown')}
                        </div>
                    </div>
                </div>
            )}

            {/* Input overlay at bottom */}
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 w-1/2 max-w-lg z-20">
                <div className="relative">
                    <input
                        ref={inputRef}
                        type="text"
                        aria-label={t('searchPlaceholder')}
                        placeholder={t('searchPlaceholder')}
                        className="w-full bg-[#1C1E2D] text-gray-300 rounded-md py-3 px-4 pl-4 pr-12 border border-gray-700 focus:outline-none focus:border-[#38BDF8] focus:ring-1 focus:ring-[#38BDF8]"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                handleSearch(e.currentTarget.value);
                            }
                        }}
                    />
                    <button
                        type="button"
                        aria-label={t('search')}
                        title={t('search')}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-[#38BDF8] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] rounded-r-md"
                        onClick={() => {
                            if (inputRef.current) {
                                handleSearch(inputRef.current.value);
                            }
                        }}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Zoom controls */}
            <div className="absolute bottom-4 right-4 flex space-x-2">
                <button
                    onClick={handleZoomIn}
                    className="bg-[#1C1E2D] p-2 rounded text-gray-400 hover:text-white border border-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8]"
                    aria-label={t('zoomIn')}
                    title={t('zoomIn')}
                >
                    <span className="text-xl">+</span>
                </button>
                <button
                    onClick={handleZoomOut}
                    className="bg-[#1C1E2D] p-2 rounded text-gray-400 hover:text-white border border-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8]"
                    aria-label={t('zoomOut')}
                    title={t('zoomOut')}
                >
                    <span className="text-xl">-</span>
                </button>
                <button
                    onClick={handleResetZoom}
                    className="bg-[#1C1E2D] p-2 rounded text-gray-400 hover:text-white border border-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8]"
                    aria-label={t('resetZoom')}
                    title={t('resetZoom')}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                    </svg>
                </button>
            </div>
        </div>
    );
}
