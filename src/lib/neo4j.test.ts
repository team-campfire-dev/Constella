import { describe, it, expect, vi, beforeEach } from 'vitest';
import neo4j from 'neo4j-driver';

/* eslint-disable @typescript-eslint/no-explicit-any */

// We need fresh imports for each test that modifies env/globals,
// so we use dynamic imports with cache-busting.

describe('Neo4j Driver', () => {
    beforeEach(() => {
        // Clear global singleton between tests
        delete (globalThis as any).neo4jDriver;
    });

    it('환경변수 누락 시 에러 발생', async () => {
        const originalUri = process.env.NEO4J_URI;
        const originalUser = process.env.NEO4J_USER;
        const originalPass = process.env.NEO4J_PASSWORD;

        delete process.env.NEO4J_URI;
        delete process.env.NEO4J_USER;
        delete process.env.NEO4J_PASSWORD;

        try {
            // Unmock so we test the real module logic
            vi.doUnmock('@/lib/neo4j');

            await expect(async () => {
                const mod = await import('./neo4j.ts?cache-bust=' + Date.now());
                mod.getDriver();
            }).rejects.toThrow(/Missing Neo4j environment variables/);
        } finally {
            process.env.NEO4J_URI = originalUri;
            process.env.NEO4J_USER = originalUser;
            process.env.NEO4J_PASSWORD = originalPass;
            delete (globalThis as any).neo4jDriver;
        }
    });

    it('환경변수가 있으면 정상 초기화', async () => {
        const spyDriver = vi.spyOn(neo4j, 'driver').mockReturnValue({} as any);
        const spyAuth = vi.spyOn(neo4j.auth, 'basic').mockReturnValue({ user: 'u', pass: 'p' } as any);

        process.env.NEO4J_URI = 'bolt://prod-host:7687';
        process.env.NEO4J_USER = 'prod-user';
        process.env.NEO4J_PASSWORD = 'prod-password';

        try {
            vi.doUnmock('@/lib/neo4j');
            const mod = await import('./neo4j.ts?cache-bust=' + (Date.now() + 1));
            mod.getDriver();

            expect(spyDriver).toHaveBeenCalledWith('bolt://prod-host:7687', expect.anything());
            expect(spyAuth).toHaveBeenCalledWith('prod-user', 'prod-password');
        } finally {
            vi.restoreAllMocks();
            delete (globalThis as any).neo4jDriver;
        }
    });
});
