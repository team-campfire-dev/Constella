import test, { mock } from 'node:test';
import assert from 'node:assert';
import neo4j from 'neo4j-driver';

/* eslint-disable @typescript-eslint/no-explicit-any */

test('Neo4j driver initialization throws error when env vars are missing', async () => {
    // Clear global singleton
    delete (globalThis as any).neo4jDriver;

    // Save and clear env vars
    const originalUri = process.env.NEO4J_URI;
    const originalUser = process.env.NEO4J_USER;
    const originalPass = process.env.NEO4J_PASSWORD;

    delete process.env.NEO4J_URI;
    delete process.env.NEO4J_USER;
    delete process.env.NEO4J_PASSWORD;

    try {
        // Dynamic import to trigger the singleton initialization
        // This should now THROW an error
        await assert.rejects(
            async () => {
                await import('./neo4j.ts?cache-bust=' + Date.now());
            },
            {
                message: /Missing Neo4j environment variables/
            }
        );

    } finally {
        process.env.NEO4J_URI = originalUri;
        process.env.NEO4J_USER = originalUser;
        process.env.NEO4J_PASSWORD = originalPass;
        delete (globalThis as any).neo4jDriver;
    }
});

test('Neo4j driver initialization uses environment variables when present', async () => {
    // Clear global singleton
    delete (globalThis as any).neo4jDriver;

    const mockDriver = mock.method(neo4j, 'driver', () => ({}));
    const mockAuth = mock.method(neo4j.auth, 'basic', (u: string, p: string) => ({ user: u, pass: p }));

    process.env.NEO4J_URI = 'bolt://prod-host:7687';
    process.env.NEO4J_USER = 'prod-user';
    process.env.NEO4J_PASSWORD = 'prod-password';

    try {
        const { getDriver } = await import('./neo4j.ts?cache-bust=' + (Date.now() + 1));
        getDriver();

        assert.strictEqual(mockDriver.mock.calls[0].arguments[0], 'bolt://prod-host:7687');
        assert.strictEqual(mockAuth.mock.calls[0].arguments[0], 'prod-user');
        assert.strictEqual(mockAuth.mock.calls[0].arguments[1], 'prod-password');

    } finally {
        mock.restoreAll();
        delete (globalThis as any).neo4jDriver;
    }
});
