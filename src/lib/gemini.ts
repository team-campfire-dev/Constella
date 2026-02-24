import { GoogleGenerativeAI } from "@google/generative-ai";
import logger from "@/lib/logger";

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

if (!apiKey) {
    logger.warn("GOOGLE_GENERATIVE_AI_API_KEY가 설정되지 않았습니다. AI 기능이 작동하지 않을 수 있습니다.");
}

// API 키가 없으면 더미 값으로 초기화 (실제 호출 시 에러 발생)
const genAI = new GoogleGenerativeAI(apiKey || "dummy");

/**
 * 마크다운 코드 블록이나 주변 텍스트가 포함된 JSON 문자열을 정제합니다.
 */
function cleanJsonString(text: string): string {
    const firstBrace = text.indexOf('{');
    const firstBracket = text.indexOf('[');
    const lastBrace = text.lastIndexOf('}');
    const lastBracket = text.lastIndexOf(']');

    const start = (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) ? firstBrace : firstBracket;
    const end = (lastBrace !== -1 && (lastBracket === -1 || lastBrace > lastBracket)) ? lastBrace : lastBracket;

    if (start !== -1 && end !== -1 && start < end) {
        return text.substring(start, end + 1);
    }
    return text.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
}

/**
 * 배열이나 'response'/'result' 래퍼를 처리하기 위한 재귀적 언래핑
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrapGeminiResponse(obj: any): any {
    if (Array.isArray(obj)) return unwrapGeminiResponse(obj[0]);
    if (obj && typeof obj === 'object') {
        if ('response' in obj) return unwrapGeminiResponse(obj.response);
        if ('result' in obj) return unwrapGeminiResponse(obj.result);
    }
    return obj;
}

/**
 * 키 정규화 (대소문자 무시 및 특정 키 매핑)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeWikiResponse(obj: any): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newObj: any = {};
    for (const key in obj) {
        const lowerKey = key.toLowerCase();
        // 특정 키 매핑
        if (lowerKey.includes('topic')) newObj.topic = obj[key];
        else if (lowerKey.includes('title')) newObj.title = obj[key];
        else if (lowerKey.includes('canonical')) newObj.canonicalName = obj[key];
        else if (lowerKey.includes('tags')) newObj.tags = obj[key];
        else if (lowerKey.includes('content')) newObj.content = obj[key];
        else if (lowerKey.includes('chatresponse')) newObj.chatResponse = obj[key];
        else newObj[lowerKey] = obj[key];
    }
    return newObj;
}

/**
 * 위키 콘텐츠를 생성합니다.
 * @param topic 주제
 * @param language 언어 코드 (기본값: 'en')
 */
