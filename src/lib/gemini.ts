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

    // 사용자 요청: "Gemini 3 Flash" (2026년 기준 최신 모델, gemini-3-flash-preview)
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

    const prompt = `
  Role: 당신은 SF 학습 플랫폼 "Constella"의 AI 사서입니다.
  Task: 사용자 입력 "${topic}"에서 핵심 주제(Topic)를 추출하고, 그 주제에 대해 초보자도 이해하기 쉽게 설명해주세요.
  Language Instruction: 답변은 반드시 **${language === 'ko' ? '한국어(Korean)' : 'English'}**로 작성해야 합니다.
  
  Requirements:
  1. **Output Format**: JSON 형식을 사용하세요.
     Example: { "topic": "Black Hole", "canonicalName": "Black Hole", "tags": ["Astronomy"], "content": "A black hole is...", "chatResponse": "Hello! A black hole is..." }
  2. **Topic**: 사용자의 질문이나 문장에서 핵심 주제를 추출한 것 (단수형, 명사).
  3. **Canonical Name**: 추출된 주제의 **공식적이고 가장 일반적인 전체 이름(Full Name)**을 작성하세요.
  4. **Tags**: 주제와 관련된 **핵심 카테고리나 연관 분야**를 2~3개 추출하세요.
  5. **Content (Wiki Data)**:
     - **이 필드에는 인사말이나 감탄사를 절대 포함하지 마세요.** 오직 객관적인 지식 정보만 담아야 합니다.
     - Markdown 형식을 사용하세요.
     - 3~5개의 핵심 키워드를 [[Keyword]]로 감싸주세요.
     - 200단어 내외로 요약된 백과사전식 설명을 작성하세요.
  6. **ChatResponse (For User)**:
     - 사용자의 질문에 대한 친절하고 대화체로 된 답변을 작성하세요. ("안녕하세요" 등 인사말 포함 가능)
     - 답변 중간중간에 **관련된 중요한 키워드나 개념**이 나온다면 반드시 '[[키워드]]' 형식으로 감싸주세요. (예: "이 별은 [[초신성]] 폭발 후에 형성됩니다.")
     - 최소 2개 이상의 연관 주제를 포함하여 사용자가 탐사를 이어갈 수 있도록 유도하세요.
  `;

    try {
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        });
        const response = await result.response;
        let text = response.text();

        // Remove markdown code blocks if present
        text = text.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');

        return JSON.parse(text) as { topic: string, canonicalName: string, tags: string[], content: string, chatResponse: string };
    } catch (error) {
        logger.error("Gemini 생성 오류:", { error });
        // Fallback for error or parsing failure - try to recover or just throw
        if (error instanceof SyntaxError) {
            // If JSON parsing fails
            throw new Error("AI가 올바른 JSON 형식을 반환하지 않았습니다.");
        }
        throw new Error("AI 사서로부터 콘텐츠를 생성하지 못했습니다.");
    }
}
