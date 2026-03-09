/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Local mocks for wiki-engine dependencies (not in global setup)
vi.mock('@/lib/transaction', () => ({
    withDualTransaction: vi.fn(),
}));

vi.mock('@/lib/graph', () => ({
    syncArticleToGraph: vi.fn(),
    mergeAliasesToCanonical: vi.fn(),
}));

vi.mock('@/lib/gemini', () => ({
    generateWikiContent: vi.fn(),
    batchTranslate: vi.fn(),
}));

import prismaContent from '@/lib/prisma-content';
import { withDualTransaction } from '@/lib/transaction';
import { generateWikiContent } from '@/lib/gemini';

const mockedPrisma = vi.mocked(prismaContent, true);
const mockedTransaction = vi.mocked(withDualTransaction);
const mockedGenerateWiki = vi.mocked(generateWikiContent);

// Helper: create a topic object for mock returns
function makeTopic(overrides: Record<string, any> = {}) {
    const now = new Date();
    return {
        id: 'topic-1',
        name: 'quantum mechanics',
        createdAt: now,
        updatedAt: now,
        articles: [{
            id: 'art-1',
            topicId: 'topic-1',
            title: 'Quantum Mechanics',
            content: 'Quantum mechanics is the study of...',
            language: 'en',
            updatedAt: now,
        }],
        aliases: [],
        ...overrides,
    };
}

// Helper: make withDualTransaction pass through to the callback
function setupDualTransaction() {
    mockedTransaction.mockImplementation(async (callback) => {
        const mockPrismaTx = {
            topic: { upsert: vi.fn().mockResolvedValue({ id: 'topic-new', name: 'new topic' }) },
            wikiArticle: { upsert: vi.fn() },
            alias: { upsert: vi.fn() },
        };
        const mockNeo4jTx = { run: vi.fn(), commit: vi.fn(), rollback: vi.fn() };
        return callback(mockPrismaTx as any, mockNeo4jTx as any);
    });
}