export async function generateWikiContent(topic: string, language: string = 'en') {
    if (!apiKey) {
        throw new Error("API 키가 없습니다. .env 파일을 확인해주세요.");
    }

    // Gemini 3.0 Flash Preview 모델 사용
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

    const prompt = `
  Role: 당신은 지식 탐구 플랫폼 "Constella"의 AI 사서입니다.
  Task: 사용자 입력 "${topic}"에서 핵심 주제(Topic)를 추출하고, 그 주제에 대해 초보자도 이해하기 쉽게 설명해주세요.
  Language Instruction: 답변은 반드시 **${language === 'ko' ? '한국어(Korean)' : 'English'}**로 작성해야 합니다.
  
  Requirements:
  1. **Output Format**: 단일 JSON 객체로 반환하세요. 마크다운 코드 블록으로 감싸지 마세요. 배열이나 "response" 객체로 감싸지 마세요.
  2. **Keys**: 다음의 정확한 키(camelCase)를 사용하세요:
     - topic: 키워드 (명사).
     - title: 현지화된 이름 (${language === 'ko' ? '한국어' : 'English'}).
     - canonicalName: 공식 영문명 (Full Name).
     - tags: 문자열 배열 (카테고리).
     - content: 위키 아티클 내용 (Markdown, 객관적, [[links]] 포함).
     - chatResponse: 대화형 답변 (Markdown, [[links]] 포함).
  3. **Content**:
     - content: 200단어 요약. 인사말 생략. **3-5개의 핵심 과학, 기술, 인문, 예술 등 관련 개념을 [[brackets]]으로 감싸세요**.
     - chatResponse: 친근하고 대화체. 3개 이상의 관련 주제를 [[links]]로 포함하세요.
     - **Link Note**: 링크는 **개별적이고 원자적인 개념**이어야 합니다 (예: "[[인공지능 윤리]]" 대신 "[[인공지능]], [[윤리]]" 사용). 서로 다른 개념을 하나의 링크로 합치지 마세요.
     - **Format Warning**: 표준 마크다운 링크 문법(예: [text](url) 또는 [text](#id))을 사용하지 마세요. 오직 [[내부 링크]] 형식만 사용하세요.
  4. **Accuracy & Hallucination Control**:
     - 신뢰할 수 있는 지식과 문헌에 기반하여 정보를 검증하세요.
     - 주제가 터무니없거나, 알려지지 않았거나, 모호한 경우 'chatResponse'에 명확히 정의할 수 없음을 명시하세요. 사실을 지어내지 마세요.
  5. **Input Validation & Handling**:
     - **Complex Sentences/Questions**: 사용자 입력이 문장인 경우(예: "양자역학이 뭐야?", "르네상스 설명해줘"), 가장 관련성 높은 명사(예: "양자역학", "르네상스")를 'topic'으로 **추출**하세요.
     - **Rejection**: 입력이 지식 학습과 무관한 복잡한 기술 명령인 경우(예: "gitlab mermaid diagram to svg", "write python code"), 'topic'을 "Unknown"으로, 'content'를 "Invalid Request"로 설정하세요.
     - **Guidance**: 입력이 문장이나 질문이었던 경우, 'chatResponse'에 부드러운 안내를 포함하세요: "효율적인 데이터베이스 조회를 위해 키워드 입력이 권장됩니다. 요청을 다음으로 해석했습니다: [Topic Name]." (타겟 언어로 번역).
  `;

    let text = "";
    try {
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        });
        const response = await result.response;
        text = response.text();

        let parsed = JSON.parse(cleanJsonString(text));

        parsed = unwrapGeminiResponse(parsed);
        parsed = normalizeWikiResponse(parsed);

        // 필수 필드 검증
        if (!parsed.topic) throw new Error("Gemini 응답에 'topic' 필드가 누락되었습니다.");
        if (!parsed.content) throw new Error("Gemini 응답에 'content' 필드가 누락되었습니다.");

        // 기본값 보장
        parsed.tags = parsed.tags || [];
        parsed.canonicalName = parsed.canonicalName || parsed.topic;
        parsed.chatResponse = parsed.chatResponse || "";

        return parsed as { topic: string, title?: string, canonicalName: string, tags: string[], content: string, chatResponse: string };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        logger.error("Gemini 생성 오류:", { message: error.message, stack: error.stack, rawResponse: text });
        if (error instanceof SyntaxError) {
            throw new Error("AI가 올바른 JSON 형식을 반환하지 않았습니다.");
        }
        throw new Error("AI 사서로부터 콘텐츠를 생성하지 못했습니다: " + (error.message || "Unknown Error"));
    }
}

/**
 * 여러 주제를 한 번에 번역합니다.
 * @param topics 주제 목록
 * @param targetLang 목표 언어 코드
 */
export const batchTranslate = async (topics: string[], targetLang: string) => {
    if (!apiKey) throw new Error("API 키가 누락되었습니다.");

    // 목표 언어가 영어라면, 주제들이 이미 영어 정식 명칭이라고 가정합니다.
    if (targetLang === 'en') {
        const result: Record<string, string> = {};
        topics.forEach(t => result[t] = t);
        return result;
    }

    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
    const prompt = `
    Role: 전문 지식 백과사전 번역가
    Task: 다음 용어 목록을 ${targetLang === 'ko' ? '한국어(Korean)' : targetLang}로 번역하세요.
    Requirements:
    1. 엄격하게 유효한 JSON 형식만 출력하세요: { "Original Name": "Translated Name" }.
    2. 해당 분야의 표준 용어 뉘앙스를 유지하세요 (예: "Black Hole" -> "블랙홀").
    3. 고유명사이거나 영어를 그대로 유지하는 것이 더 나은 경우, 그대로 두거나 적절히 음차하세요.

    List:
    ${JSON.stringify(topics)}
    `;

    try {
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        });
        const text = result.response.text();
        return JSON.parse(cleanJsonString(text)) as Record<string, string>;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
        logger.error("Gemini 일괄 번역 오류", e);
        return {};
    }
};
