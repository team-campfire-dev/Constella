import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

if (!apiKey) {
    console.warn("GOOGLE_GENERATIVE_AI_API_KEY가 설정되지 않았습니다. AI 기능이 작동하지 않을 수 있습니다.");
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
     Example: { "topic": "Black Hole", "content": "A black hole is..." }
  2. **Topic**: 사용자의 질문이나 문장에서 핵심 주제 명사형 단어만 추출하세요. (예: "블랙홀이 뭐야?" -> "블랙홀", "What is Outer Wilds?" -> "Outer Wilds")
  3. **Content**:
     - Markdown 형식을 사용하세요.
     - 중요한 키워드는 [[Keyword]]와 같이 이중 대괄호로 감싸세요.
     - 3~5개의 관련된 핵심 키워드를 포함하세요.
     - 200단어 내외로 간결하게 작성하세요.
     - 말투는 친절하고 약간 미래지향적인 느낌을 주되 명확해야 합니다.
  `;

    try {
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        });
        const response = await result.response;
        const text = response.text();
        return JSON.parse(text) as { topic: string, content: string };
    } catch (error) {
        console.error("Gemini 생성 오류:", error);
        // Fallback for error or parsing failure - try to recover or just throw
        if (error instanceof SyntaxError) {
            // If JSON parsing fails, assume text is content but topic is query (fallback)
            // But we really want the topic.
            // For now, throw to ensure we don't save bad data.
            throw new Error("AI가 올바른 JSON 형식을 반환하지 않았습니다.");
        }
        throw new Error("AI 사서로부터 콘텐츠를 생성하지 못했습니다.");
    }
}
