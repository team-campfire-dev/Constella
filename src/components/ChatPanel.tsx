'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    isNew?: boolean;
    topicId?: string;
}

interface ChatPanelProps {
    isOpen: boolean;
    onClose: () => void;
    initialQuery?: string | null;
    onTopicDiscovered?: (topicId: string, topicName: string, isNew: boolean) => void;
}

// Format wiki links into clickable spans
const formatLinks = (text: string) => {
    return text.replace(/\[\[(.*?)\]\]/g, (_match, p1) => {
        return `**${p1}**`;
    });
};

export default function ChatPanel({ isOpen, onClose, initialQuery, onTopicDiscovered }: ChatPanelProps) {
    const t = useTranslations('Console');
    const params = useParams();
    const locale = params.locale as string;

    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [historyLoaded, setHistoryLoaded] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const processedQueryRef = useRef<string | null>(null);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, scrollToBottom]);

    // Auto-resize textarea
    useEffect(() => {
        const el = textareaRef.current;
        if (el) {
            el.style.height = 'auto';
            el.style.height = Math.min(el.scrollHeight, 80) + 'px';
        }
    }, [input]);

    // Load AI chat history
    useEffect(() => {
        if (!isOpen) return;
        const fetchHistory = async () => {
            try {
                const res = await fetch('/api/chat');
                const data = await res.json();
                if (data.success) {
                    const loaded = data.data.map((msg: { id: string; role: string; content: string; timestamp: string }) => ({
                        ...msg,
                        timestamp: new Date(msg.timestamp)
                    }));
                    setMessages(loaded);
                }
            } catch (err) {
                console.error("Failed to load chat history", err);
            } finally {
                setHistoryLoaded(true);
            }
        };
        fetchHistory();
    }, [isOpen]);

    // Handle initial query from mystery node click
    useEffect(() => {
        if (historyLoaded && initialQuery && processedQueryRef.current !== initialQuery && !isLoading) {
            processedQueryRef.current = initialQuery;
            handleSendMessage(initialQuery);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialQuery, historyLoaded]);

    const handleSendMessage = useCallback(async (text: string) => {
        if (!text.trim() || isLoading) return;

        setInput('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';

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
                body: JSON.stringify({ message: text, language: locale || 'en' })
            });
            const data = await res.json();

            if (data.success) {
                const aiMsg: Message = {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    content: data.content,
                    timestamp: new Date(),
                    isNew: data.isNew,
                    topicId: data.topicId
                };
                setMessages(prev => [...prev, aiMsg]);

                // Notify parent about new topic discovery
                if (data.isNew && data.topicId && onTopicDiscovered) {
                    // Extract topic name from the query
                    onTopicDiscovered(data.topicId, text, data.isNew);
                }
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
        } finally {
            setIsLoading(false);
        }
    }, [isLoading, locale, t, onTopicDiscovered]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage(input);
        }
    }, [handleSendMessage, input]);

    // Markdown renderer
    const markdownComponents = useMemo(() => ({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        a: ({ ...props }: any) => (
            <span className="text-cyan-400 hover:text-cyan-200 cursor-pointer underline decoration-cyan-500/50 decoration-dotted underline-offset-4">
                {props.children}
            </span>
        )
    }), []);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-y-0 right-0 w-96 bg-black/90 backdrop-blur-xl border-l border-cyan-500/20 z-50 flex flex-col shadow-[0_0_40px_rgba(0,240,255,0.08)] animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="px-4 py-3 border-b border-cyan-900/40 flex justify-between items-center bg-cyan-950/10 flex-shrink-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm">🛰️</span>
                    <h2 className="text-xs font-bold text-cyan-500 uppercase tracking-widest">{t('headerTitle')}</h2>
                    <span className="text-[10px] text-cyan-800 animate-pulse">●</span>
                    <span className="text-[10px] text-cyan-800">{t('statusOnline')}</span>
                </div>
                <button
                    onClick={onClose}
                    className="text-cyan-700 hover:text-cyan-400 transition-colors p-1"
                    aria-label="Close"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 pb-3 custom-scrollbar">
                {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-cyan-800 space-y-3 py-8">
                        <div className="text-3xl opacity-30">⍾</div>
                        <div className="text-xs opacity-50">{t('awaitingInput')}</div>
                    </div>
                )}

                {messages.map((msg) => (
                    <div key={msg.id} className={`flex gap-2 mt-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                        <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center border border-cyan-700/30 overflow-hidden">
                            {msg.role === 'user' ? (
                                <span className="text-[10px]">👨‍🚀</span>
                            ) : (
                                <span className="text-[10px]">🛰️</span>
                            )}
                        </div>
                        <div className={`max-w-[80%] rounded-lg px-3 py-2 border text-xs leading-relaxed ${msg.role === 'user'
                                ? 'bg-cyan-900/20 border-cyan-500/20 text-cyan-100 rounded-tr-sm'
                                : 'bg-slate-900/40 border-cyan-800/20 text-slate-300 rounded-tl-sm'
                            }`}>
                            {msg.role === 'assistant' ? (
                                <div className="prose prose-invert prose-p:my-0.5 prose-headings:text-cyan-400 prose-strong:text-cyan-300 text-xs">
                                    <ReactMarkdown components={markdownComponents}>
                                        {formatLinks(msg.content)}
                                    </ReactMarkdown>
                                </div>
                            ) : (
                                <span className="whitespace-pre-wrap">{msg.content}</span>
                            )}
                            {msg.isNew && (
                                <div className="mt-1.5 px-1.5 py-0.5 bg-emerald-900/30 border border-emerald-600/30 rounded text-[10px] text-emerald-400 inline-block">
                                    ✨ New discovery
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {isLoading && (
                    <div className="flex gap-2 mt-3">
                        <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center border border-cyan-700/30">
                            <span className="text-[10px]">🛰️</span>
                        </div>
                        <div className="bg-slate-900/40 border border-cyan-800/20 rounded-lg rounded-tl-sm px-3 py-2 flex items-center gap-1.5">
                            <span className="w-1 h-1 bg-cyan-500 rounded-full animate-bounce [animation-delay:0ms]" />
                            <span className="w-1 h-1 bg-cyan-500 rounded-full animate-bounce [animation-delay:150ms]" />
                            <span className="w-1 h-1 bg-cyan-500 rounded-full animate-bounce [animation-delay:300ms]" />
                            <span className="text-[10px] text-cyan-700 ml-1">{t('processing')}</span>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-3 py-2 border-t border-cyan-900/40 bg-black/40 flex-shrink-0">
                <form
                    onSubmit={(e) => { e.preventDefault(); handleSendMessage(input); }}
                    className="flex gap-2 items-end"
                >
                    <span className="text-cyan-600 text-xs py-1.5">&gt;</span>
                    <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={t('inputPlaceholder')}
                        className="flex-1 bg-transparent border-none outline-none text-cyan-100 placeholder-cyan-800 font-mono text-xs py-1.5 resize-none min-h-[28px] max-h-[80px] leading-snug"
                        rows={1}
                    />
                    <button
                        type="submit"
                        disabled={isLoading || !input.trim()}
                        className="px-3 py-1.5 bg-cyan-900/40 hover:bg-cyan-800/60 text-cyan-400 rounded border border-cyan-700/50 disabled:opacity-30 transition-all uppercase text-[10px] font-bold tracking-wider flex-shrink-0"
                    >
                        {t('transmit')}
                    </button>
                </form>
            </div>
        </div>
    );
}
