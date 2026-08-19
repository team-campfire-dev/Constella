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

const { batchTranslate, generateWikiContent, evaluateWikiContent } = await import('./gemini');
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

describe('generateWikiContent', () => {
    beforeEach(() => {
        mockGenerateContent.mockReset();
    });

    it('정상 응답 처리 (happy path)', async () => {
        const mockResponse = {
            topic: 'Quantum Physics',
            title: '양자 물리학',
            canonicalName: 'Quantum Physics',
            tags: ['Science', 'Physics'],
            content: 'Quantum physics is...',
            chatResponse: "Hello! Let's talk about quantum physics.",
            isFollowUp: false,
        };

        mockGenerateContent.mockResolvedValueOnce({
            text: JSON.stringify(mockResponse),
        });

        const result = await generateWikiContent('Quantum Physics', 'ko');
        expect(result).toEqual(mockResponse);
    });

    it('conversationHistory 전달 시 multi-turn contents 구성', async () => {
        const mockResponse = {
            topic: 'Quantum Physics',
            content: 'More details about quantum physics...',
            chatResponse: 'Here are more details.',
            isFollowUp: true,
            canonicalName: 'Quantum Physics',
            tags: ['Science'],
        };

        mockGenerateContent.mockResolvedValueOnce({
            text: JSON.stringify(mockResponse),
        });

        const history: ChatHistoryEntry[] = [
            { role: 'user', content: '양자역학이 뭐야?' },
            { role: 'assistant', content: '양자역학은 미시 세계의 물리학입니다.' },
        ];

        const result = await generateWikiContent('좀 더 자세히 알려줘', 'ko', history);

        // Verify multi-turn contents structure:
        // [system prompt, model ack, user msg, model msg, current query]
        const callArgs = mockGenerateContent.mock.calls[0][0];
        const contents = callArgs.contents;
        expect(contents.length).toBe(5); // prompt + ack + 2 history + current query
        expect(contents[0].role).toBe('user');   // system prompt
        expect(contents[1].role).toBe('model');  // model acknowledgment
        expect(contents[2].role).toBe('user');   // history user msg
        expect(contents[3].role).toBe('model');  // history assistant msg
        expect(contents[4].role).toBe('user');   // current query
        expect(contents[4].parts[0].text).toBe('좀 더 자세히 알려줘');

        expect(result.isFollowUp).toBe(true);
    });

    it('conversationHistory 없으면 single-turn (기존 동작)', async () => {
        const mockResponse = {
            topic: 'Mars',
            content: 'Mars is the fourth planet.',
            chatResponse: 'Mars is fascinating!',
            isFollowUp: false,
        };

        mockGenerateContent.mockResolvedValueOnce({
            text: JSON.stringify(mockResponse),
        });

        const result = await generateWikiContent('Mars', 'en');

        const callArgs = mockGenerateContent.mock.calls[0][0];
        const contents = callArgs.contents;
        expect(contents.length).toBe(1); // single prompt only
        expect(contents[0].role).toBe('user');

        expect(result.isFollowUp).toBe(false);
    });

    it('isFollowUp 기본값은 false', async () => {
        const mockResponse = {
            topic: 'Biology',
            content: 'Study of life.',
        };

        mockGenerateContent.mockResolvedValueOnce({
            text: JSON.stringify(mockResponse),
        });

        const result = await generateWikiContent('Biology', 'en');
        expect(result.isFollowUp).toBe(false);
    });

    it('마크다운 코드 블록 처리', async () => {
        const mockResponse = { topic: 'AI', content: 'Artificial Intelligence is...', isFollowUp: false };
        mockGenerateContent.mockResolvedValueOnce({
            text: '```json\n' + JSON.stringify(mockResponse) + '\n```',
        });

        const result = await generateWikiContent('AI', 'en');
        expect(result.topic).toBe('AI');
        expect(result.content).toBe(mockResponse.content);
    });

    it('앞뒤 공백/개행 포함 응답 처리', async () => {
        const mockResponse = { topic: 'Space', content: 'Space is big.' };
        mockGenerateContent.mockResolvedValueOnce({
            text: '\n\n  ```json\n' + JSON.stringify(mockResponse) + '\n```  \n',
        });

        const result = await generateWikiContent('Space', 'en');
        expect(result.topic).toBe('Space');
    });

    it('배열 응답 언래핑 처리', async () => {
        const mockResponse = [{ topic: 'Biology', content: 'Study of life.' }];
        mockGenerateContent.mockResolvedValueOnce({
            text: JSON.stringify(mockResponse),
        });

        const result = await generateWikiContent('Biology', 'en');
        expect(result.topic).toBe('Biology');
    });

    it('response/result 래퍼 언래핑 처리', async () => {
        const mockResponse = { result: { topic: 'Chemistry', content: 'Study of matter.' } };
        mockGenerateContent.mockResolvedValueOnce({
            text: JSON.stringify(mockResponse),
        });

        const result = await generateWikiContent('Chemistry', 'en');
        expect(result.topic).toBe('Chemistry');
    });

    it('키 정규화 (대소문자 무시)', async () => {
        const mockResponse = {
            TOPIC: 'History',
            CONTENT: 'Study of the past.',
            CanonicalName: 'World History',
        };
        mockGenerateContent.mockResolvedValueOnce({
            text: JSON.stringify(mockResponse),
        });

        const result = await generateWikiContent('History', 'en');
        expect(result.topic).toBe('History');
        expect(result.content).toBe('Study of the past.');
        expect(result.canonicalName).toBe('World History');
    });

    it('필수 필드(content) 누락 시 에러', async () => {
        mockGenerateContent.mockResolvedValueOnce({
            text: JSON.stringify({ topic: 'Only Topic' }),
        });

        await expect(generateWikiContent('Test', 'en')).rejects.toThrow(
            "AI 사서로부터 콘텐츠를 생성하지 못했습니다: Gemini 응답에 'content' 필드가 누락되었습니다."
        );
    });

    it('잘못된 JSON 응답 시 에러', async () => {
        // retry 3회 모두 invalid JSON → 최종 SyntaxError가 outer catch로 전달되어
        // "AI가 올바른 JSON 형식을 반환하지 않았습니다." 메시지로 매핑된다.
        mockGenerateContent.mockResolvedValue({
            text: 'This is not JSON',
        });

        await expect(generateWikiContent('Test', 'en')).rejects.toThrow(
            'AI가 올바른 JSON 형식을 반환하지 않았습니다.'
        );
    });

    it('코드 블록 앞뒤 텍스트 포함 응답 처리', async () => {
        const mockResponse = { topic: 'Physics', content: 'Gravity is a force.' };
        mockGenerateContent.mockResolvedValueOnce({
            text: 'Here is the result:\n```json\n' + JSON.stringify(mockResponse) + '\n```\nHope this helps!',
        });

        const result = await generateWikiContent('Physics', 'en');
        expect(result.topic).toBe('Physics');
    });

    it('isFollowUp 키 정규화 (대소문자 무시)', async () => {
        const mockResponse = {
            topic: 'Math',
            content: 'Mathematics is...',
            IsFollowUp: true,
        };

        mockGenerateContent.mockResolvedValueOnce({
            text: JSON.stringify(mockResponse),
        });

        const result = await generateWikiContent('Math', 'en');
        expect(result.isFollowUp).toBe(true);
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
