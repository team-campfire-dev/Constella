'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSearchParams, useParams } from 'next/navigation';

import ReactMarkdown from 'react-markdown';
import DashboardLayout from '@/components/DashboardLayout';
import UserAvatar from '@/components/UserAvatar';
import { useTranslations } from 'next-intl';
import clsx from 'clsx';
import React from 'react';
import { Link } from '@/i18n/navigation';
import { Hash, Globe, Search, X, ChevronDown } from 'lucide-react';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

interface CommsMessage {
    id: string;
    content: string;
    timestamp: Date;
    user: {
        id: string;
        name: string;
        image?: string | null;
    };
}

interface ChannelInfo {
    id: string;
    name: string;
    type: 'global' | 'topic';
}

// Helper to format wiki links into markdown links
const formatLinks = (text: string) => {
    return text.replace(/\[\[(.*?)\]\]/g, (match, p1) => {
        return `[${p1}](?q=${encodeURIComponent(p1)})`;
    });
};

// Helper: check if two dates are on the same day
const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

// Date separator component
const DateSeparator = ({ date }: { date: Date }) => {
    const formatted = date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
    return (
        <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-cyan-900/40" />
            <span className="text-[11px] text-cyan-700 font-mono uppercase tracking-wider">{formatted}</span>
            <div className="flex-1 h-px bg-cyan-900/40" />
        </div>
    );
};

