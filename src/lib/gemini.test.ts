import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set API key for tests before importing
process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-api-key';

// Mock the @google/genai module.
// 새 SDK는 모델별 핸들을 만들지 않고 ai.models.generateContent({model, contents, config})를
// 직접 호출하며, 응답의 text는 메서드가 아니라 접근자다.
// 모듈을 통째로 대체하면 Type·ThinkingLevel 열거형까지 사라져 gemini.ts가
// 로드 시점에 터진다. 실제 모듈을 펼친 뒤 클라이언트 클래스만 덮는다.
const mockGenerateContent = vi.fn();
vi.mock('@google/genai', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@google/genai')>();
    return {
        ...actual,
        GoogleGenAI: class {
            models = { generateContent: mockGenerateContent };
        },
    };
});

const { batchTranslate, routeQuery, generateArticleBody, evaluateWikiContent } = await import('./gemini');
type ChatHistoryEntry = import('./gemini').ChatHistoryEntry;


describe('batchTranslate', () => {
    beforeEach(() => {
        mockGenerateContent.mockReset();
    });

    it('targetLang "en"이면 원본 그대로 반환', async () => {
        const topics = ['Concept1', 'Concept2'];
        const result = await batchTranslate(topics, 'en');
        expect(result).toEqual({
            'Concept1': 'Concept1',
            'Concept2': 'Concept2',
        });
    });

    it('topics가 빈 배열이면 빈 객체 반환', async () => {
        const result = await batchTranslate([], 'en');
        expect(result).toEqual({});

        const resultKo = await batchTranslate([], 'ko');
        expect(resultKo).toEqual({});
    });

    it('non-English 번역 성공', async () => {
        const mockResponse = {
            'Black Hole': '블랙홀',
            'Quantum Mechanics': '양자역학',
        };

        mockGenerateContent.mockResolvedValueOnce({
            text: JSON.stringify(mockResponse),
        });

        const result = await batchTranslate(['Black Hole', 'Quantum Mechanics'], 'ko');
        expect(result).toEqual(mockResponse);

        const prompt = mockGenerateContent.mock.calls[0][0].contents[0].parts[0].text;
        expect(prompt).toContain('한국어(Korean)');
    });

    it('마크다운 코드 블록으로 감싸진 응답 처리', async () => {
        const mockResponse = { 'Star': '별' };
        mockGenerateContent.mockResolvedValueOnce({
            text: '```json\n' + JSON.stringify(mockResponse) + '\n```',
        });

        const result = await batchTranslate(['Star'], 'ko');
        expect(result).toEqual(mockResponse);
    });

    it('plain 마크다운 블록 처리', async () => {
        const mockResponse = { 'Planet': '행성' };
        mockGenerateContent.mockResolvedValueOnce({
            text: '```\n' + JSON.stringify(mockResponse) + '\n```',
        });

        const result = await batchTranslate(['Planet'], 'ko');
        expect(result).toEqual(mockResponse);
    });

    it('Gemini 오류 시 빈 객체 반환', async () => {
        mockGenerateContent.mockRejectedValueOnce(new Error('Gemini API Error'));
        const result = await batchTranslate(['Galaxy'], 'ko');
        expect(result).toEqual({});
    });

    it('잘못된 JSON 응답 시 빈 객체 반환', async () => {
        mockGenerateContent.mockResolvedValueOnce({
            text: 'Invalid JSON',
        });

        const result = await batchTranslate(['Universe'], 'ko');
        expect(result).toEqual({});
    });
});

