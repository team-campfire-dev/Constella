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

test('generateWikiContent - successful generation', async () => {
    const topic = 'Quantum Mechanics';
    const mockResponse = {
        topic: 'Quantum Mechanics',
        title: 'Quantum Mechanics',
        canonicalName: 'Quantum Mechanics',
        tags: ['Physics'],
        content: 'Content about [[Quantum Mechanics]].',
        chatResponse: 'Hello! Here is information about [[Quantum Mechanics]].'
    };

    mockModel.generateContent.mock.mockImplementationOnce(async () => ({
        response: {
            text: () => JSON.stringify(mockResponse)
        }
    }));

    const result = await generateWikiContent(topic, 'en');

    assert.deepStrictEqual(result, mockResponse);
});

test('generateWikiContent - handles wrapped and mis-cased response', async () => {
    const topic = 'Black Hole';
    const mockResponse = {
        response: {
            TOPIC: 'Black Hole',
            content: 'A region of spacetime...',
            TAGS: ['Astronomy', 'Physics']
        }
    };

    mockModel.generateContent.mock.mockImplementationOnce(async () => ({
        response: {
            text: () => JSON.stringify(mockResponse)
        }
    }));

    const result = await generateWikiContent(topic, 'en');

    assert.strictEqual(result.topic, 'Black Hole');
    assert.strictEqual(result.content, 'A region of spacetime...');
    assert.deepStrictEqual(result.tags, ['Astronomy', 'Physics']);
    assert.strictEqual(result.canonicalName, 'Black Hole'); // Defaulted from topic
});

test('generateWikiContent - handles markdown code blocks', async () => {
    const topic = 'Evolution';
    const mockResponse = {
        topic: 'Evolution',
        content: 'Change in the heritable characteristics...'
    };

    mockModel.generateContent.mock.mockImplementationOnce(async () => ({
        response: {
            text: () => '```json\n' + JSON.stringify(mockResponse) + '\n```'
        }
    }));

    const result = await generateWikiContent(topic, 'en');
    assert.strictEqual(result.topic, 'Evolution');
});

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