// Memoized Chat Message Item
const ChatMessageItem = React.memo(({ msg, markdownComponents, t, isGrouped }: {
    msg: Message,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    markdownComponents: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    t: any,
    isGrouped: boolean,
}) => (
    <div className={clsx(
        'flex gap-3',
        msg.role === 'user' ? 'flex-row-reverse' : 'flex-row',
        isGrouped ? 'mt-1' : 'mt-5'
    )}>
        {/* Avatar */}
        {!isGrouped ? (
            <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden border border-cyan-700/40">
                {msg.role === 'user' ? (
                    <div className="w-full h-full bg-gradient-to-br from-cyan-800/60 to-slate-700 flex items-center justify-center">
                        <span className="text-xs font-bold text-cyan-300">👨‍🚀</span>
                    </div>
                ) : (
                    <div className="w-full h-full bg-gradient-to-br from-emerald-900/60 to-slate-800 flex items-center justify-center">
                        <span className="text-xs font-bold text-emerald-400">🛰️</span>
                    </div>
                )}
            </div>
        ) : (
            <div className="w-8 flex-shrink-0" /> // spacer for alignment
        )}

        {/* Bubble */}
        <div className={clsx(
            'max-w-[75%] rounded-xl px-4 py-2.5 border transition-colors',
            msg.role === 'user'
                ? 'bg-cyan-900/30 border-cyan-500/30 text-cyan-100 rounded-tr-sm'
                : 'bg-slate-900/60 border-cyan-800/30 text-slate-300 rounded-tl-sm'
        )}>
            {!isGrouped && (
                <div className="text-[10px] uppercase opacity-60 mb-1.5 flex justify-between gap-4">
                    <span className={msg.role === 'user' ? 'text-cyan-400' : 'text-emerald-400'}>
                        {msg.role === 'user' ? t('roleUser') : t('roleAI')}
                    </span>
                    <span className="text-cyan-700">{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
            )}
            <div className="prose prose-invert prose-p:my-1 prose-headings:text-cyan-400 prose-strong:text-cyan-300 text-sm leading-relaxed">
                {msg.role === 'assistant' ? (
                    <ReactMarkdown components={markdownComponents}>
                        {formatLinks(msg.content)}
                    </ReactMarkdown>
                ) : (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                )}
            </div>
        </div>
    </div>
));
ChatMessageItem.displayName = 'ChatMessageItem';

// Memoized Comms Message Item
const CommsMessageItem = React.memo(({ msg, isOwn, isGrouped }: {
    msg: CommsMessage,
    isOwn: boolean,
    isGrouped: boolean,
}) => {
    return (
        <div className={clsx(
            'flex gap-3',
            isOwn ? 'flex-row-reverse' : 'flex-row',
            isGrouped ? 'mt-0.5' : 'mt-4'
        )}>
            {/* Avatar */}
            {!isGrouped ? (
                <Link
                    href={`/explorer/${msg.user.id}`}
                    className="w-8 h-8 rounded-full flex-shrink-0 overflow-hidden border border-cyan-700/30 hover:border-cyan-500/60 transition-colors"
                >
                    <UserAvatar name={msg.user.name} image={msg.user.image} size="sm" />
                </Link>
            ) : (
                <div className="w-8 flex-shrink-0" />
            )}

            {/* Content */}
            <div className={clsx('max-w-[75%]', isOwn ? 'items-end' : 'items-start')}>
                {!isGrouped && (
                    <div className={clsx(
                        'flex items-center gap-2 text-[11px] mb-1',
                        isOwn ? 'flex-row-reverse' : 'flex-row'
                    )}>
                        <Link
                            href={`/explorer/${msg.user.id}`}
                            className={clsx(
                                'font-bold hover:underline transition-colors',
                                isOwn ? 'text-cyan-400' : 'text-cyan-500'
                            )}
                        >
                            {msg.user.name}
                        </Link>
                        <span className="text-cyan-800">
                            {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    </div>
                )}
                <div className={clsx(
                    'rounded-xl px-3.5 py-2 text-sm border transition-colors',
                    isOwn
                        ? 'bg-cyan-900/30 border-cyan-600/30 text-cyan-100 rounded-tr-sm'
                        : 'bg-slate-900/40 border-cyan-900/30 text-cyan-100 rounded-tl-sm'
                )}>
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                </div>
            </div>
        </div>
    );
});
CommsMessageItem.displayName = 'CommsMessageItem';

// Typing indicator component
const TypingIndicator = ({ label }: { label: string }) => (
    <div className="flex gap-3 mt-5">
        <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden border border-cyan-700/40">
            <div className="w-full h-full bg-gradient-to-br from-emerald-900/60 to-slate-800 flex items-center justify-center">
                <span className="text-xs font-bold text-emerald-400">🛰️</span>
            </div>
        </div>
        <div className="bg-slate-900/60 border border-cyan-800/30 rounded-xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
            <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
            <span className="text-xs text-cyan-600 ml-1">{label}</span>
        </div>
    </div>
);

export default function ConsolePage() {
    const t = useTranslations('Console');
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    // Fetch current user ID for own-message styling
    useEffect(() => {
        fetch('/api/auth/session')
            .then(res => res.json())
            .then(data => {
                if (data?.user?.id) setCurrentUserId(data.user.id);
            })
            .catch(() => { /* session fetch failed */ });
    }, []);
    const params = useParams();
    const locale = params.locale as string;
    const searchParams = useSearchParams();
    const initialQuery = searchParams.get('q');

    // Read channel and tab from URL params (from KnowledgePanel "Discuss" button)
    const initialChannel = searchParams.get('channel') || 'global';
    const initialTab = searchParams.get('tab') as 'ai' | 'comms' | null;

    const [activeTab, setActiveTab] = useState<'ai' | 'comms'>(initialTab || 'ai');
    const [commsChannel, setCommsChannel] = useState(initialChannel);

    // AI Chat State
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Comms Chat State
    const [commsMessages, setCommsMessages] = useState<CommsMessage[]>([]);
    const [isCommsLoading, setIsCommsLoading] = useState(false);
    const [commsStatus, setCommsStatus] = useState<'connected' | 'reconnecting' | 'disconnected'>('disconnected');
    const [hasNewMessages, setHasNewMessages] = useState(false);
    const [topicName, setTopicName] = useState<string | null>(null);

    // Channel sidebar state (Phase 3)
    const [showChannelSidebar, setShowChannelSidebar] = useState(false);
    const [availableChannels, setAvailableChannels] = useState<ChannelInfo[]>([
        { id: 'global', name: t('channelGlobal'), type: 'global' },
    ]);

    // Search state (Phase 3)
    const [searchQuery, setSearchQuery] = useState('');
    const [showSearch, setShowSearch] = useState(false);

    // Infinite scroll state (Phase 3)
    const [hasMoreHistory, setHasMoreHistory] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [oldestMsgTimestamp, setOldestMsgTimestamp] = useState<string | null>(null);

    // Fetch topic name when channel is a topic channel
    useEffect(() => {
        if (commsChannel.startsWith('topic:')) {
            const topicId = commsChannel.replace('topic:', '');
            setTopicName(null);
            fetch(`/api/topic?id=${encodeURIComponent(topicId)}&lang=${locale}`)
                .then(res => res.json())
                .then(data => {
                    if (data.success && data.data?.name) {
                        setTopicName(data.data.name);
                    }
                })
                .catch(() => { /* topic name fetch failed */ });
        } else {
            setTopicName(null);
        }
    }, [commsChannel, locale]);

    // Channel display name
    const channelDisplayName = commsChannel === 'global'
        ? t('channelGlobal')
        : `${t('channelTopic')}: ${topicName || commsChannel.replace('topic:', '').slice(0, 8).toUpperCase()}`;

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // AI History Loading — declared here so scrollToBottom can reference it
    const [historyLoaded, setHistoryLoaded] = useState(false);

    // Tracks whether initial scroll with content has been done (ref to avoid batching issues)
    const hasCompletedInitialScroll = useRef(false);

    // Check if user is scrolled near the bottom
    const isNearBottom = useCallback(() => {
        const container = messagesContainerRef.current;
        if (!container) return true;
        const threshold = 100;
        return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    }, []);

    const scrollToBottom = useCallback((instant?: boolean) => {
        const shouldBeInstant = instant || !hasCompletedInitialScroll.current;
        messagesEndRef.current?.scrollIntoView({
            behavior: shouldBeInstant ? "instant" : "smooth"
        });
        setHasNewMessages(false);
    }, []);

    useEffect(() => {
        scrollToBottom();
        // Mark initial scroll done only after scrolling with actual messages present
        if (!hasCompletedInitialScroll.current && (messages.length > 0 || commsMessages.length > 0)) {
            hasCompletedInitialScroll.current = true;
        }
    }, [messages, commsMessages, activeTab, scrollToBottom]);

    // Auto-resize textarea
    const adjustTextareaHeight = useCallback(() => {
        const el = textareaRef.current;
        if (el) {
            el.style.height = 'auto';
            el.style.height = Math.min(el.scrollHeight, 120) + 'px'; // max 4 lines ~120px
        }
    }, []);

    useEffect(() => {
        adjustTextareaHeight();
    }, [input, adjustTextareaHeight]);

    // AI History Loading

    useEffect(() => {
        let pollInterval: NodeJS.Timeout;

        const fetchHistory = async () => {
            try {
                const res = await fetch('/api/chat');
                const data = await res.json();

                if (data.success) {
                    const loadedMessages = data.data.map((msg: { id: string, role: string, content: string, timestamp: string }) => ({
                        ...msg,
                        timestamp: new Date(msg.timestamp)
                    }));
                    setMessages(loadedMessages);

                    if (loadedMessages.length > 0) {
                        const lastMsg = loadedMessages[loadedMessages.length - 1];
                        if (lastMsg.role === 'user') {
                            setIsLoading(true);
                            pollInterval = setInterval(async () => {
                                try {
                                    const pollRes = await fetch('/api/chat');
                                    const pollData = await pollRes.json();
                                    if (pollData.success) {
                                        const latestMessages = pollData.data;
                                        if (latestMessages.length > loadedMessages.length) {
                                            const newMsgs = latestMessages.map((msg: { id: string, role: string, content: string, timestamp: string }) => ({
                                                ...msg,
                                                timestamp: new Date(msg.timestamp)
                                            }));
                                            setMessages(newMsgs);
                                            setIsLoading(false);
                                            clearInterval(pollInterval);
                                        }
                                    }
                                } catch (e) {
                                    console.error("Polling error", e);
                                }
                            }, 3000);
                        }
                    }
                }
            } catch (err) {
                console.error("Failed to load chat history", err);
            } finally {
                setHistoryLoaded(true);
            }
        };

        fetchHistory();

        return () => {
            if (pollInterval) clearInterval(pollInterval);
        };
    }, []);

    // Auto-send initial query for AI
    const processedQueryRef = useRef<string | null>(null);
    useEffect(() => {
        if (historyLoaded && initialQuery && processedQueryRef.current !== initialQuery && activeTab === 'ai') {
            if (!isLoading) {
                processedQueryRef.current = initialQuery;
                handleSendMessage(initialQuery);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialQuery, historyLoaded, activeTab]);


    // Comms: Initial load + SSE real-time stream
    useEffect(() => {
        let eventSource: EventSource | null = null;

        const initComms = async () => {
            try {
                const res = await fetch(`/api/comms?channel=${encodeURIComponent(commsChannel)}`);
                const data = await res.json();
                if (data.success) {
                    const loaded = data.data.map((msg: { id: string; content: string; timestamp: string; user: { id: string; name: string; image?: string | null } }) => ({
                        ...msg,
                        timestamp: new Date(msg.timestamp)
                    }));
                    setCommsMessages(loaded);
                    // Check if there could be more history
                    if (loaded.length >= 50) {
                        setHasMoreHistory(true);
                        setOldestMsgTimestamp(loaded[0]?.timestamp?.toISOString() || null);
                    }
                }
            } catch (e) {
                console.error("Failed to load comms history", e);
            }

            // SSE stream for real-time updates
            eventSource = new EventSource(`/api/comms/stream?channel=${encodeURIComponent(commsChannel)}`);

            eventSource.onopen = () => {
                setCommsStatus('connected');
            };

            eventSource.onmessage = (event) => {
                try {
                    const newMsg = JSON.parse(event.data);
                    setCommsMessages(prev => {
                        if (prev.some(m => m.id === newMsg.id)) return prev;
                        return [...prev, {
                            ...newMsg,
                            timestamp: new Date(newMsg.timestamp)
                        }];
                    });

                    if (!isNearBottom()) {
                        setHasNewMessages(true);
                    }
                } catch (e) {
                    console.error("Failed to parse SSE message", e);
                }
            };

            eventSource.onerror = () => {
                setCommsStatus('reconnecting');
            };
        };

        if (activeTab === 'comms') {
            initComms();
        } else {
            setCommsStatus('disconnected');
        }

        return () => {
            if (eventSource) {
                eventSource.close();
                setCommsStatus('disconnected');
            }
        };
    }, [activeTab, isNearBottom, commsChannel]);

    // Load more history (infinite scroll)
    const loadMoreHistory = useCallback(async () => {
        if (isLoadingMore || !hasMoreHistory) return;
        setIsLoadingMore(true);
        try {
            let url = `/api/comms?channel=${encodeURIComponent(commsChannel)}&limit=50`;
            if (oldestMsgTimestamp) {
                url += `&before=${encodeURIComponent(oldestMsgTimestamp)}`;
            }
            const res = await fetch(url);
            const data = await res.json();
            if (data.success) {
                const olderMessages = data.data.map((msg: { id: string; content: string; timestamp: string; user: { id: string; name: string; image?: string | null } }) => ({
                    ...msg,
                    timestamp: new Date(msg.timestamp)
                }));
                if (olderMessages.length < 50) {
                    setHasMoreHistory(false);
                }
                if (olderMessages.length > 0) {
                    setOldestMsgTimestamp(olderMessages[0]?.timestamp?.toISOString() || null);
                    setCommsMessages(prev => {
                        // Deduplicate
                        const existingIds = new Set(prev.map(m => m.id));
                        const newMsgs = olderMessages.filter((m: CommsMessage) => !existingIds.has(m.id));
                        return [...newMsgs, ...prev];
                    });
                }
            }
        } catch (e) {
            console.error("Failed to load more history", e);
        } finally {
            setIsLoadingMore(false);
        }
    }, [isLoadingMore, hasMoreHistory, commsChannel, oldestMsgTimestamp]);

    // Infinite scroll handler
    const handleScroll = useCallback(() => {
        const container = messagesContainerRef.current;
        if (!container) return;
        if (container.scrollTop < 100 && hasMoreHistory && activeTab === 'comms') {
            loadMoreHistory();
        }
    }, [hasMoreHistory, activeTab, loadMoreHistory]);

    useEffect(() => {
        const container = messagesContainerRef.current;
        if (container) {
            container.addEventListener('scroll', handleScroll);
            return () => container.removeEventListener('scroll', handleScroll);
        }
    }, [handleScroll]);

    // Fetch available channels for sidebar
    useEffect(() => {
        // We always have global — fetch topic channels from user's ship log
        const fetchChannels = async () => {
            try {
                const res = await fetch('/api/ship-log');
                const data = await res.json();
                if (data.success && data.data) {
                    const topicChannels: ChannelInfo[] = data.data.slice(0, 20).map((log: { topicId: string; topicName: string }) => ({
                        id: `topic:${log.topicId}`,
                        name: log.topicName,
                        type: 'topic' as const,
                    }));
                    setAvailableChannels([
                        { id: 'global', name: t('channelGlobal'), type: 'global' },
                        ...topicChannels,
                    ]);
                }
            } catch {
                // Silently fail — just show global channel
            }
        };
        if (activeTab === 'comms') {
            fetchChannels();
        }
    }, [activeTab, t]);


    const handleSendMessage = useCallback(async (text: string) => {
        if (!text.trim()) return;

        const originalInput = text;
        setInput('');
        // Reset textarea height
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }

        if (activeTab === 'ai') {
            const userMsg: Message = {
                id: Date.now().toString(),
                role: 'user',
                content: text,
                timestamp: new Date()
            };

            setMessages(prev => [...prev, userMsg]);
            setIsLoading(true);

            try {
                const res = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: text,
                        language: locale || 'en'
                    })
                });

                const data = await res.json();

                if (data.success) {
                    const aiMsg: Message = {
                        id: (Date.now() + 1).toString(),
                        role: 'assistant',
                        content: data.content,
                        timestamp: new Date()
                    };
                    setMessages(prev => [...prev, aiMsg]);
                } else {
                    throw new Error(data.error);
                }
            } catch (err) {
                console.error(err);
                const errorMsg: Message = {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    content: t('connectionLost'),
                    timestamp: new Date()
                };
                setMessages(prev => [...prev, errorMsg]);
                setInput(originalInput);
            } finally {
                setIsLoading(false);
            }
        } else {
            // Comms
            setIsCommsLoading(true);
            try {
                const res = await fetch('/api/comms', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: text,
                        channel: commsChannel
                    })
                });
                const data = await res.json();
                if (!data.success) {
                    throw new Error(data.error || 'Failed to send');
                }
            } catch (err) {
                console.error("Failed to send comms", err);
                setInput(originalInput);
            } finally {
                setIsCommsLoading(false);
            }
        }
    }, [activeTab, locale, t, commsChannel]);

    // Handle link clicks from markdown
    const handleMarkdownLinkClick = useCallback((e: React.MouseEvent<HTMLSpanElement>, href?: string) => {
        e.preventDefault();
        const q = new URLSearchParams(href?.split('?')[1]).get('q');
        if (q) {
            if (activeTab !== 'ai') setActiveTab('ai');
            setTimeout(() => handleSendMessage(q), 100);
        }
    }, [activeTab, handleSendMessage]);

    // Memoize the components map so ReactMarkdown doesn't re-render
    const markdownComponents = useMemo(() => ({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        a: ({ ...props }: any) => (
            <span
                className="text-cyan-400 hover:text-cyan-200 cursor-pointer underline decoration-cyan-500/50 decoration-dotted underline-offset-4"
                onClick={(e) => handleMarkdownLinkClick(e, props.href)}
            >
                {props.children}
            </span>
        )
    }), [handleMarkdownLinkClick]);

    // Handle textarea keydown (Enter to send, Shift+Enter for newline)
    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage(input);
        }
    }, [handleSendMessage, input]);

    // Suggested questions for empty state
    const suggestedQueries = useMemo(() => [
        t('suggestQuantum'),
        t('suggestSolarSystem'),
        t('suggestBlackHole'),
        t('suggestDNA'),
    ], [t]);

    // Filter comms messages by search
    const filteredCommsMessages = useMemo(() => {
        if (!searchQuery.trim()) return commsMessages;
        const q = searchQuery.toLowerCase();
        return commsMessages.filter(m =>
            m.content.toLowerCase().includes(q) || m.user.name.toLowerCase().includes(q)
        );
    }, [commsMessages, searchQuery]);

    // Render messages with date separators and grouping
    const renderAIMessages = useMemo(() => {
        const elements: React.ReactNode[] = [];
        let lastDate: Date | null = null;

        messages.forEach((msg, i) => {
            // Date separator
            if (!lastDate || !isSameDay(lastDate, msg.timestamp)) {
                elements.push(<DateSeparator key={`date-${msg.id}`} date={msg.timestamp} />);
                lastDate = msg.timestamp;
            }

            // Grouping: same role + within 2 minutes
            const prevMsg = i > 0 ? messages[i - 1] : null;
            const isGrouped = prevMsg
                ? prevMsg.role === msg.role &&
                isSameDay(prevMsg.timestamp, msg.timestamp) &&
                (msg.timestamp.getTime() - prevMsg.timestamp.getTime()) < 120000
                : false;

            elements.push(
                <ChatMessageItem
                    key={msg.id}
                    msg={msg}
                    markdownComponents={markdownComponents}
                    t={t}
                    isGrouped={isGrouped}
                />
            );
        });

        return elements;
    }, [messages, markdownComponents, t]);

    const renderCommsMessages = useMemo(() => {
        const msgList = filteredCommsMessages;
        const elements: React.ReactNode[] = [];
        let lastDate: Date | null = null;

        msgList.forEach((msg, i) => {
            // Date separator
            if (!lastDate || !isSameDay(lastDate, msg.timestamp)) {
                elements.push(<DateSeparator key={`date-${msg.id}`} date={msg.timestamp} />);
                lastDate = msg.timestamp;
            }

            // Grouping: same user + within 2 minutes
            const prevMsg = i > 0 ? msgList[i - 1] : null;
            const isGrouped = prevMsg
                ? prevMsg.user.id === msg.user.id &&
                isSameDay(prevMsg.timestamp, msg.timestamp) &&
                (msg.timestamp.getTime() - prevMsg.timestamp.getTime()) < 120000
                : false;

            elements.push(
                <CommsMessageItem
                    key={msg.id}
                    msg={msg}
                    isOwn={msg.user.id === currentUserId}
                    isGrouped={isGrouped}
                />
            );
        });

        return elements;
    }, [filteredCommsMessages, currentUserId]);

    return (
        <DashboardLayout>
            <div className="flex h-full bg-black/80 text-cyan-50 font-mono relative overflow-hidden">
                {/* CRT Scanline Effect Overlay */}
                <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-10 bg-[length:100%_2px,3px_100%] opacity-20"></div>

                {/* Channel Sidebar (Comms tab) */}
                {activeTab === 'comms' && showChannelSidebar && (
                    <div className="w-56 border-r border-cyan-900/30 bg-black/60 backdrop-blur-md z-20 flex flex-col flex-shrink-0 animate-in slide-in-from-left duration-200">
                        <div className="p-3 border-b border-cyan-900/30 flex items-center justify-between">
                            <span className="text-xs font-bold text-cyan-500 uppercase tracking-widest">{t('channels')}</span>
                            <button onClick={() => setShowChannelSidebar(false)} className="text-cyan-700 hover:text-cyan-400 transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            {availableChannels.map(ch => (
                                <button
                                    key={ch.id}
                                    onClick={() => { setCommsChannel(ch.id); setShowChannelSidebar(false); }}
                                    className={clsx(
                                        'w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm transition-all hover:bg-cyan-900/20',
                                        commsChannel === ch.id
                                            ? 'bg-cyan-900/30 text-cyan-300 border-l-2 border-cyan-500'
                                            : 'text-cyan-600 border-l-2 border-transparent'
                                    )}
                                >
                                    {ch.type === 'global' ? (
                                        <Globe className="w-3.5 h-3.5 flex-shrink-0" />
                                    ) : (
                                        <Hash className="w-3.5 h-3.5 flex-shrink-0" />
                                    )}
                                    <span className="truncate">{ch.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Main Chat Area */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Header */}
                    <div className="px-4 py-3 border-b border-cyan-900 bg-cyan-950/20 backdrop-blur-md flex justify-between items-center z-20 flex-shrink-0">
                        <div className="flex items-center gap-3 min-w-0">
                            <h1 className="text-lg font-bold tracking-widest text-cyan-500 uppercase hidden md:block flex-shrink-0">
                                {t('headerTitle')}
                            </h1>
                            <div className="flex bg-cyan-900/30 rounded p-0.5 flex-shrink-0">
                                <button
                                    onClick={() => setActiveTab('ai')}
                                    className={clsx(
                                        "px-3 py-1 rounded text-xs font-bold uppercase transition-all",
                                        activeTab === 'ai' ? "bg-cyan-600 text-white shadow-lg shadow-cyan-500/20" : "text-cyan-700 hover:text-cyan-400"
                                    )}
                                >
                                    {t('tabAI')}
                                </button>
                                <button
                                    onClick={() => setActiveTab('comms')}
                                    className={clsx(
                                        "px-3 py-1 rounded text-xs font-bold uppercase transition-all",
                                        activeTab === 'comms' ? "bg-cyan-600 text-white shadow-lg shadow-cyan-500/20" : "text-cyan-700 hover:text-cyan-400"
                                    )}
                                >
                                    {t('tabComms')}
                                </button>
                            </div>
                            {/* Comms channel controls */}
                            {activeTab === 'comms' && (
                                <div className="flex items-center gap-2 min-w-0">
                                    <button
                                        onClick={() => setShowChannelSidebar(!showChannelSidebar)}
                                        className="flex items-center gap-1.5 text-xs text-cyan-500 font-mono bg-cyan-900/30 px-2 py-1 rounded border border-cyan-700/50 hover:border-cyan-500/50 transition-colors truncate max-w-[200px]"
                                    >
                                        📡 <span className="truncate">{channelDisplayName}</span>
                                        <ChevronDown className="w-3 h-3 flex-shrink-0" />
                                    </button>
                                    {commsChannel !== 'global' && (
                                        <button
                                            onClick={() => setCommsChannel('global')}
                                            className="text-xs text-cyan-700 hover:text-cyan-400 transition-colors"
                                            title={t('channelGlobal')}
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="flex gap-2 items-center text-xs text-cyan-700 flex-shrink-0">
                            {/* Search toggle (Comms) */}
                            {activeTab === 'comms' && (
                                <button
                                    onClick={() => setShowSearch(!showSearch)}
                                    className={clsx(
                                        "p-1.5 rounded transition-colors",
                                        showSearch ? "bg-cyan-900/40 text-cyan-400" : "text-cyan-700 hover:text-cyan-400"
                                    )}
                                >
                                    <Search className="w-3.5 h-3.5" />
                                </button>
                            )}
                            {activeTab === 'comms' ? (
                                <>
                                    <span className={clsx(
                                        'inline-block w-2 h-2 rounded-full',
                                        commsStatus === 'connected' && 'bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.7)]',
                                        commsStatus === 'reconnecting' && 'bg-amber-400 animate-pulse shadow-[0_0_6px_rgba(251,191,36,0.7)]',
                                        commsStatus === 'disconnected' && 'bg-red-400'
                                    )} />
                                    <span className={clsx(
                                        commsStatus === 'connected' && 'text-emerald-500',
                                        commsStatus === 'reconnecting' && 'text-amber-500',
                                        commsStatus === 'disconnected' && 'text-red-500'
                                    )}>
                                        {commsStatus === 'connected' ? t('commsLive') : commsStatus === 'reconnecting' ? t('commsReconnecting') : t('commsDisconnected')}
                                    </span>
                                </>
                            ) : (
                                <>
                                    <span className="animate-pulse">●</span> {t('statusOnline')}
                                </>
                            )}
                            <span className="hidden sm:inline">{t('version')}</span>
                        </div>
                    </div>

                    {/* Search Bar (Comms) */}
                    {showSearch && activeTab === 'comms' && (
                        <div className="px-4 py-2 border-b border-cyan-900/30 bg-black/40 z-20 flex-shrink-0">
                            <div className="flex items-center gap-2 bg-cyan-950/30 rounded border border-cyan-800/30 px-3 py-1.5">
                                <Search className="w-3.5 h-3.5 text-cyan-700 flex-shrink-0" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder={t('searchPlaceholder')}
                                    className="flex-1 bg-transparent border-none outline-none text-cyan-100 placeholder-cyan-800 text-xs font-mono"
                                    autoFocus
                                />
                                {searchQuery && (
                                    <button onClick={() => setSearchQuery('')} className="text-cyan-700 hover:text-cyan-400">
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Messages Area */}
                    <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-4 md:px-6 pb-4 custom-scrollbar z-20 scroll-pt-4 relative">
                        {/* Load more trigger */}
                        {activeTab === 'comms' && hasMoreHistory && (
                            <div className="flex justify-center py-3">
                                <button
                                    onClick={loadMoreHistory}
                                    disabled={isLoadingMore}
                                    className="text-xs text-cyan-700 hover:text-cyan-400 transition-colors disabled:opacity-30"
                                >
                                    {isLoadingMore ? t('loadingMore') : t('loadOlder')}
                                </button>
                            </div>
                        )}

                        {/* AI Chat View */}
                        {activeTab === 'ai' && (
                            <>
                                {messages.length === 0 && (
                                    <div className="h-full flex flex-col items-center justify-center text-cyan-800 space-y-6 py-12">
                                        <div className="text-5xl opacity-40">⍾</div>
                                        <div className="text-sm opacity-50">{t('awaitingInput')}</div>
                                        {/* Suggested queries */}
                                        <div className="flex flex-wrap gap-2 justify-center max-w-md">
                                            {suggestedQueries.map((q, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => handleSendMessage(q)}
                                                    className="px-3 py-1.5 text-xs border border-cyan-800/40 rounded-full text-cyan-600 hover:text-cyan-300 hover:border-cyan-600/60 hover:bg-cyan-900/20 transition-all"
                                                >
                                                    {q}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {renderAIMessages}

                                {isLoading && (
                                    <TypingIndicator label={t('processing')} />
                                )}
                            </>
                        )}

                        {/* Comms Chat View */}
                        {activeTab === 'comms' && (
                            <>
                                {commsMessages.length === 0 && (
                                    <div className="h-full flex flex-col items-center justify-center text-cyan-800 space-y-6 py-12">
                                        <div className="text-5xl opacity-40">📡</div>
                                        <div className="text-sm opacity-50">{t('noSignals')}</div>
                                        <p className="text-xs text-cyan-900 max-w-xs text-center">{t('commsWelcome')}</p>
                                    </div>
                                )}

                                {searchQuery && filteredCommsMessages.length === 0 && commsMessages.length > 0 && (
                                    <div className="text-center py-12 text-cyan-800 text-sm">
                                        {t('noSearchResults')}
                                    </div>
                                )}

                                {renderCommsMessages}
                            </>
                        )}

                        <div ref={messagesEndRef} />

                        {/* New Messages Banner */}
                        {hasNewMessages && activeTab === 'comms' && (
                            <button
                                onClick={() => scrollToBottom()}
                                className="sticky bottom-2 left-1/2 -translate-x-1/2 bg-cyan-600/90 hover:bg-cyan-500/90 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg shadow-cyan-500/30 backdrop-blur-sm transition-all animate-bounce z-30 border border-cyan-400/50"
                            >
                                ↓ {t('newMessages')}
                            </button>
                        )}
                    </div>

                    {/* Input Area */}
                    <div className="px-4 py-3 bg-black/40 border-t border-cyan-900 backdrop-blur z-20 flex-shrink-0">
                        <form
                            onSubmit={(e) => { e.preventDefault(); handleSendMessage(input); }}
                            className="flex gap-2 items-end"
                        >
                            <span className="text-cyan-500 py-2 pl-1 flex-shrink-0">&gt;</span>
                            <textarea
                                ref={textareaRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={activeTab === 'ai' ? t('inputPlaceholder') : t('broadcastPlaceholder')}
                                className="flex-1 bg-transparent border-none outline-none text-cyan-100 placeholder-cyan-800 font-mono py-2 resize-none min-h-[36px] max-h-[120px] leading-snug"
                                rows={1}
                                autoFocus
                            />
                            <button
                                type="submit"
                                disabled={(activeTab === 'ai' ? isLoading : isCommsLoading) || !input.trim()}
                                className="px-5 py-2 bg-cyan-900/50 hover:bg-cyan-800/80 text-cyan-300 rounded border border-cyan-700 disabled:opacity-30 transition-all uppercase text-xs font-bold tracking-wider flex-shrink-0"
                            >
                                {t('transmit')}
                            </button>
                        </form>
                        <div className="text-[10px] text-cyan-900 mt-1 pl-5">{t('inputHint')}</div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
