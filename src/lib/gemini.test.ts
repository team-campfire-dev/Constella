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

// Import batchTranslate AFTER mocking and setting env var
const { batchTranslate } = await import('./gemini.ts');

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