describe('routeQuery', () => {
    beforeEach(() => {
        mockGenerateContent.mockReset();
    });

    const routed = (over: Record<string, unknown> = {}) => ({
        text: JSON.stringify({
            intent: 'new_topic',
            topic: '양자역학',
            canonicalName: 'Quantum Mechanics',
            title: '양자 물리학',
            tags: ['physics'],
            chatResponse: '양자역학은 [[입자]]와 [[파동]]을 다룹니다.',
            ...over,
        }),
    });

    it('new_topic 응답을 그대로 매핑한다', async () => {
        mockGenerateContent.mockResolvedValueOnce(routed());
        const r = await routeQuery('양자역학', 'ko');

        expect(r.intent).toBe('new_topic');
        expect(r.topic).toBe('양자역학');
        expect(r.canonicalName).toBe('Quantum Mechanics');
        expect(r.title).toBe('양자 물리학');
        expect(r.tags).toEqual(['physics']);
        expect(r.chatResponse).toContain('[[입자]]');
    });

    it('reject면 이름 필드를 비운다 — 모델이 채워 보내도', async () => {
        mockGenerateContent.mockResolvedValueOnce(routed({
            intent: 'reject',
            chatResponse: '작업 수행 요청은 처리할 수 없습니다.',
        }));
        const r = await routeQuery('이 코드 리팩터링해줘', 'ko');

        expect(r.intent).toBe('reject');
        expect(r.canonicalName).toBe('');
        expect(r.topic).toBe('');
        expect(r.title).toBe('');
        expect(r.tags).toEqual([]);
        expect(r.chatResponse).not.toBe('');
    });

    it('follow_up이면 이름 필드를 비운다 — 참조 대상은 서버가 정한다', async () => {
        mockGenerateContent.mockResolvedValueOnce(routed({ intent: 'follow_up' }));
        const r = await routeQuery('좀 더 자세히', 'ko');

        expect(r.intent).toBe('follow_up');
        expect(r.canonicalName).toBe('');
        expect(r.topic).toBe('');
    });

    it('모르는 intent 값은 new_topic으로 떨어뜨린다', async () => {
        mockGenerateContent.mockResolvedValueOnce(routed({ intent: 'something_else' }));
        const r = await routeQuery('양자역학', 'ko');
        expect(r.intent).toBe('new_topic');
    });

    it('canonicalName이 비면 topic으로 대체한다', async () => {
        mockGenerateContent.mockResolvedValueOnce(routed({ canonicalName: '' }));
        const r = await routeQuery('양자역학', 'ko');
        expect(r.canonicalName).toBe('양자역학');
    });

    it('대화 이력을 multi-turn으로 싣되 가짜 model 턴을 넣지 않는다', async () => {
        mockGenerateContent.mockResolvedValueOnce(routed({ intent: 'follow_up' }));
        const history: ChatHistoryEntry[] = [
            { role: 'user', content: '양자역학' },
            { role: 'assistant', content: '양자역학은 ...' },
        ];
        await routeQuery('좀 더 자세히', 'ko', history);

        const contents = mockGenerateContent.mock.calls[0][0].contents;
        expect(contents).toHaveLength(3);
        expect(contents[0]).toEqual({ role: 'user', parts: [{ text: '양자역학' }] });
        expect(contents[1]).toEqual({ role: 'model', parts: [{ text: '양자역학은 ...' }] });
        expect(contents[2]).toEqual({ role: 'user', parts: [{ text: '좀 더 자세히' }] });

        // 지침을 끼워넣기 위한 "네, 이해했습니다" 턴이 더 이상 없어야 한다.
        const joined = JSON.stringify(contents);
        expect(joined).not.toContain('이해했습니다');
    });

    it('이력이 없으면 단일 user 턴', async () => {
        mockGenerateContent.mockResolvedValueOnce(routed());
        await routeQuery('양자역학', 'ko');

        const contents = mockGenerateContent.mock.calls[0][0].contents;
        expect(contents).toHaveLength(1);
        expect(contents[0].role).toBe('user');
    });

    it('스키마·사고 레벨·시스템 지침을 config로 넘긴다', async () => {
        mockGenerateContent.mockResolvedValueOnce(routed());
        await routeQuery('양자역학', 'ko');

        const config = mockGenerateContent.mock.calls[0][0].config;
        expect(config.responseSchema.properties.intent.enum)
            .toEqual(['new_topic', 'follow_up', 'reject']);
        // required가 좁아야 follow_up/reject에서 쓰지 않을 필드에 토큰을 쓰지 않는다.
        expect(config.responseSchema.required).toEqual(['intent', 'chatResponse']);
        expect(config.thinkingConfig.thinkingLevel).toBeDefined();
        expect(config.systemInstruction).toContain('위키 본문은 작성하지 않습니다');
    });

    it('시스템 지침이 reject와 안내를 명시적으로 가른다', async () => {
        mockGenerateContent.mockResolvedValueOnce(routed());
        await routeQuery('양자역학', 'ko');

        const instruction = mockGenerateContent.mock.calls[0][0].config.systemInstruction;
        expect(instruction).toContain('안내는 new_topic의 부가 요소이지 reject의 대체재가 아닙니다');
    });

    it('JSON이 깨지면 재시도 후 에러', async () => {
        mockGenerateContent.mockResolvedValue({ text: 'not json' });
        await expect(routeQuery('양자역학', 'ko')).rejects.toThrow(
            'AI 사서가 요청을 해석하지 못했습니다.'
        );
        expect(mockGenerateContent).toHaveBeenCalledTimes(3);
    });
});

