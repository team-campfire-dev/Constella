// 📡 In-Memory Pub/Sub for real-time COMMS (SSE)
// Singleton pattern with globalThis caching (same as prisma.ts, neo4j.ts)

import { EventEmitter } from 'events';

export interface CommsEvent {
    id: string;
    content: string;
    timestamp: Date;
    channel: string;
    user: {
        id: string;
        name: string;
        image?: string | null;
    };
}

const globalForPubSub = globalThis as unknown as { commsPubSub: EventEmitter };

const commsPubSub = globalForPubSub.commsPubSub || new EventEmitter();
commsPubSub.setMaxListeners(100); // Support up to 100 concurrent SSE connections

if (process.env.NODE_ENV !== 'production') {
    globalForPubSub.commsPubSub = commsPubSub;
}

export default commsPubSub;
