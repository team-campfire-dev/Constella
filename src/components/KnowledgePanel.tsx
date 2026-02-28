'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';

interface KnowledgePanelProps {
    topicId: string | null;
    onClose: () => void;
    onNavigate?: (topicId: string) => void;
}

interface TopicDetail {
    id: string;
    name: string;
    content: string;
    language: string;
    updatedAt: string;
    tags: string[];
}

export default function KnowledgePanel({ topicId, onClose, onNavigate }: KnowledgePanelProps) {
    const locale = useLocale();
    const t = useTranslations('KnowledgePanel');
    const router = useRouter();
    const [data, setData] = useState<TopicDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!topicId) {
            setData(null);
            return;
        }

        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`/api/topic?id=${topicId}&lang=${locale}`);
                if (res.status === 403) {
                    setError("Access Denied. Encrypted Signal.");
                    return;
                }
                if (!res.ok) throw new Error("Failed to load knowledge");
                const json = await res.json();
                if (json.success) {
                    setData(json.data);
                } else {
                    throw new Error(json.error);
                }
            } catch (err) {
                console.error(err);
                setError("Signal Lost. Knowledge corrupted.");
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [topicId, locale]);

    const handleLinkClick = useCallback(async (linkName: string) => {
        console.log('[KnowledgePanel] Link Clicked:', linkName);
        // Check if topic exists and is discovered via API name lookup
        try {
            // We use the new 'name' parameter in the API
            const res = await fetch(`/api/topic?name=${encodeURIComponent(linkName)}&lang=${locale}`);
            if (res.ok) {
                const json = await res.json();
                if (json.success && json.data?.id) {
                    // Topic Discovered: Navigate to it within Panel
                    if (onNavigate) {
                        onNavigate(json.data.id);
                    }
                } else {
                    router.push(`/console?q=${encodeURIComponent(linkName)}`);
                }
            } else {
                router.push(`/console?q=${encodeURIComponent(linkName)}`);
            }
        } catch (e) {
            console.error(e);
            router.push(`/console?q=${encodeURIComponent(linkName)}`);
        }
    }, [locale, router, onNavigate]);

    const handleMarkdownLinkClick = useCallback((e: React.MouseEvent<HTMLSpanElement>, linkName: string) => {
        e.preventDefault();
        handleLinkClick(linkName);
    }, [handleLinkClick]);

    const markdownComponents = useMemo(() => ({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        a: ({ href, children, ...props }: any) => {
            if (href && href.startsWith('#wiki-')) {
                const linkName = decodeURIComponent(href.replace('#wiki-', ''));
                return (
                    <span
                        className="text-cyan-400 hover:text-cyan-200 cursor-pointer underline decoration-cyan-500/50 decoration-dotted underline-offset-4 font-bold"
                        onClick={(e) => handleMarkdownLinkClick(e, linkName)}
                    >
                        {children}
                    </span>
                );
            }
            return <a href={href} {...props} className="text-cyan-500 underline" target="_blank" rel="noopener noreferrer">{children}</a>
        }
    }), [handleMarkdownLinkClick]);

    const renderContent = (content: string) => {
        // Replace [[Link]] with [Link](#wiki-Link)
        // Using hash link prevents page navigation default and is safe for Markdown
        const processedContent = content.replace(/\[\[(.*?)\]\]/g, '[$1](#wiki-$1)');

        return (
            <ReactMarkdown components={markdownComponents}>
                {processedContent}
            </ReactMarkdown>
        );
    };

    if (!topicId) return null;

    return (
        <div className="fixed inset-y-0 right-0 w-96 bg-black/80 backdrop-blur-xl border-l border-cyan-500/30 text-cyan-50 z-50 transform transition-transform duration-300 ease-in-out shadow-[0_0_30px_rgba(0,240,255,0.1)] flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-cyan-900/50 flex justify-between items-center bg-cyan-950/20">
                <h2 className="text-lg font-bold tracking-widest text-cyan-400 uppercase truncate pr-4">
                    {loading ? t('decrypting') : data?.name || t('unknownArtifact')}
                </h2>
                <button
                    onClick={onClose}
                    className="p-1 hover:bg-cyan-900/50 rounded text-cyan-500 hover:text-cyan-200 transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-40 space-y-4 text-cyan-500/50">
                        <span className="animate-spin text-2xl">⟳</span>
                        <span className="text-xs uppercase tracking-widest">{t('accessing')}</span>
                    </div>
                ) : error ? (
                    <div className="text-red-400 text-center p-4 border border-red-500/30 bg-red-900/10 rounded">
                        {error === "Access Denied. Encrypted Signal." ? t('accessDenied') : error === "Signal Lost. Knowledge corrupted." ? t('signalLost') : error}
                    </div>
                ) : data ? (
                    <div className="space-y-6">
                        {/* Tags */}
                        {data.tags && data.tags.length > 0 && (
                            <div className="flex flex-wrap gap-2 animate-fade-in">
                                {data.tags.map(tag => (
                                    <span key={tag} className="px-2 py-1 text-xs font-medium uppercase tracking-wider text-cyan-300 bg-cyan-900/30 border border-cyan-500/30 rounded-sm">
                                        #{tag}
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* Article */}
                        <div className="prose prose-invert prose-p:text-slate-300 prose-headings:text-cyan-100 prose-a:text-cyan-400 prose-strong:text-cyan-200 text-sm leading-relaxed tracking-wide">
                            {renderContent(data.content)}
                        </div>

                        {/* Footer Info */}
                        <div className="pt-4 border-t border-cyan-900/30 text-xs text-cyan-700 font-mono">
                            <div>{t('archiveId')}: {data.id.slice(0, 8).toUpperCase()}</div>
                            <div>{t('lastUpdate')}: {new Date(data.updatedAt).toLocaleDateString()}</div>
                        </div>
                    </div>
                ) : null}
            </div>

            {/* Decorative Footer */}
            <div className="h-2 bg-gradient-to-r from-cyan-900 via-cyan-500 to-cyan-900 opacity-50"></div>
        </div>
    );
}
