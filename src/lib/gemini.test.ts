import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set API key for tests before importing
process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-api-key';

// Mock the @google/generative-ai module
const mockGenerateContent = vi.fn();
vi.mock('@google/generative-ai', () => {
    return {
        GoogleGenerativeAI: class {
            getGenerativeModel() {
                return { generateContent: mockGenerateContent };
            }
        },
    };
});

const { batchTranslate, generateWikiContent } = await import('./gemini');
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
            response: { text: () => JSON.stringify(mockResponse) },
        });

        const result = await batchTranslate(['Black Hole', 'Quantum Mechanics'], 'ko');
        expect(result).toEqual(mockResponse);

        const prompt = mockGenerateContent.mock.calls[0][0].contents[0].parts[0].text;
        expect(prompt).toContain('한국어(Korean)');
    });

    it('마크다운 코드 블록으로 감싸진 응답 처리', async () => {
        const mockResponse = { 'Star': '별' };
        mockGenerateContent.mockResolvedValueOnce({
            response: { text: () => '```json\n' + JSON.stringify(mockResponse) + '\n```' },
        });

        const result = await batchTranslate(['Star'], 'ko');
        expect(result).toEqual(mockResponse);
    });

    it('plain 마크다운 블록 처리', async () => {
        const mockResponse = { 'Planet': '행성' };
        mockGenerateContent.mockResolvedValueOnce({
            response: { text: () => '```\n' + JSON.stringify(mockResponse) + '\n```' },
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
            response: { text: () => 'Invalid JSON' },
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
            response: { text: () => JSON.stringify(mockResponse) },
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
            response: { text: () => JSON.stringify(mockResponse) },
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
            response: { text: () => JSON.stringify(mockResponse) },
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
            response: { text: () => JSON.stringify(mockResponse) },
        });

        const result = await generateWikiContent('Biology', 'en');
        expect(result.isFollowUp).toBe(false);
    });

    it('마크다운 코드 블록 처리', async () => {
        const mockResponse = { topic: 'AI', content: 'Artificial Intelligence is...', isFollowUp: false };
        mockGenerateContent.mockResolvedValueOnce({
            response: { text: () => '```json\n' + JSON.stringify(mockResponse) + '\n```' },
        });

        const result = await generateWikiContent('AI', 'en');
        expect(result.topic).toBe('AI');
        expect(result.content).toBe(mockResponse.content);
    });

    it('앞뒤 공백/개행 포함 응답 처리', async () => {
        const mockResponse = { topic: 'Space', content: 'Space is big.' };
        mockGenerateContent.mockResolvedValueOnce({
            response: { text: () => '\n\n  ```json\n' + JSON.stringify(mockResponse) + '\n```  \n' },
        });

        const result = await generateWikiContent('Space', 'en');
        expect(result.topic).toBe('Space');
    });

    it('배열 응답 언래핑 처리', async () => {
        const mockResponse = [{ topic: 'Biology', content: 'Study of life.' }];
        mockGenerateContent.mockResolvedValueOnce({
            response: { text: () => JSON.stringify(mockResponse) },
        });

        const result = await generateWikiContent('Biology', 'en');
        expect(result.topic).toBe('Biology');
    });

    it('response/result 래퍼 언래핑 처리', async () => {
        const mockResponse = { result: { topic: 'Chemistry', content: 'Study of matter.' } };
        mockGenerateContent.mockResolvedValueOnce({
            response: { text: () => JSON.stringify(mockResponse) },
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
            response: { text: () => JSON.stringify(mockResponse) },
        });

        const result = await generateWikiContent('History', 'en');
        expect(result.topic).toBe('History');
        expect(result.content).toBe('Study of the past.');
        expect(result.canonicalName).toBe('World History');
    });

    it('필수 필드(content) 누락 시 에러', async () => {
        mockGenerateContent.mockResolvedValueOnce({
            response: { text: () => JSON.stringify({ topic: 'Only Topic' }) },
        });

        await expect(generateWikiContent('Test', 'en')).rejects.toThrow(
            "AI 사서로부터 콘텐츠를 생성하지 못했습니다: Gemini 응답에 'content' 필드가 누락되었습니다."
        );
    });

    it('잘못된 JSON 응답 시 에러', async () => {
        mockGenerateContent.mockResolvedValueOnce({
            response: { text: () => 'This is not JSON' },
        });

        await expect(generateWikiContent('Test', 'en')).rejects.toThrow(
            'AI가 올바른 JSON 형식을 반환하지 않았습니다.'
        );
    });

    it('코드 블록 앞뒤 텍스트 포함 응답 처리', async () => {
        const mockResponse = { topic: 'Physics', content: 'Gravity is a force.' };
        mockGenerateContent.mockResolvedValueOnce({
            response: {
                text: () => 'Here is the result:\n```json\n' + JSON.stringify(mockResponse) + '\n```\nHope this helps!',
            },
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
            response: { text: () => JSON.stringify(mockResponse) },
        });

        const result = await generateWikiContent('Math', 'en');
        expect(result.isFollowUp).toBe(true);
    });

});
