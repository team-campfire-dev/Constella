/**
 * 🧪 Vitest Global Test Setup
 * 
 * Provides automatic mocking for external dependencies (Prisma, Neo4j, Logger, etc.)
 * so that unit tests can focus on business logic without requiring real DB connections.
 */
import { vi } from 'vitest';

// ─── Mock: Logger ───────────────────────────────────────────────────────────
vi.mock('@/lib/logger', () => ({
    default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

// ─── Mock: Prisma (Main DB) ────────────────────────────────────────────────
// Individual tests can override specific methods via vi.mocked()
vi.mock('@/lib/prisma', () => ({
    default: {
        user: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            upsert: vi.fn(),
        },
    },
}));

// ─── Mock: Prisma Content DB ────────────────────────────────────────────────
vi.mock('@/lib/prisma-content', () => ({
    default: {
        topic: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            findFirst: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            upsert: vi.fn(),
            count: vi.fn(),
        },
        article: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            upsert: vi.fn(),
        },
        shipLog: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            findFirst: vi.fn(),
            create: vi.fn(),
            count: vi.fn(),
            upsert: vi.fn(),
        },
        chatHistory: {
            create: vi.fn(),
            count: vi.fn(),
        },
        commsMessage: {
            findMany: vi.fn(),
            create: vi.fn(),
            count: vi.fn(),
        },
        achievement: {
            findMany: vi.fn(),
            create: vi.fn(),
        },
        follow: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
            delete: vi.fn(),
        },
        user: {
            upsert: vi.fn(),
        },
        alias: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
            upsert: vi.fn(),
        },
        wikiArticle: {
            upsert: vi.fn(),
        },
        $transaction: vi.fn(),
    },
}));

// ─── Mock: Neo4j Driver ─────────────────────────────────────────────────────
vi.mock('@/lib/neo4j', () => ({
    getDriver: vi.fn(() => ({
        session: vi.fn(() => ({
            beginTransaction: vi.fn(() => ({
                run: vi.fn(),
                commit: vi.fn(),
                rollback: vi.fn(),
            })),
            close: vi.fn(),
        })),
        close: vi.fn(),
    })),
}));
