'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import DashboardLayout from '@/components/DashboardLayout';
import UserAvatar from '@/components/UserAvatar';
import { Link } from '@/i18n/navigation';

interface DmConversation {
    channel: string;
    partner: { id: string; name: string; image: string | null };
    lastMessage: string;
    lastTimestamp: string;
}

interface DmMessage {
    id: string;
    content: string;
    timestamp: string;
    user: { id: string; name: string; image: string | null };
}

export default function DmPage() {
    const t = useTranslations('DM');
    const searchParams = useSearchParams();
    const initialPartner = searchParams.get('partner');

    const [conversations, setConversations] = useState<DmConversation[]>([]);
    const [selectedPartner, setSelectedPartner] = useState<string | null>(initialPartner);
    const [selectedPartnerInfo, setSelectedPartnerInfo] = useState<{ id: string; name: string; image: string | null } | null>(null);
    const [messages, setMessages] = useState<DmMessage[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const eventSourceRef = useRef<EventSource | null>(null);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    // Fetch conversation list
    useEffect(() => {
        const fetchConversations = async () => {
            try {
                const res = await fetch('/api/dm');
                const json = await res.json();
                if (json.success) {
                    setConversations(json.data);
                    // If we have an initial partner but no info, try to get it from conversations
                    if (initialPartner) {
                        const conv = json.data.find((c: DmConversation) => c.partner.id === initialPartner);
                        if (conv) setSelectedPartnerInfo(conv.partner);
                    }
                }
            } catch (err) {
                console.error('Failed to fetch conversations:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchConversations();
    }, [initialPartner]);

    // Fetch messages for selected partner + SSE subscription
    useEffect(() => {
        if (!selectedPartner) return;

        const fetchMessages = async () => {
            try {
                const res = await fetch(`/api/dm?partner=${selectedPartner}`);
                const json = await res.json();
                if (json.success) {
                    setMessages(json.data.messages);
                    if (json.data.partner) {
                        setSelectedPartnerInfo(json.data.partner);
                    }
                    setTimeout(scrollToBottom, 100);
                }
            } catch (err) {
                console.error('Failed to fetch DM history:', err);
            }
        };
        fetchMessages();

        // SSE for real-time DM
        // We need the channel ID. We'll compute it on the server, but for SSE we need to know it.
        // We connect to the comms stream with the dm channel
        // The channel format is dm:{sorted userId pair}
        const connectSSE = async () => {
            // Get the channel from the history response
            const res = await fetch(`/api/dm?partner=${selectedPartner}`);
            const json = await res.json();
            if (!json.success) return;

            const channel = json.data.channel;

            if (eventSourceRef.current) {
                eventSourceRef.current.close();
            }

            const es = new EventSource(`/api/comms/stream?channel=${encodeURIComponent(channel)}`);
            es.onmessage = (event) => {
                try {
                    const newMsg = JSON.parse(event.data);
                    setMessages(prev => {
                        if (prev.some(m => m.id === newMsg.id)) return prev;
                        return [...prev, {
                            ...newMsg,
                            timestamp: newMsg.timestamp,
                        }];
                    });
                    setTimeout(scrollToBottom, 50);
                } catch (e) {
                    console.error('SSE parse error:', e);
                }
            };

            eventSourceRef.current = es;
        };

        connectSSE();

        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
        };
    }, [selectedPartner, scrollToBottom]);

    const handleSend = async () => {
        if (!input.trim() || !selectedPartner || sending) return;
        const text = input;
        setInput('');
        setSending(true);

        try {
            const res = await fetch('/api/dm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recipientId: selectedPartner, message: text }),
            });
            const json = await res.json();
            if (!json.success) {
                setInput(text); // Restore on error
            }
            // Message will arrive via SSE
        } catch {
            setInput(text);
        } finally {
            setSending(false);
        }
    };

    const selectConversation = (conv: DmConversation) => {
        setSelectedPartner(conv.partner.id);
        setSelectedPartnerInfo(conv.partner);
    };

    return (
        <DashboardLayout>
            <div className="flex h-full font-mono bg-black/80 text-cyan-50 relative overflow-hidden">
                {/* CRT overlay */}
                <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-10 bg-[length:100%_2px,3px_100%] opacity-20" />

                {/* Left Sidebar: Conversation List */}
                <div className="w-72 border-r border-cyan-900/30 bg-black/40 z-20 flex flex-col">
                    <div className="p-4 border-b border-cyan-900/30">
                        <h2 className="text-sm font-bold text-cyan-500 uppercase tracking-widest">
                            📨 {t('title')}
                        </h2>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {loading ? (
                            <div className="p-4 text-cyan-700 animate-pulse text-sm">{t('loading')}</div>
                        ) : conversations.length === 0 ? (
                            <div className="p-4 text-cyan-800 text-sm">{t('noConversations')}</div>
                        ) : (
                            conversations.map(conv => (
                                <button
                                    key={conv.channel}
                                    onClick={() => selectConversation(conv)}
                                    className={`w-full flex items-center gap-3 p-3 text-left transition-all hover:bg-cyan-900/20 ${selectedPartner === conv.partner.id
                                            ? 'bg-cyan-900/30 border-l-2 border-cyan-500'
                                            : 'border-l-2 border-transparent'
                                        }`}
                                >
                                    <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 border border-cyan-500/30">
                                        <UserAvatar name={conv.partner.name} image={conv.partner.image} size="sm" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold text-cyan-300 truncate">{conv.partner.name}</div>
                                        <div className="text-xs text-cyan-700 truncate">{conv.lastMessage}</div>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>

                {/* Right: Message Thread */}
                <div className="flex-1 flex flex-col z-20">
                    {selectedPartner ? (
                        <>
                            {/* Header */}
                            <div className="p-4 border-b border-cyan-900/30 bg-cyan-950/20 backdrop-blur-md flex items-center gap-3">
                                {selectedPartnerInfo && (
                                    <Link
                                        href={`/explorer/${selectedPartnerInfo.id}`}
                                        className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                                    >
                                        <div className="w-8 h-8 rounded-full overflow-hidden border border-cyan-500/30">
                                            <UserAvatar name={selectedPartnerInfo.name} image={selectedPartnerInfo.image} size="sm" />
                                        </div>
                                        <span className="font-bold text-cyan-200">{selectedPartnerInfo.name}</span>
                                    </Link>
                                )}
                            </div>

                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                                {messages.length === 0 ? (
                                    <div className="h-full flex items-center justify-center text-cyan-800 text-sm">
                                        {t('startConversation')}
                                    </div>
                                ) : (
                                    messages.map(msg => (
                                        <div key={msg.id} className="flex flex-col gap-1">
                                            <div className="flex items-center gap-2 text-xs text-cyan-600">
                                                <span className="font-bold text-cyan-400">{msg.user.name}</span>
                                                <span className="opacity-50">
                                                    {new Date(msg.timestamp).toLocaleTimeString()}
                                                </span>
                                            </div>
                                            <div className="bg-slate-900/40 border border-cyan-900/30 rounded p-3 text-cyan-100 text-sm">
                                                {msg.content}
                                            </div>
                                        </div>
                                    ))
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Input */}
                            <div className="p-4 bg-black/40 border-t border-cyan-900 backdrop-blur">
                                <form
                                    onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                                    className="flex gap-2"
                                >
                                    <span className="text-cyan-500 py-3 pl-2">&gt;</span>
                                    <input
                                        type="text"
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        placeholder={t('inputPlaceholder')}
                                        className="flex-1 bg-transparent border-none outline-none text-cyan-100 placeholder-cyan-800 font-mono py-3"
                                        autoFocus
                                    />
                                    <button
                                        type="submit"
                                        disabled={sending || !input.trim()}
                                        className="px-6 bg-cyan-900/50 hover:bg-cyan-800/80 text-cyan-300 rounded border border-cyan-700 disabled:opacity-30 transition-all uppercase text-sm font-bold tracking-wider"
                                    >
                                        {t('send')}
                                    </button>
                                </form>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-cyan-800">
                            <div className="text-center space-y-3">
                                <div className="text-4xl">📨</div>
                                <div className="text-sm">{t('selectConversation')}</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}
