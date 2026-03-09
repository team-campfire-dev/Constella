import { describe, it, expect, vi, beforeEach } from 'vitest';

/* eslint-disable @typescript-eslint/no-explicit-any */

// Unmock graph module so we can test the real functions
vi.doUnmock('@/lib/graph');

describe('syncArticleToGraph', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('메인 토픽과 키워드 노드를 생성하는 Cypher 쿼리를 실행한다', async () => {
        const { syncArticleToGraph } = await import('./graph');
        const tx = { run: vi.fn().mockResolvedValue({ records: [] }) };

        await syncArticleToGraph(tx as any, 'quantum mechanics', ['physics', 'energy'], ['Science'], 'topic-1');

        expect(tx.run).toHaveBeenCalledTimes(1);
        const [query, params] = tx.run.mock.calls[0];

        expect(query).toContain('MERGE (main:Topic { name: $title })');
        expect(query).toContain('MERGE (related:Topic { name: keyword })');
        expect(query).toContain('MERGE (tag:Tag { name: tagName })');

        expect(params.title).toBe('quantum mechanics');
        expect(params.linkedKeywords).toEqual(['physics', 'energy']);
        expect(params.tags).toEqual(['Science']);
        expect(params.topicId).toBe('topic-1');
    });

    it('빈 키워드/태그 배열로도 정상 실행', async () => {
        const { syncArticleToGraph } = await import('./graph');
        const tx = { run: vi.fn().mockResolvedValue({ records: [] }) };

        await syncArticleToGraph(tx as any, 'test topic', [], [], 'topic-2');

        expect(tx.run).toHaveBeenCalledTimes(1);
        const params = tx.run.mock.calls[0][1];
        expect(params.linkedKeywords).toEqual([]);
        expect(params.tags).toEqual([]);
    });

    it('topicId 미제공 시 null로 전달', async () => {
        const { syncArticleToGraph } = await import('./graph');
        const tx = { run: vi.fn().mockResolvedValue({ records: [] }) };

        await syncArticleToGraph(tx as any, 'no-id-topic', ['keyword1']);

        const params = tx.run.mock.calls[0][1];
        expect(params.topicId).toBeNull();
    });
});

describe('mergeAliasesToCanonical', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('별칭을 정식 명칭 노드로 병합하는 Cypher 쿼리를 실행한다', async () => {
        const { mergeAliasesToCanonical } = await import('./graph');
        const tx = { run: vi.fn().mockResolvedValue({ records: [] }) };

        await mergeAliasesToCanonical(tx as any, 'quantum mechanics', ['양자역학', 'quantum physics']);

        expect(tx.run).toHaveBeenCalledTimes(1);
        const [query, params] = tx.run.mock.calls[0];

        expect(query).toContain('MERGE (main:Topic { name: $canonicalName })');
        expect(query).toContain('MATCH (ghost:Topic { name: aliasName })');
        expect(query).toContain('DETACH DELETE ghost');

        expect(params.canonicalName).toBe('quantum mechanics');
        expect(params.aliases).toEqual(['양자역학', 'quantum physics']);
    });

    it('빈 별칭 배열이면 쿼리를 실행하지 않는다', async () => {
        const { mergeAliasesToCanonical } = await import('./graph');
        const tx = { run: vi.fn().mockResolvedValue({ records: [] }) };

        await mergeAliasesToCanonical(tx as any, 'quantum mechanics', []);

        expect(tx.run).not.toHaveBeenCalled();
    });
});
