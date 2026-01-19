import { GoogleGenerativeAI } from "@google/generative-ai";
import logger from "@/lib/logger";

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

if (!apiKey) {
    logger.warn("GOOGLE_GENERATIVE_AI_API_KEY가 설정되지 않았습니다. AI 기능이 작동하지 않을 수 있습니다.");
}

// API 키가 없으면 더미 값으로 초기화 (실제 호출 시 에러 발생)
const genAI = new GoogleGenerativeAI(apiKey || "dummy");

export async function generateWikiContent(topic: string, language: string = 'en') {
    if (!apiKey) {
        throw new Error("API 키가 없습니다. .env 파일을 확인해주세요.");
    }

    // 사용자 요청: "Gemini 2.0 Flash" Implementation Plan 기준
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

    const prompt = `
  Role: 당신은 SF 학습 플랫폼 "Constella"의 AI 사서입니다.
  Task: 사용자 입력 "${topic}"에서 핵심 주제(Topic)를 추출하고, 그 주제에 대해 초보자도 이해하기 쉽게 설명해주세요.
  Language Instruction: 답변은 반드시 **${language === 'ko' ? '한국어(Korean)' : 'English'}**로 작성해야 합니다.
  
  Requirements:
  1. **Output Format**: Return a single flattened JSON object. Do not wrap in markdown code blocks. Do not wrap in an array or "response" object.
  2. **Keys**: Use the following exact keys (camelCase):
     - topic: Keyword (noun).
     - title: Localized name (${language === 'ko' ? 'Korean' : 'English'}).
     - canonicalName: Official English full name.
     - tags: Array of strings (categories).
     - content: Wiki article content (Markdown, objective, [[links]]).
     - chatResponse: Conversational answer (Markdown, [[links]]).
  3. **Content**:
     - content: 200 words summary. No greetings. **Enclose 3-5 key scientific concepts, people, or related technologies in [[brackets]]**.
     - chatResponse: Friendly, conversational. Include 3+ related topics as [[links]].
     - **Link Note**: Ensure links are for **distinct, atomic concepts** (e.g., use "[[Event Horizon]], [[Telescope]]" instead of "[[Event Horizon Telescope]]" if they are separate ideas). Do not merge distinct concepts into one link.
  `;

    let text = "";
    try {
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        });
        const response = await result.response;
        text = response.text();

        // Remove markdown code blocks if present
        text = text.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');

        let parsed = JSON.parse(text);

        // Robust recursive unwrapping to handle Array or 'response'/'result' wrappers
        const unwrap = (obj: any): any => {
            if (Array.isArray(obj)) return unwrap(obj[0]);
            if (obj && typeof obj === 'object') {
                if ('response' in obj) return unwrap(obj.response);
                if ('result' in obj) return unwrap(obj.result);
            }
            return obj;
        };

        parsed = unwrap(parsed);

        // Normalize keys (Gemini might return Capitalized keys despite instructions)
        const normalize = (obj: any) => {
            const newObj: any = {};
            for (const key in obj) {
                const lowerKey = key.toLowerCase();
                // Map specific keys if needed
                if (lowerKey.includes('topic')) newObj.topic = obj[key];
                else if (lowerKey.includes('title')) newObj.title = obj[key];
                else if (lowerKey.includes('canonical')) newObj.canonicalName = obj[key];
                else if (lowerKey.includes('tags')) newObj.tags = obj[key];
                else if (lowerKey.includes('content')) newObj.content = obj[key];
                else if (lowerKey.includes('chatresponse')) newObj.chatResponse = obj[key];
                else newObj[lowerKey] = obj[key];
            }
            return newObj;
        };

        parsed = normalize(parsed);

        // Validation for required fields
        if (!parsed.topic) throw new Error("Gemini response missing 'topic' field");
        if (!parsed.content) throw new Error("Gemini response missing 'content' field");

        // Ensure defaults
        parsed.tags = parsed.tags || [];
        parsed.canonicalName = parsed.canonicalName || parsed.topic;
        parsed.chatResponse = parsed.chatResponse || "";

        return parsed as { topic: string, title?: string, canonicalName: string, tags: string[], content: string, chatResponse: string };
    } catch (error: any) {
        logger.error("Gemini 생성 오류:", { message: error.message, stack: error.stack, rawResponse: text });
        console.error("Gemini Raw Response:", text); // Explicit console log
        if (error instanceof SyntaxError) {
            throw new Error("AI가 올바른 JSON 형식을 반환하지 않았습니다.");
        }
        throw new Error("AI 사서로부터 콘텐츠를 생성하지 못했습니다: " + (error.message || "Unknown Error"));
    }
}

export const batchTranslate = async (topics: string[], targetLang: string) => {
    if (!apiKey) throw new Error("API Key Missing");

    // If target is English, we generally assume topics ARE English canonical names.
    if (targetLang === 'en') {
        const result: Record<string, string> = {};
        topics.forEach(t => result[t] = t);
        return result;
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
    const prompt = `
    Role: Professional Translator for Sci-Fi Encyclopedia.
    Task: Translate the following list of terms into ${targetLang === 'ko' ? 'Korean (한국어)' : targetLang}.
    Requirements:
    1. Output strictly valid JSON: { "Original Name": "Translated Name" }.
    2. Maintain the nuance of standard scientific/sci-fi terminology (e.g. "Black Hole" -> "블랙홀").
    3. If a term is a proper noun or better kept in English, keep it or transliterate appropriately.

    List:
    ${JSON.stringify(topics)}
    `;

    try {
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        });
        const text = result.response.text();
        return JSON.parse(text.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '')) as Record<string, string>;
    } catch (e) {
        logger.error("Batch Translate Failed", { error: e });
        return {};
    }
};