describe('generateArticleBody', () => {
    beforeEach(() => {
        mockGenerateContent.mockReset();
    });

    const BODY = '## 개요\n양자역학은 [[입자]]를 다룬다.\n\n## 상세\n...';

    it('마크다운을 그대로 반환한다 (JSON 파싱 없음)', async () => {
        mockGenerateContent.mockResolvedValueOnce({ text: BODY });
        const body = await generateArticleBody({ canonicalName: 'Quantum Mechanics', language: 'ko' });
        expect(body).toBe(BODY);
    });

    it('JSON 강제 설정을 넘기지 않는다 — 스트리밍 가능한 평문이어야 한다', async () => {
        mockGenerateContent.mockResolvedValueOnce({ text: BODY });
        await generateArticleBody({ canonicalName: 'Quantum Mechanics', language: 'ko' });

        const config = mockGenerateContent.mock.calls[0][0].config;
        expect(config.responseMimeType).toBeUndefined();
        expect(config.responseSchema).toBeUndefined();
        expect(config.systemInstruction).toContain('마크다운 본문만 출력하세요');
    });

    it('사용자 대화 이력을 받지 않는다 — 공유 문서이므로', async () => {
        mockGenerateContent.mockResolvedValueOnce({ text: BODY });
        await generateArticleBody({
            canonicalName: 'Quantum Mechanics',
            title: '양자역학',
            tags: ['physics'],
            language: 'ko',
        });

        const contents = mockGenerateContent.mock.calls[0][0].contents;
        expect(contents).toHaveLength(1);
        expect(contents[0].role).toBe('user');
        expect(contents[0].parts[0].text).toContain('Quantum Mechanics');
    });

    it('품질 보강은 대화 이력이 아니라 단일 턴으로 전달된다', async () => {
        mockGenerateContent.mockResolvedValueOnce({ text: BODY });
        await generateArticleBody({
            canonicalName: 'Quantum Mechanics',
            language: 'ko',
            deficiency: { reasons: ['words=100<400'], previous: '너무 짧은 이전 본문' },
        });

        const contents = mockGenerateContent.mock.calls[0][0].contents;
        // 턴이 늘어나면 본문 생성이 다시 대화 의존적이 된다.
        expect(contents).toHaveLength(1);
        const text = contents[0].parts[0].text;
        expect(text).toContain('words=100<400');
        expect(text).toContain('너무 짧은 이전 본문');
    });

    it('빈 응답이면 재시도 후 에러', async () => {
        mockGenerateContent.mockResolvedValue({ text: '   ' });
        await expect(
            generateArticleBody({ canonicalName: 'Quantum Mechanics', language: 'ko' })
        ).rejects.toThrow('위키 본문을 생성하지 못했습니다');
        expect(mockGenerateContent).toHaveBeenCalledTimes(3);
    });
});

describe('evaluateWikiContent', () => {
    it('빈 콘텐츠는 실패', () => {
        const q = evaluateWikiContent('');
        expect(q.ok).toBe(false);
        expect(q.reasons).toContain('empty');
    });

    it('헤딩/링크/단어 수가 모두 충족되면 ok=true', () => {
        const filler = '이것은 테스트 본문 내용을 충분히 채우기 위한 더미 단어 들이다 '.repeat(80);
        const content = [
            '## 개요',
            `${filler} [[테스트A]] [[테스트B]]`,
            '## 상세',
            `${filler} [[링크A]], [[링크B]], [[링크C]], [[링크D]] 포함.`,
            '## 역사',
            `${filler} 역사 [[배경]] 설명.`,
        ].join('\n');
        const q = evaluateWikiContent(content);
        expect(q.ok).toBe(true);
        expect(q.headings).toBeGreaterThanOrEqual(3);
        expect(q.links).toBeGreaterThanOrEqual(5);
        expect(q.words).toBeGreaterThanOrEqual(400);
    });

    it('헤딩이 부족하면 reasons에 포함', () => {
        const content = '평문만 있고 헤딩 없음. [[A]] [[B]] [[C]] [[D]] [[E]]';
        const q = evaluateWikiContent(content);
        expect(q.ok).toBe(false);
        expect(q.reasons.some(r => r.startsWith('headings='))).toBe(true);
    });

    it('링크가 부족하면 reasons에 포함', () => {
        const content = ['## A', '## B', '## C', '본문 단어들을 채워서 '.repeat(100)].join('\n');
        const q = evaluateWikiContent(content);
        expect(q.reasons.some(r => r.startsWith('links='))).toBe(true);
    });

    it('단어가 부족하면 reasons에 포함', () => {
        const content = '## A\n## B\n## C\n짧음 [[A]] [[B]] [[C]] [[D]] [[E]]';
        const q = evaluateWikiContent(content);
        expect(q.reasons.some(r => r.startsWith('words='))).toBe(true);
    });
});
