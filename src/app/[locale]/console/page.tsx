'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSearchParams, useParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import DashboardLayout from '@/components/DashboardLayout';
import { useTranslations } from 'next-intl';
import clsx from 'clsx';
// import UserAvatar from '@/components/UserAvatar';
import React from 'react';
import { Link } from '@/i18n/navigation';

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

// Helper to format wiki links into markdown links
const formatLinks = (text: string) => {
    return text.replace(/\[\[(.*?)\]\]/g, (match, p1) => {
        return `[${p1}](?q=${encodeURIComponent(p1)})`;
    });
};

// Memoized Chat Message Item to prevent re-rendering expensive ReactMarkdown on every keystroke
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ChatMessageItem = React.memo(({ msg, markdownComponents, t }: { msg: Message, markdownComponents: any, t: any }) => (
    <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-[80%] rounded-lg p-4 border ${msg.role === 'user'
            ? 'bg-cyan-900/30 border-cyan-500/50 text-cyan-100'
            : 'bg-slate-900/80 border-cyan-800 text-slate-300'
            }`}>
            <div className="text-[10px] uppercase opacity-50 mb-1 flex justify-between gap-4">
                <span>{msg.role === 'user' ? t('roleUser') : t('roleAI')}</span>
                <span>{msg.timestamp.toLocaleTimeString()}</span>
            </div>
            <div className="prose prose-invert prose-p:my-1 prose-headings:text-cyan-400 prose-strong:text-cyan-300 text-sm leading-relaxed">
                {msg.role === 'assistant' ? (
                    <ReactMarkdown components={markdownComponents}>
                        {formatLinks(msg.content)}
                    </ReactMarkdown>
                ) : (
                    msg.content
                )}
            </div>
        </div>
    </div>
));
ChatMessageItem.displayName = 'ChatMessageItem';

// Memoized Comms Message Item
const CommsMessageItem = React.memo(({ msg }: { msg: CommsMessage }) => {
    return (
        <div className="flex flex-col gap-1 mb-4">
            <div className="flex items-center gap-2 text-xs text-cyan-600">
                <Link
                    href={`/explorer/${msg.user.id}`}
                    className="font-bold text-cyan-400 hover:text-cyan-200 transition-colors"
                >
                    {msg.user.name}
                </Link>
                <span className="opacity-50">{msg.timestamp.toLocaleTimeString()}</span>
            </div>
            <div className="bg-slate-900/40 border border-cyan-900/30 rounded p-3 text-cyan-100 text-sm">
                {msg.content}
            </div>
        </div>
    );
});
CommsMessageItem.displayName = 'CommsMessageItem';

export default function ConsolePage() {
    const t = useTranslations('Console');
    const params = useParams(); // { locale: string }
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

    // Fetch topic name when channel is a topic channel
    useEffect(() => {
        if (commsChannel.startsWith('topic:')) {
            const topicId = commsChannel.replace('topic:', '');
            setTopicName(null); // reset while loading
            fetch(`/api/topic?id=${encodeURIComponent(topicId)}&lang=${locale}`)
                .then(res => res.json())
                .then(data => {
                    if (data.success && data.data?.name) {
                        setTopicName(data.data.name);
                    }
                })
                .catch(() => { /* topic name fetch failed, fallback will be used */ });
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

    // Check if user is scrolled near the bottom
    const isNearBottom = useCallback(() => {
        const container = messagesContainerRef.current;
        if (!container) return true;
        const threshold = 100; // px from bottom
        return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    }, []);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        setHasNewMessages(false);
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, commsMessages, activeTab, scrollToBottom]);

    // AI History Loading
    const [historyLoaded, setHistoryLoaded] = useState(false);

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
            // 1. Load history via existing REST endpoint
            try {
                const res = await fetch(`/api/comms?channel=${encodeURIComponent(commsChannel)}`);
                const data = await res.json();
                if (data.success) {
                    setCommsMessages(data.data.map((msg: { id: string; content: string; timestamp: string; user: { id: string; name: string; image?: string | null } }) => ({
                        ...msg,
                        timestamp: new Date(msg.timestamp)
                    })));
                }
            } catch (e) {
                console.error("Failed to load comms history", e);
            }

            // 2. Connect SSE stream for real-time updates
            eventSource = new EventSource(`/api/comms/stream?channel=${encodeURIComponent(commsChannel)}`);

            eventSource.onopen = () => {
                setCommsStatus('connected');
            };

            eventSource.onmessage = (event) => {
                try {
                    const newMsg = JSON.parse(event.data);
                    setCommsMessages(prev => {
                        // Deduplicate by id
                        if (prev.some(m => m.id === newMsg.id)) return prev;
                        return [...prev, {
                            ...newMsg,
                            timestamp: new Date(newMsg.timestamp)
                        }];
                    });

                    // Show "new messages" banner if not scrolled to bottom
                    if (!isNearBottom()) {
                        setHasNewMessages(true);
                    }
                } catch (e) {
                    console.error("Failed to parse SSE message", e);
                }
            };

            eventSource.onerror = () => {
                setCommsStatus('reconnecting');
                // EventSource auto-reconnects by default
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


    const handleSendMessage = useCallback(async (text: string) => {
        if (!text.trim()) return;

        // Optimistic clear or clear after success?
        // Clearing immediately feels better but risky if fails.
        // I'll keep immediate clear but handle error.
        const originalInput = text;
        setInput('');

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
                setInput(originalInput); // Restore input on error? Maybe confusing if error msg shown.
            } finally {
                setIsLoading(false);
            }
        } else {
            // Comms — SSE will deliver the message back, no need for follow-up GET
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
                // Message will arrive via SSE stream automatically
            } catch (err) {
                console.error("Failed to send comms", err);
                // Restore input on error
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
            // Small timeout to allow tab switch
            setTimeout(() => handleSendMessage(q), 100);
        }
    }, [activeTab, handleSendMessage]);

    // Memoize the components map so ReactMarkdown doesn't re-render its children on every state change
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

    return (
        <DashboardLayout>
            <div className="flex flex-col h-full bg-black/80 text-cyan-50 font-mono relative overflow-hidden">
                {/* CRT Scanline Effect Overlay */}
                <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-10 bg-[length:100%_2px,3px_100%] opacity-20"></div>

                {/* Header */}
                <div className="p-4 border-b border-cyan-900 bg-cyan-950/20 backdrop-blur-md flex justify-between items-center z-20">
                    <div className="flex items-center gap-4">
                        <h1 className="text-xl font-bold tracking-widest text-cyan-500 uppercase hidden md:block">
                            {t('headerTitle')}
                        </h1>
                        <div className="flex bg-cyan-900/30 rounded p-1">
                            <button
                                onClick={() => setActiveTab('ai')}
                                className={clsx(
                                    "px-4 py-1 rounded text-sm font-bold uppercase transition-all",
                                    activeTab === 'ai' ? "bg-cyan-600 text-white shadow-lg shadow-cyan-500/20" : "text-cyan-700 hover:text-cyan-400"
                                )}
                            >
                                AI Uplink
                            </button>
                            <button
                                onClick={() => setActiveTab('comms')}
                                className={clsx(
                                    "px-4 py-1 rounded text-sm font-bold uppercase transition-all",
                                    activeTab === 'comms' ? "bg-cyan-600 text-white shadow-lg shadow-cyan-500/20" : "text-cyan-700 hover:text-cyan-400"
                                )}
                            >
                                Public Comms
                            </button>
                        </div>
                        {/* Channel indicator (shown when on non-global channel) */}
                        {activeTab === 'comms' && commsChannel !== 'global' && (
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-cyan-500 font-mono bg-cyan-900/30 px-2 py-1 rounded border border-cyan-700/50">
                                    📡 {channelDisplayName}
                                </span>
                                <button
                                    onClick={() => setCommsChannel('global')}
                                    className="text-xs text-cyan-700 hover:text-cyan-400 transition-colors"
                                    title={t('channelGlobal')}
                                >
                                    ✕
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="flex gap-2 items-center text-xs text-cyan-700">
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
                        <span>{t('version')}</span>
                    </div>
                </div>

                {/* Messages Area */}
                <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar z-20 scroll-pt-4 relative">
                    {/* AI Chat View */}
                    {activeTab === 'ai' && (
                        <>
                            {messages.length === 0 && (
                                <div className="h-full flex flex-col items-center justify-center text-cyan-800 opacity-50 space-y-4">
                                    <div className="text-4xl">⍾</div>
                                    <div>{t('awaitingInput')}</div>
                                </div>
                            )}

                            {messages.map((msg) => (
                                <ChatMessageItem
                                    key={msg.id}
                                    msg={msg}
                                    markdownComponents={markdownComponents}
                                    t={t}
                                />
                            ))}

                            {isLoading && (
                                <div className="flex justify-start">
                                    <div className="bg-slate-900/50 p-4 rounded border border-cyan-900/50 flex gap-2 items-center text-cyan-500 text-sm">
                                        <span className="animate-spin">⟳</span>
                                        <span>{t('processing')}</span>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* Comms Chat View */}
                    {activeTab === 'comms' && (
                        <>
                            {commsMessages.length === 0 && (
                                <div className="h-full flex flex-col items-center justify-center text-cyan-800 opacity-50 space-y-4">
                                    <div className="text-4xl">📡</div>
                                    <div>No signals detected.</div>
                                </div>
                            )}

                            {commsMessages.map((msg) => (
                                <CommsMessageItem
                                    key={msg.id}
                                    msg={msg}
                                />
                            ))}
                        </>
                    )}

                    <div ref={messagesEndRef} />

                    {/* New Messages Banner */}
                    {hasNewMessages && activeTab === 'comms' && (
                        <button
                            onClick={scrollToBottom}
                            className="sticky bottom-2 left-1/2 -translate-x-1/2 bg-cyan-600/90 hover:bg-cyan-500/90 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg shadow-cyan-500/30 backdrop-blur-sm transition-all animate-bounce z-30 border border-cyan-400/50"
                        >
                            ↓ {t('newMessages')}
                        </button>
                    )}
                </div>

                {/* Input Area */}
                <div className="p-4 bg-black/40 border-t border-cyan-900 backdrop-blur z-20">
                    <form
                        onSubmit={(e) => { e.preventDefault(); handleSendMessage(input); }}
                        className="flex gap-2"
                    >
                        <span className="text-cyan-500 py-3 pl-2">&gt;</span>
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={activeTab === 'ai' ? t('inputPlaceholder') : t('broadcastPlaceholder')}
                            className="flex-1 bg-transparent border-none outline-none text-cyan-100 placeholder-cyan-800 font-mono py-3"
                            autoFocus
                        />
                        <button
                            type="submit"
                            disabled={(activeTab === 'ai' ? isLoading : isCommsLoading) || !input.trim()}
                            className="px-6 bg-cyan-900/50 hover:bg-cyan-800/80 text-cyan-300 rounded border border-cyan-700 disabled:opacity-30 transition-all uppercase text-sm font-bold tracking-wider"
                        >
                            {t('transmit')}
                        </button>
                    </form>
                </div>
            </div>
        </DashboardLayout>
    );
}
