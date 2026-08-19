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
    routeQuery: vi.fn(),
    generateArticleBody: vi.fn(),
    batchTranslate: vi.fn(),
    // Stub: 기본은 항상 통과시켜 재생성 분기를 타지 않도록.
    // (판정 로직 자체는 gemini.test.ts의 evaluateWikiContent 단위 테스트에서 검증)
    evaluateWikiContent: vi.fn(() => ({ ok: true, headings: 5, links: 10, words: 600, reasons: [], score: 3 })),
}));

import prismaContent from '@/lib/prisma-content';
import { withDualTransaction } from '@/lib/transaction';
import { syncArticleToGraph } from '@/lib/graph';
import { routeQuery, generateArticleBody, evaluateWikiContent } from '@/lib/gemini';

const mockedPrisma = vi.mocked(prismaContent, true);
const mockedTransaction = vi.mocked(withDualTransaction);
const mockedSync = vi.mocked(syncArticleToGraph);
const mockedRoute = vi.mocked(routeQuery);
const mockedBody = vi.mocked(generateArticleBody);
const mockedEvaluate = vi.mocked(evaluateWikiContent);

const FRESH = new Date();
const STALE = new Date(Date.now() - 1000 * 60 * 60 * 24 * 200); // ~6.5개월 전

function makeTopic(overrides: Record<string, any> = {}) {
    return {
        id: 'topic-1',
        name: 'quantum mechanics',
        createdAt: FRESH,
        updatedAt: FRESH,
        tags: [],
        aliases: [],
        articles: [{
            id: 'art-1',
            topicId: 'topic-1',
            title: 'Quantum Mechanics',
            content: '## Overview\nQuantum mechanics is the study of...',
            language: 'en',
            updatedAt: FRESH,
        }],
        ...overrides,
    };
}

/**
 * 이름 -> 토픽 저장소. findUnique가 여기를 본다.
 * 트랜잭션 목이 여기에 새 토픽을 등록하므로, ④가 만든 토픽을 ⑤가 조회할 수 있다.
 */
let topicStore: Record<string, any> = {};

function mockTopicsByName(byName: Record<string, any>) {
    topicStore = byName;
    mockedPrisma.topic.findUnique.mockImplementation((args: any) =>
        Promise.resolve(topicStore[args?.where?.name] ?? null) as any
    );
}

function setupDualTransaction() {
    mockedTransaction.mockImplementation(async (callback: any) => {
        const prismaTx = {
            topic: {
                upsert: vi.fn().mockImplementation(async (args: any) => {
                    const name = args?.where?.name;
                    const created = { id: 'topic-new', name };
                    // 실제 트랜잭션처럼 저장소에 반영한다. 본문 없는 스텁 상태.
                    topicStore[name] = {
                        ...created, tags: [], aliases: [],
                        articles: [{
                            id: 'art-new', topicId: 'topic-new', title: 'T',
                            content: null, language: 'en', updatedAt: FRESH,
                        }],
                    };
                    return created;
                }),
            },
            wikiArticle: { upsert: vi.fn() },
            alias: { upsert: vi.fn() },
        };
        const neo4jTx = { run: vi.fn(), commit: vi.fn(), rollback: vi.fn() };
        return callback(prismaTx as any, neo4jTx as any);
    });
}

/** 라우터 기본 응답 */
function routerResult(over: Record<string, any> = {}) {
    return {
        intent: 'new_topic',
        chatResponse: '양자역학은 [[입자]]를 다룹니다.',
        topic: 'Quantum Mechanics',
        canonicalName: 'Quantum Mechanics',
        title: '양자역학',
        tags: ['physics'],
        ...over,
    } as any;
}

/** fire-and-forget으로 띄운 백그라운드 작업이 진행되도록 이벤트 루프를 한 바퀴 돌린다. */
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function baseMocks() {
    mockedPrisma.alias.findUnique.mockResolvedValue(null as any);
    mockedPrisma.alias.findMany.mockResolvedValue([] as any);
    mockedPrisma.alias.upsert.mockResolvedValue({} as any);
    mockedPrisma.topic.findMany.mockResolvedValue([] as any);
    mockedPrisma.user.upsert.mockResolvedValue({} as any);
    mockedPrisma.shipLog.upsert.mockResolvedValue({} as any);
    mockedPrisma.chatHistory.findFirst.mockResolvedValue(null as any);
    mockedEvaluate.mockReturnValue({ ok: true, headings: 5, links: 10, words: 600, reasons: [], score: 3 });
    mockedBody.mockResolvedValue('## Overview\n생성된 본문 [[입자]]');
    setupDualTransaction();
}

