import test, { mock } from 'node:test';
import assert from 'node:assert';

// Set API key for tests
process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-api-key';

// Mock the GoogleGenerativeAI class
import { GoogleGenerativeAI } from '@google/generative-ai';

const mockModel = {
    generateContent: mock.fn()
};

// Mock getGenerativeModel on the prototype so that any instance (including the one in gemini.ts) uses it
mock.method(GoogleGenerativeAI.prototype, 'getGenerativeModel', () => mockModel);

// Import functions AFTER mocking and setting env var
const { batchTranslate, generateWikiContent } = await import('./gemini.ts');

test('batchTranslate - targetLang "en" returns identity mapping', async () => {
    const topics = ['Concept1', 'Concept2'];
    const result = await batchTranslate(topics, 'en');
    assert.deepStrictEqual(result, {
        'Concept1': 'Concept1',
        'Concept2': 'Concept2'
    });
});

test('batchTranslate - successful translation for non-English', async () => {
    const topics = ['Black Hole', 'Quantum Mechanics'];
    const mockResponse = {
        "Black Hole": "블랙홀",
        "Quantum Mechanics": "양자역학"
    };

    mockModel.generateContent.mock.mockImplementationOnce(async () => ({
        response: {
            text: () => JSON.stringify(mockResponse)
        }
    }));

    const result = await batchTranslate(topics, 'ko');

    assert.deepStrictEqual(result, mockResponse);

    const lastCall = mockModel.generateContent.mock.calls[mockModel.generateContent.mock.calls.length - 1];
    const prompt = lastCall.arguments[0].contents[0].parts[0].text;
    assert.ok(prompt.includes('한국어(Korean)'));
    assert.ok(prompt.includes(JSON.stringify(topics)));
});

test('batchTranslate - handles markdown code blocks in Gemini response', async () => {
    const topics = ['Star'];
    const mockResponse = { "Star": "별" };

    mockModel.generateContent.mock.mockImplementationOnce(async () => ({
        response: {
            text: () => '```json\n' + JSON.stringify(mockResponse) + '\n```'
        }
    }));

    const result = await batchTranslate(topics, 'ko');
    assert.deepStrictEqual(result, mockResponse);
});

test('batchTranslate - handles plain markdown block', async () => {
    const topics = ['Planet'];
    const mockResponse = { "Planet": "행성" };

    mockModel.generateContent.mock.mockImplementationOnce(async () => ({
        response: {
            text: () => '```\n' + JSON.stringify(mockResponse) + '\n```'
        }
    }));

    const result = await batchTranslate(topics, 'ko');
    assert.deepStrictEqual(result, mockResponse);
});

test('batchTranslate - returns empty object on Gemini error', async () => {
    mockModel.generateContent.mock.mockImplementationOnce(async () => {
        throw new Error('Gemini API Error');
    });

    const result = await batchTranslate(['Galaxy'], 'ko');
    assert.deepStrictEqual(result, {});
});

test('batchTranslate - returns empty object on invalid JSON response', async () => {
    mockModel.generateContent.mock.mockImplementationOnce(async () => ({
        response: {
            text: () => 'Invalid JSON'
        }
    }));

    const result = await batchTranslate(['Universe'], 'ko');
    assert.deepStrictEqual(result, {});
});

// generateWikiContent tests

test('generateWikiContent - happy path', async () => {
    const mockResponse = {
        topic: "Quantum Physics",
        title: "양자 물리학",
        canonicalName: "Quantum Physics",
        tags: ["Science", "Physics"],
        content: "Quantum physics is...",
        chatResponse: "Hello! Let's talk about quantum physics."
    };

    mockModel.generateContent.mock.mockImplementationOnce(async () => ({
        response: {
            text: () => JSON.stringify(mockResponse)
        }
    }));

    const result = await generateWikiContent("Quantum Physics", "ko");
    assert.deepStrictEqual(result, mockResponse);
});

