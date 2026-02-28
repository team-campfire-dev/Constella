'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSearchParams, useParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import DashboardLayout from '@/components/DashboardLayout';
import { useTranslations } from 'next-intl';
import clsx from 'clsx';
// import UserAvatar from '@/components/UserAvatar';

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

export default function ConsolePage() {
    const t = useTranslations('Console');
    const params = useParams(); // { locale: string }
    const locale = params.locale as string;
    const searchParams = useSearchParams();
    const initialQuery = searchParams.get('q');

    const [activeTab, setActiveTab] = useState<'ai' | 'comms'>('ai');

    // AI Chat State
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Comms Chat State
    const [commsMessages, setCommsMessages] = useState<CommsMessage[]>([]);
    const [isCommsLoading, setIsCommsLoading] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, commsMessages, activeTab]);

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


    // Comms Polling
    useEffect(() => {
        let pollInterval: NodeJS.Timeout;

        const fetchComms = async () => {
            try {
                const res = await fetch('/api/comms?channel=global');
                const data = await res.json();
                if (data.success) {
                    setCommsMessages(data.data.map((msg: { id: string; content: string; timestamp: string; user: { id: string; name: string; image?: string | null } }) => ({
                        ...msg,
                        timestamp: new Date(msg.timestamp)
                    })));
                }
            } catch (e) {
                console.error("Comms poll error", e);
            }
        };

        if (activeTab === 'comms') {
            fetchComms();
            pollInterval = setInterval(fetchComms, 3000);
        }

        return () => {
            if (pollInterval) clearInterval(pollInterval);
        }
    }, [activeTab]);


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
            // Comms
            setIsCommsLoading(true);
            try {
                const res = await fetch('/api/comms', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: text,
                        channel: 'global'
                    })
                });
                const data = await res.json();
                if (data.success) {
                    // Trigger refresh
                    const pollRes = await fetch('/api/comms?channel=global');
                    const pollData = await pollRes.json();
                    if (pollData.success) {
                        setCommsMessages(pollData.data.map((msg: { id: string; content: string; timestamp: string; user: { id: string; name: string; image?: string | null } }) => ({
                            ...msg,
                            timestamp: new Date(msg.timestamp)
                        })));
                    }
                } else {
                    throw new Error(data.error || 'Failed to send');
                }
            } catch (err) {
                console.error("Failed to send comms", err);
                // Restore input on error
                setInput(originalInput);
            } finally {
                setIsCommsLoading(false);
            }
        }
    }, [activeTab, locale, t]);

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

    // Replace [[Link]] with clickable spans that trigger a new message
    const renderContent = (content: string) => {
        const formatLinks = (text: string) => {
            return text.replace(/\[\[(.*?)\]\]/g, (match, p1) => {
                return `[${p1}](?q=${encodeURIComponent(p1)})`;
            });
        };

        return (
            <ReactMarkdown components={markdownComponents}>
                {formatLinks(content)}
            </ReactMarkdown>
        );
    };

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
                    </div>
                    <div className="flex gap-2 text-xs text-cyan-700">
                        <span className="animate-pulse">●</span> {t('statusOnline')}
                        <span>{t('version')}</span>
                    </div>
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar z-20 scroll-pt-4">
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
                                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[80%] rounded-lg p-4 border ${msg.role === 'user'
                                        ? 'bg-cyan-900/30 border-cyan-500/50 text-cyan-100'
                                        : 'bg-slate-900/80 border-cyan-800 text-slate-300'
                                        }`}>
                                        <div className="text-[10px] uppercase opacity-50 mb-1 flex justify-between gap-4">
                                            <span>{msg.role === 'user' ? t('roleUser') : t('roleAI')}</span>
                                            <span>{msg.timestamp.toLocaleTimeString()}</span>
                                        </div>
                                        <div className="prose prose-invert prose-p:my-1 prose-headings:text-cyan-400 prose-strong:text-cyan-300 text-sm leading-relaxed">
                                            {msg.role === 'assistant' ? renderContent(msg.content) : msg.content}
                                        </div>
                                    </div>
                                </div>
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
                                <div key={msg.id} className="flex flex-col gap-1 mb-4">
                                    <div className="flex items-center gap-2 text-xs text-cyan-600">
                                        <span className="font-bold text-cyan-400">{msg.user.name}</span>
                                        <span className="opacity-50">{msg.timestamp.toLocaleTimeString()}</span>
                                    </div>
                                    <div className="bg-slate-900/40 border border-cyan-900/30 rounded p-3 text-cyan-100 text-sm">
                                        {msg.content}
                                    </div>
                                </div>
                            ))}
                        </>
                    )}

                    <div ref={messagesEndRef} />
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
                            placeholder={activeTab === 'ai' ? t('inputPlaceholder') : "Broadcast message..."}
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