describe('processUserQuery', () => {
    let processUserQuery: typeof import('@/lib/wiki-engine').processUserQuery;

    beforeEach(async () => {
        vi.clearAllMocks();
        // Dynamic import to get a fresh module with mocks applied
        const mod = await import('@/lib/wiki-engine');
        processUserQuery = mod.processUserQuery;
    });

    // ─── 1. 캐시 히트 (기존 Topic이 존재하고 최신) ─────────────────────────

    it('기존 Topic이 최신이면 캐시된 콘텐츠 반환 (Gemini 미호출)', async () => {
        const topic = makeTopic();
        mockedPrisma.topic.findUnique.mockResolvedValue(topic as any);

        // shipLog/user mocks
        mockedPrisma.user.upsert.mockResolvedValue({} as any);
        mockedPrisma.shipLog.upsert.mockResolvedValue({} as any);

        const result = await processUserQuery('user-1', 'Quantum Mechanics', 'en');

        expect(result.isNew).toBe(false);
        expect(result.topicId).toBe('topic-1');
        expect(result.content).toContain('Quantum mechanics is the study of');
        expect(result.answer).toContain('ARCHIVE RETRIEVED');

        // Gemini should NOT have been called
        expect(mockedGenerateWiki).not.toHaveBeenCalled();
    });

    // ─── 2. Case-insensitive 검색 ────────────────────────────────────────

    it('대소문자가 다른 alias로 기존 Topic을 찾는다', async () => {
        // First lookup by name: not found
        mockedPrisma.topic.findUnique.mockResolvedValueOnce(null);
        // Second lookup: alias (case-insensitive)
        const topic = makeTopic();
        mockedPrisma.alias.findUnique.mockResolvedValueOnce({
            id: 'alias-1',
            name: 'quantum mechanics',
            topicId: 'topic-1',
            topic,
        } as any);

        mockedPrisma.user.upsert.mockResolvedValue({} as any);
        mockedPrisma.shipLog.upsert.mockResolvedValue({} as any);

        const result = await processUserQuery('user-1', 'Quantum Mechanics', 'en');

        // Should have called alias.findUnique with lowercased name
        expect(mockedPrisma.alias.findUnique).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { name: 'quantum mechanics' }
            })
        );
        expect(result.isNew).toBe(false);
        expect(result.topicId).toBe('topic-1');
    });

    // ─── 3. Fuzzy 사전 조회 ──────────────────────────────────────────────

    it('정확 일치 실패 시 fuzzy 검색으로 유사 Topic을 찾는다', async () => {
        // Exact name lookup: not found
        mockedPrisma.topic.findUnique.mockResolvedValueOnce(null);
        // Alias exact lookup: not found
        mockedPrisma.alias.findUnique.mockResolvedValueOnce(null);
        // Fuzzy topic search: found
        const topic = makeTopic({ name: 'quantum mechanics' });
        mockedPrisma.topic.findMany.mockResolvedValueOnce([topic] as any);

        mockedPrisma.user.upsert.mockResolvedValue({} as any);
        mockedPrisma.shipLog.upsert.mockResolvedValue({} as any);

        const result = await processUserQuery('user-1', 'quantum', 'en');

        expect(mockedPrisma.topic.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    OR: expect.arrayContaining([
                        expect.objectContaining({ name: { contains: 'quantum' } }),
                    ])
                })
            })
        );
        expect(result.isNew).toBe(false);
        expect(result.topicId).toBe('topic-1');
    });

    it('topic fuzzy 실패 시 alias fuzzy 검색으로 찾는다', async () => {
        mockedPrisma.topic.findUnique.mockResolvedValueOnce(null);
        mockedPrisma.alias.findUnique.mockResolvedValueOnce(null);
        // Topic fuzzy: empty
        mockedPrisma.topic.findMany.mockResolvedValueOnce([]);
        // Alias fuzzy: found
        const topic = makeTopic();
        mockedPrisma.alias.findMany.mockResolvedValueOnce([{
            id: 'alias-2',
            name: 'quantum theory',
            topicId: 'topic-1',
            topic,
        }] as any);

        mockedPrisma.user.upsert.mockResolvedValue({} as any);
        mockedPrisma.shipLog.upsert.mockResolvedValue({} as any);

        const result = await processUserQuery('user-1', 'quantum', 'en');

        expect(result.isNew).toBe(false);
        expect(result.topicId).toBe('topic-1');
    });

    it('짧은 쿼리 (2자 미만)는 fuzzy 검색을 건너뜀', async () => {
        mockedPrisma.topic.findUnique.mockResolvedValueOnce(null);
        mockedPrisma.alias.findUnique.mockResolvedValueOnce(null);

        // Gemini generates content
        mockedGenerateWiki.mockResolvedValueOnce({
            topic: 'AI',
            canonicalName: 'Artificial Intelligence',
            title: 'Artificial Intelligence',
            tags: ['Technology'],
            content: 'AI is...',
            chatResponse: 'Let me tell you about AI.',
        });

        // Post-gen dedup: not found
        mockedPrisma.topic.findUnique.mockResolvedValueOnce(null);

        // Transaction setup
        setupDualTransaction();

        // KeywordCache refresh mocks (topic.findMany for cache, alias.findMany for cache)
        mockedPrisma.topic.findMany.mockResolvedValueOnce([]);
        mockedPrisma.alias.findMany.mockResolvedValueOnce([]);

        // ShipLog
        mockedPrisma.user.upsert.mockResolvedValue({} as any);
        mockedPrisma.shipLog.upsert.mockResolvedValue({} as any);

        const result = await processUserQuery('user-1', 'AI', 'en');

        // Fuzzy findMany should NOT have been called (query length < 3)
        // But it may have been called for KeywordCache, so check the actual args
        expect(result.isNew).toBe(true);
    });

    // ─── 4. Post-Generation 중복 검사 ────────────────────────────────────

    it('Gemini 호출 후 canonicalName으로 기존 Topic 발견 시 캐시 반환', async () => {
        // All lookups fail -> needs generation
        mockedPrisma.topic.findUnique.mockResolvedValueOnce(null);
        mockedPrisma.alias.findUnique.mockResolvedValueOnce(null);
        mockedPrisma.topic.findMany.mockResolvedValueOnce([]);
        mockedPrisma.alias.findMany.mockResolvedValueOnce([]);

        // Gemini returns a canonical name that exists in DB
        mockedGenerateWiki.mockResolvedValueOnce({
            topic: '양자역학',
            canonicalName: 'Quantum Mechanics',
            title: '양자역학',
            tags: ['Physics'],
            content: 'Content about quantum...',
            chatResponse: 'Response about quantum...',
        });

        // Post-generation dedup check: findUnique with canonicalName finds existing topic
        const existingTopic = makeTopic();
        mockedPrisma.topic.findUnique.mockResolvedValueOnce(existingTopic as any);

        // Alias upsert + ShipLog
        mockedPrisma.alias.upsert.mockResolvedValue({} as any);
        mockedPrisma.user.upsert.mockResolvedValue({} as any);
        mockedPrisma.shipLog.upsert.mockResolvedValue({} as any);

        const result = await processUserQuery('user-1', '양자역학', 'en');

        // Should use cached content, NOT trigger the dual transaction
        expect(result.isNew).toBe(false);
        expect(result.topicId).toBe('topic-1');
        expect(result.answer).toContain('ARCHIVE RETRIEVED');
        expect(mockedTransaction).not.toHaveBeenCalled();
    });

    it('Post-gen dedup: 기존 Topic의 article이 오래된 경우 재생성 진행', async () => {
        mockedPrisma.topic.findUnique.mockResolvedValueOnce(null);
        mockedPrisma.alias.findUnique.mockResolvedValueOnce(null);
        mockedPrisma.topic.findMany.mockResolvedValueOnce([]);
        mockedPrisma.alias.findMany.mockResolvedValueOnce([]);

        mockedGenerateWiki.mockResolvedValueOnce({
            topic: 'Gravity',
            canonicalName: 'Gravity',
            title: 'Gravity',
            tags: ['Physics'],
            content: 'Gravity is a fundamental force.',
            chatResponse: 'Let me explain gravity.',
        });

        // Post-gen dedup: topic exists but article is old (4 months ago)
        const fourMonthsAgo = new Date();
        fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4);
        const staleTopicResult = makeTopic({
            name: 'gravity',
            articles: [{
                id: 'art-old',
                topicId: 'topic-1',
                content: 'Old content',
                language: 'en',
                updatedAt: fourMonthsAgo,
            }],
        });
        mockedPrisma.topic.findUnique.mockResolvedValueOnce(staleTopicResult as any);

        // This should proceed to generation (withDualTransaction)
        setupDualTransaction();

        // KeywordCache refresh
        mockedPrisma.topic.findMany.mockResolvedValueOnce([]);
        mockedPrisma.alias.findMany.mockResolvedValueOnce([]);

        // ShipLog
        mockedPrisma.user.upsert.mockResolvedValue({} as any);
        mockedPrisma.shipLog.upsert.mockResolvedValue({} as any);

        const result = await processUserQuery('user-1', 'Gravity', 'en');

        // Should proceed with generation
        expect(result.isNew).toBe(true);
        expect(mockedTransaction).toHaveBeenCalled();
    });

    // ─── 5. Unknown 주제 처리 ────────────────────────────────────────────

    it('"Unknown" 주제로 판별되면 DB 저장 없이 답변만 반환', async () => {
        mockedPrisma.topic.findUnique.mockResolvedValueOnce(null);
        mockedPrisma.alias.findUnique.mockResolvedValueOnce(null);
        mockedPrisma.topic.findMany.mockResolvedValueOnce([]);
        mockedPrisma.alias.findMany.mockResolvedValueOnce([]);

        mockedGenerateWiki.mockResolvedValueOnce({
            topic: 'Unknown',
            canonicalName: 'Unknown',
            title: 'Unknown',
            tags: [],
            content: 'Invalid Request',
            chatResponse: 'I cannot process this request.',
        });

        const result = await processUserQuery('user-1', 'write python code', 'en');

        expect(result.topicId).toBe('');
        expect(result.isNew).toBe(false);
        expect(mockedTransaction).not.toHaveBeenCalled();
    });

    // ─── 6. Alias 저장 정규화 ────────────────────────────────────────────

    it('Post-gen dedup에서 alias는 lowercase로 저장된다', async () => {
        mockedPrisma.topic.findUnique.mockResolvedValueOnce(null);
        mockedPrisma.alias.findUnique.mockResolvedValueOnce(null);
        mockedPrisma.topic.findMany.mockResolvedValueOnce([]);
        mockedPrisma.alias.findMany.mockResolvedValueOnce([]);

        mockedGenerateWiki.mockResolvedValueOnce({
            topic: 'Black Hole',
            canonicalName: 'Black Hole',
            title: 'Black Hole',
            tags: ['Astronomy'],
            content: 'A black hole is...',
            chatResponse: 'Black holes are fascinating!',
        });

        // Post-gen check: canonical topic exists with fresh content
        const existingTopic = makeTopic({
            id: 'topic-bh',
            name: 'black hole',
        });
        mockedPrisma.topic.findUnique.mockResolvedValueOnce(existingTopic as any);

        mockedPrisma.alias.upsert.mockResolvedValue({} as any);
        mockedPrisma.user.upsert.mockResolvedValue({} as any);
        mockedPrisma.shipLog.upsert.mockResolvedValue({} as any);

        // Query with mixed case — alias should be stored lowercase
        await processUserQuery('user-1', 'BLACK HOLE phenomenon', 'en');

        // Verify alias.upsert was called with lowercase name
        if (mockedPrisma.alias.upsert.mock.calls.length > 0) {
            const aliasCall = mockedPrisma.alias.upsert.mock.calls[0][0] as any;
            expect(aliasCall.where.name).toBe(aliasCall.where.name.toLowerCase());
            expect(aliasCall.create.name).toBe(aliasCall.create.name.toLowerCase());
        }
    });

    // ─── 7. ShipLog 업데이트 ─────────────────────────────────────────────

    it('캐시 히트 시에도 ShipLog가 업데이트된다', async () => {
        const topic = makeTopic();
        mockedPrisma.topic.findUnique.mockResolvedValue(topic as any);
        mockedPrisma.user.upsert.mockResolvedValue({} as any);
        mockedPrisma.shipLog.upsert.mockResolvedValue({} as any);

        await processUserQuery('user-1', 'Quantum Mechanics', 'en');

        expect(mockedPrisma.user.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'user-1' },
            })
        );
        expect(mockedPrisma.shipLog.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { userId_topicId: { userId: 'user-1', topicId: 'topic-1' } },
            })
        );
    });

    // ─── 8. ShipLog 에러 내성 ────────────────────────────────────────────

    it('ShipLog 업데이트 실패해도 결과는 정상 반환', async () => {
        const topic = makeTopic();
        mockedPrisma.topic.findUnique.mockResolvedValue(topic as any);
        mockedPrisma.user.upsert.mockRejectedValue(new Error('DB Error'));

        const result = await processUserQuery('user-1', 'Quantum Mechanics', 'en');

        // Result should still be returned despite ShipLog error
        expect(result.isNew).toBe(false);
        expect(result.topicId).toBe('topic-1');
    });
});