describe('processUserQuery', () => {
    let processUserQuery: typeof import('@/lib/wiki-engine').processUserQuery;

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();
        baseMocks();
        processUserQuery = (await import('@/lib/wiki-engine')).processUserQuery;
    });

    // ─── ① 사전 조회: 모델을 부르지 않는 경로 ─────────────────────────────

    it('사전 조회가 신선한 본문을 찾으면 라우터를 호출하지 않는다', async () => {
        mockTopicsByName({ 'quantum mechanics': makeTopic() });

        const result = await processUserQuery('user-1', 'Quantum Mechanics', 'en');

        expect(mockedRoute).not.toHaveBeenCalled();
        expect(mockedBody).not.toHaveBeenCalled();
        expect(result.topicId).toBe('topic-1');
        expect(result.isNew).toBe(false);
        expect(result.answer).toContain('ARCHIVE RETRIEVED');
    });

    it('별칭으로도 사전 조회에 성공한다', async () => {
        mockTopicsByName({});
        mockedPrisma.alias.findUnique.mockResolvedValue({ topic: makeTopic() } as any);

        const result = await processUserQuery('user-1', '양자역학', 'en');

        expect(mockedRoute).not.toHaveBeenCalled();
        expect(result.topicId).toBe('topic-1');
    });

    it('정확 일치가 없으면 fuzzy 검색으로 찾는다', async () => {
        mockTopicsByName({});
        mockedPrisma.topic.findMany.mockResolvedValue([makeTopic()] as any);

        const result = await processUserQuery('user-1', 'quantum mechanic', 'en');

        expect(mockedRoute).not.toHaveBeenCalled();
        expect(result.topicId).toBe('topic-1');
    });

    it('2자 이하 쿼리는 fuzzy 검색을 건너뛴다', async () => {
        mockTopicsByName({});
        mockedRoute.mockResolvedValue(routerResult());

        await processUserQuery('user-1', 'qm', 'en');

        expect(mockedPrisma.topic.findMany).not.toHaveBeenCalled();
        expect(mockedRoute).toHaveBeenCalled();
    });

    it('본문 없는 스텁은 캐시 히트가 아니다', async () => {
        const stub = makeTopic({
            articles: [{ id: 'a', topicId: 'topic-1', title: 'T', content: null, language: 'en', updatedAt: FRESH }],
        });
        mockTopicsByName({ 'quantum mechanics': stub });
        mockedRoute.mockResolvedValue(routerResult());

        await processUserQuery('user-1', 'Quantum Mechanics', 'en');

        expect(mockedRoute).toHaveBeenCalled();
    });

    it('낡은 본문은 캐시 히트가 아니다', async () => {
        const stale = makeTopic({
            articles: [{ id: 'a', topicId: 'topic-1', title: 'T', content: '## Old', language: 'en', updatedAt: STALE }],
        });
        mockTopicsByName({ 'quantum mechanics': stale });
        mockedRoute.mockResolvedValue(routerResult());

        await processUserQuery('user-1', 'Quantum Mechanics', 'en');

        expect(mockedRoute).toHaveBeenCalled();
    });

    // ─── ② 라우터 분기 ──────────────────────────────────────────────────

    it('reject면 아무것도 저장하지 않고 답변만 돌려준다', async () => {
        mockTopicsByName({});
        mockedRoute.mockResolvedValue(routerResult({
            intent: 'reject', chatResponse: '작업 요청은 처리할 수 없습니다.',
            topic: '', canonicalName: '', title: '', tags: [],
        }));

        const result = await processUserQuery('user-1', '이 코드 리팩터링해줘', 'ko');

        expect(result.topicId).toBe('');
        expect(result.isNew).toBe(false);
        expect(mockedTransaction).not.toHaveBeenCalled();
        expect(mockedPrisma.shipLog.upsert).not.toHaveBeenCalled();
        await flush();
        expect(mockedBody).not.toHaveBeenCalled();
    });

    it('follow_up은 서버가 기억한 직전 토픽을 쓰고 본문을 건드리지 않는다', async () => {
        mockTopicsByName({});
        mockedPrisma.chatHistory.findFirst.mockResolvedValue({ topicId: 'topic-prev' } as any);
        mockedRoute.mockResolvedValue(routerResult({
            intent: 'follow_up', topic: '', canonicalName: '', title: '', tags: [],
        }));

        const result = await processUserQuery('user-1', '좀 더 자세히', 'ko');

        expect(result.topicId).toBe('topic-prev');
        expect(mockedTransaction).not.toHaveBeenCalled();
        expect(mockedPrisma.shipLog.upsert).toHaveBeenCalled();
        await flush();
        expect(mockedBody).not.toHaveBeenCalled();
    });

    it('follow_up인데 직전 기록이 없으면 답변만 돌려준다', async () => {
        mockTopicsByName({});
        mockedPrisma.chatHistory.findFirst.mockResolvedValue(null as any);
        mockedRoute.mockResolvedValue(routerResult({
            intent: 'follow_up', topic: '', canonicalName: '', title: '', tags: [],
        }));

        const result = await processUserQuery('user-1', '좀 더 자세히', 'ko');

        expect(result.topicId).toBe('');
        expect(mockedTransaction).not.toHaveBeenCalled();
    });

    // ─── ③ canonical 재조회 ─────────────────────────────────────────────

    it('canonicalName으로 기존 토픽을 찾으면 본문을 만들지 않는다', async () => {
        // 사전 조회는 실패, canonical 조회는 성공하는 동의어 상황
        mockTopicsByName({ 'quantum mechanics': makeTopic() });
        mockedRoute.mockResolvedValue(routerResult());

        const result = await processUserQuery('user-1', 'quantum physics', 'en');

        expect(result.topicId).toBe('topic-1');
        expect(result.isNew).toBe(false);
        expect(mockedTransaction).not.toHaveBeenCalled();
        await flush();
        expect(mockedBody).not.toHaveBeenCalled();
        // 다음부터는 사전 조회에서 잡히도록 별칭을 남긴다
        expect(mockedPrisma.alias.upsert).toHaveBeenCalledWith(
            expect.objectContaining({ where: { name: 'quantum physics' } })
        );
    });

    // ─── ④ 신규 생성 + ⑤ 백그라운드 ────────────────────────────────────

    it('본문 생성을 기다리지 않고 응답한다', async () => {
        mockTopicsByName({});
        mockedRoute.mockResolvedValue(routerResult());

        // 끝나지 않는 본문 생성. 이걸 기다린다면 processUserQuery도 끝나지 않는다.
        let release: (body: string) => void = () => { };
        mockedBody.mockReturnValue(new Promise<string>(resolve => { release = resolve; }));

        const result = await processUserQuery('user-1', 'quantum mechanics', 'en');

        expect(result.isNew).toBe(true);
        expect(result.topicId).toBe('topic-new');
        expect(result.answer).toContain('[[입자]]');
        expect(mockedBody).toHaveBeenCalledTimes(1);

        release('## Overview\n[[입자]]');
        await flush();
    });

    it('④에서 Neo4j 노드를 먼저 만든다 — 엣지 없이', async () => {
        mockTopicsByName({});
        mockedRoute.mockResolvedValue(routerResult());

        await processUserQuery('user-1', 'quantum mechanics', 'en');

        // 노드가 없으면 /api/graph의 MATCH가 비어 새 별이 아예 뜨지 않는다.
        expect(mockedSync).toHaveBeenCalledWith(
            expect.anything(), 'quantum mechanics', [], ['physics'], 'topic-new'
        );
    });

    it('ShipLog 실패가 응답을 막지 않는다', async () => {
        mockTopicsByName({ 'quantum mechanics': makeTopic() });
        mockedPrisma.shipLog.upsert.mockRejectedValue(new Error('DB down'));

        const result = await processUserQuery('user-1', 'Quantum Mechanics', 'en');

        expect(result.topicId).toBe('topic-1');
    });
});