test('generateWikiContent - handles markdown code blocks', async () => {
    const mockResponse = {
        topic: "AI",
        content: "Artificial Intelligence is..."
    };

    mockModel.generateContent.mock.mockImplementationOnce(async () => ({
        response: {
            text: () => '```json\n' + JSON.stringify(mockResponse) + '\n```'
        }
    }));

    const result = await generateWikiContent("AI", "en");
    assert.strictEqual(result.topic, "AI");
    assert.strictEqual(result.content, mockResponse.content);
});

test('generateWikiContent - handles leading/trailing whitespace and newlines', async () => {
    const mockResponse = {
        topic: "Space",
        content: "Space is big."
    };

    mockModel.generateContent.mock.mockImplementationOnce(async () => ({
        response: {
            text: () => '\n\n  ```json\n' + JSON.stringify(mockResponse) + '\n```  \n'
        }
    }));

    // This might fail with current implementation if regex is not robust enough
    const result = await generateWikiContent("Space", "en");
    assert.strictEqual(result.topic, "Space");
});

test('generateWikiContent - handles unwrapping (array response)', async () => {
    const mockResponse = [{
        topic: "Biology",
        content: "Study of life."
    }];

    mockModel.generateContent.mock.mockImplementationOnce(async () => ({
        response: {
            text: () => JSON.stringify(mockResponse)
        }
    }));

    const result = await generateWikiContent("Biology", "en");
    assert.strictEqual(result.topic, "Biology");
});

test('generateWikiContent - handles unwrapping (response/result keys)', async () => {
    const mockResponse = {
        result: {
            topic: "Chemistry",
            content: "Study of matter."
        }
    };

    mockModel.generateContent.mock.mockImplementationOnce(async () => ({
        response: {
            text: () => JSON.stringify(mockResponse)
        }
    }));

    const result = await generateWikiContent("Chemistry", "en");
    assert.strictEqual(result.topic, "Chemistry");
});

test('generateWikiContent - handles key normalization', async () => {
    const mockResponse = {
        TOPIC: "History",
        CONTENT: "Study of the past.",
        CanonicalName: "World History"
    };

    mockModel.generateContent.mock.mockImplementationOnce(async () => ({
        response: {
            text: () => JSON.stringify(mockResponse)
        }
    }));

    const result = await generateWikiContent("History", "en");
    assert.strictEqual(result.topic, "History");
    assert.strictEqual(result.content, "Study of the past.");
    assert.strictEqual(result.canonicalName, "World History");
});

test('generateWikiContent - throws error on missing required fields', async () => {
    const mockResponse = {
        topic: "Only Topic"
        // missing content
    };

    mockModel.generateContent.mock.mockImplementationOnce(async () => ({
        response: {
            text: () => JSON.stringify(mockResponse)
        }
    }));

    await assert.rejects(
        () => generateWikiContent("Test", "en"),
        { message: "AI 사서로부터 콘텐츠를 생성하지 못했습니다: Gemini 응답에 'content' 필드가 누락되었습니다." }
    );
});

test('generateWikiContent - throws error on invalid JSON', async () => {
    mockModel.generateContent.mock.mockImplementationOnce(async () => ({
        response: {
            text: () => "This is not JSON"
        }
    }));

    await assert.rejects(
        () => generateWikiContent("Test", "en"),
        { message: "AI가 올바른 JSON 형식을 반환하지 않았습니다." }
    );
});

test('generateWikiContent - handles text outside of code blocks', async () => {
    const mockResponse = {
        topic: "Physics",
        content: "Gravity is a force."
    };

    mockModel.generateContent.mock.mockImplementationOnce(async () => ({
        response: {
            text: () => "Here is the result:\n```json\n" + JSON.stringify(mockResponse) + "\n```\nHope this helps!"
        }
    }));

    const result = await generateWikiContent("Physics", "en");
    assert.strictEqual(result.topic, "Physics");
});
