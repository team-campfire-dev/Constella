'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import ReactMarkdown from 'react-markdown';
import DashboardLayout from '@/components/DashboardLayout';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

export default function ConsolePage() {
    const t = useTranslations('Console');
    const params = useParams(); // { locale: string }
    const locale = params.locale as string;
    const searchParams = useSearchParams();
    const initialQuery = searchParams.get('q');

    // params needs to be unwrapped safely in Next.js 15+, but 'use client' hooks handle it via props mostly.
    // However, in generic client components, we use props directly.

    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const [historyLoaded, setHistoryLoaded] = useState(false);

    useEffect(() => {
        // Load History
        fetch('/api/chat')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setMessages(data.data.map((msg: any) => ({
                        ...msg,
                        timestamp: new Date(msg.timestamp)
                    })));
                }
            })
            .catch(err => console.error("Failed to load chat history", err))
            .finally(() => setHistoryLoaded(true));
    }, []);

    const processedQueryRef = useRef<string | null>(null);

    useEffect(() => {
        if (historyLoaded && initialQuery && processedQueryRef.current !== initialQuery) {
            processedQueryRef.current = initialQuery;
            handleSendMessage(initialQuery);
        }
    }, [initialQuery, historyLoaded]);

    const handleSendMessage = async (text: string) => {
        if (!text.trim()) return;

        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: text,
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMsg]);
        setInput('');
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
                content: "⚠️ Connection Lost. The Ship's AI is offline.",
                timestamp: new Date()
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setIsLoading(false);
        }
    };

    // Replace [[Link]] with clickable spans that trigger a new message
    const renderContent = (content: string) => {
        // Simple regex replace for valid Markdown links is hard with React components in string.
        // We will preprocess: [[Link]] -> [Link](#console-link)
        // And use a custom renderer for links.

        // Actually simpler: Just use ReactMarkdown and standard link syntax?
        // But the AI returns [[Link]]. Let's replace brackets with markdown links.
        // [[Link]] -> [Link](?q=Link)

        const formatLinks = (text: string) => {
            return text.replace(/\[\[(.*?)\]\]/g, (match, p1) => {
                return `[${p1}](?q=${encodeURIComponent(p1)})`;
            });
        };

        return (
            <ReactMarkdown
                components={{
                    a: ({ node, ...props }) => (
                        <span
                            className="text-cyan-400 hover:text-cyan-200 cursor-pointer underline decoration-cyan-500/50 decoration-dotted underline-offset-4"
                            onClick={(e) => {
                                e.preventDefault();
                                const q = new URLSearchParams(props.href?.split('?')[1]).get('q');
                                if (q) handleSendMessage(q);
                            }}
                        >
                            {props.children}
                        </span>
                    )
                }}
            >
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
                    <h1 className="text-xl font-bold tracking-widest text-cyan-500 uppercase">
                        AI Comm. Console
                    </h1>
                    <div className="flex gap-2 text-xs text-cyan-700">
                        <span className="animate-pulse">●</span> ONLINE
                        <span>v3.0.FLASH</span>
                    </div>
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar z-20 scroll-pt-4">
                    {messages.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-cyan-800 opacity-50 space-y-4">
                            <div className="text-4xl">⍾</div>
                            <div>Awaiting Protocol Input...</div>
                        </div>
                    )}

                    {messages.map((msg) => (
                        <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[80%] rounded-lg p-4 border ${msg.role === 'user'
                                ? 'bg-cyan-900/30 border-cyan-500/50 text-cyan-100'
                                : 'bg-slate-900/80 border-cyan-800 text-slate-300'
                                }`}>
                                <div className="text-[10px] uppercase opacity-50 mb-1 flex justify-between gap-4">
                                    <span>{msg.role === 'user' ? 'Pilot' : 'AI Librarian'}</span>
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
                                <span>Processing Query...</span>
                            </div>
                        </div>
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
                            placeholder="Type your query..."
                            className="flex-1 bg-transparent border-none outline-none text-cyan-100 placeholder-cyan-800 font-mono py-3"
                            autoFocus
                        />
                        <button
                            type="submit"
                            disabled={isLoading || !input.trim()}
                            className="px-6 bg-cyan-900/50 hover:bg-cyan-800/80 text-cyan-300 rounded border border-cyan-700 disabled:opacity-30 transition-all uppercase text-sm font-bold tracking-wider"
                        >
                            Transmit
                        </button>
                    </form>
                </div>
            </div>
        </DashboardLayout>
    );
}