describe('ensureArticle', () => {
    let ensureArticle: typeof import('@/lib/wiki-engine').ensureArticle;

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();
        baseMocks();
        ensureArticle = (await import('@/lib/wiki-engine')).ensureArticle;
    });

    it('본문이 이미 신선하면 모델을 부르지 않는다', async () => {
        mockTopicsByName({ 'quantum mechanics': makeTopic() });

        const body = await ensureArticle('Quantum Mechanics', 'en');

        expect(mockedBody).not.toHaveBeenCalled();
        expect(body).toContain('Quantum mechanics is the study of');
    });

    it('동시에 두 번 불려도 생성은 한 번만 돈다', async () => {
        const stub = makeTopic({
            articles: [{ id: 'a', topicId: 'topic-1', title: 'T', content: null, language: 'en', updatedAt: FRESH }],
        });
        mockTopicsByName({ 'quantum mechanics': stub });

        // 채팅의 백그라운드 생성과 위키 열람이 겹치는 상황
        const [a, b] = await Promise.all([
            ensureArticle('Quantum Mechanics', 'en'),
            ensureArticle('quantum mechanics', 'en'),
        ]);

        expect(mockedBody).toHaveBeenCalledTimes(1);
        expect(a).toBe(b);
    });

    it('실패하면 in-flight에서 빠져 다음 호출이 다시 시도한다', async () => {
        const stub = makeTopic({
            articles: [{ id: 'a', topicId: 'topic-1', title: 'T', content: null, language: 'en', updatedAt: FRESH }],
        });
        mockTopicsByName({ 'quantum mechanics': stub });
        mockedBody.mockRejectedValueOnce(new Error('model down'));

        await expect(ensureArticle('Quantum Mechanics', 'en')).rejects.toThrow('model down');

        mockedBody.mockResolvedValueOnce('## Overview\n다시 만든 본문 [[입자]]');
        const body = await ensureArticle('Quantum Mechanics', 'en');

        expect(body).toContain('다시 만든 본문');
        expect(mockedBody).toHaveBeenCalledTimes(2);
    });

    it('품질 미달이면 1회 재생성하되 대화 이력이 아니라 deficiency로 알린다', async () => {
        const stub = makeTopic({
            articles: [{ id: 'a', topicId: 'topic-1', title: 'T', content: null, language: 'en', updatedAt: FRESH }],
        });
        mockTopicsByName({ 'quantum mechanics': stub });
        mockedEvaluate
            .mockReturnValueOnce({ ok: false, headings: 1, links: 2, words: 100, reasons: ['words=100<300'], score: 0.9 })
            .mockReturnValueOnce({ ok: true, headings: 5, links: 10, words: 700, reasons: [], score: 3 });
        mockedBody
            .mockResolvedValueOnce('짧은 본문')
            .mockResolvedValueOnce('## Overview\n충분히 긴 본문 [[입자]]');

        const body = await ensureArticle('Quantum Mechanics', 'en');

        expect(mockedBody).toHaveBeenCalledTimes(2);
        expect(mockedBody.mock.calls[1][0]).toMatchObject({
            deficiency: { reasons: ['words=100<300'], previous: '짧은 본문' },
        });
        expect(body).toContain('충분히 긴 본문');
    });

    it('재생성이 길기만 하고 구조가 퇴행하면 채택하지 않는다', async () => {
        const stub = makeTopic({
            articles: [{ id: 'a', topicId: 'topic-1', title: 'T', content: null, language: 'en', updatedAt: FRESH }],
        });
        mockTopicsByName({ 'quantum mechanics': stub });
        // 첫 결과: 분량만 살짝 모자람. 재생성: 단어는 늘었지만 헤딩·링크가 무너짐.
        // 단어 수만 비교하던 옛 기준이라면 두 번째가 이겼다.
        mockedEvaluate
            .mockReturnValueOnce({ ok: false, headings: 6, links: 20, words: 480, reasons: ['words=480<500'], score: 2.96 })
            .mockReturnValueOnce({ ok: false, headings: 1, links: 2, words: 900, reasons: ['headings=1<3', 'links=2<5'], score: 1.73 });
        mockedBody
            .mockResolvedValueOnce('## Overview\n구조는 좋지만 조금 짧은 본문 [[입자]]')
            .mockResolvedValueOnce('장황하지만 구조가 무너진 본문');

        const body = await ensureArticle('Quantum Mechanics', 'en');

        expect(body).toContain('구조는 좋지만');
        expect(body).not.toContain('장황하지만');
    });

    it('본문 저장 후 [[링크]]를 엣지로 동기화한다', async () => {
        const stub = makeTopic({
            tags: [{ id: 't1', name: 'physics' }],
            articles: [{ id: 'a', topicId: 'topic-1', title: 'T', content: null, language: 'en', updatedAt: FRESH }],
        });
        mockTopicsByName({ 'quantum mechanics': stub });
        mockedBody.mockResolvedValue('## Overview\n[[입자]]와 [[파동]]');

        await ensureArticle('Quantum Mechanics', 'en');

        const call = mockedSync.mock.calls[0];
        expect(call[1]).toBe('quantum mechanics');
        expect(call[2]).toEqual(expect.arrayContaining(['입자', '파동']));
        expect(call[3]).toEqual(['physics']);
    });

    it('토픽이 없으면 에러', async () => {
        mockTopicsByName({});
        await expect(ensureArticle('Nonexistent', 'en')).rejects.toThrow('토픽을 찾을 수 없습니다');
    });
});
