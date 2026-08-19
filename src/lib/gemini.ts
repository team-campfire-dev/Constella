import { GoogleGenAI } from "@google/genai";
import logger from "@/lib/logger";

export interface ChatHistoryEntry {
    role: 'user' | 'assistant';
    content: string;
}

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

if (!apiKey) {
    logger.warn("GOOGLE_GENERATIVE_AI_API_KEY가 설정되지 않았습니다. AI 기능이 작동하지 않을 수 있습니다.");
}

// API 키가 없으면 더미 값으로 초기화 (실제 호출 시 에러 발생)
const genAI = new GoogleGenAI({ apiKey: apiKey || "dummy" });

/**
 * 사용할 모델. 프리뷰 모델을 코드 배포 없이 교체할 수 있도록 환경변수로 뺀다.
 * 기본값은 지금까지 하드코딩되어 있던 값과 동일하다.
 */
const MODEL = process.env.GEMINI_MODEL ?? "gemini-3-flash-preview";

/** 한 번의 생성 호출에 허용하는 시간. 이전 SDK의 RequestOptions.timeout과 같은 값. */
const REQUEST_TIMEOUT_MS = 45000;

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 지수 백오프로 비동기 함수를 재시도합니다.
 * Why: Gemini API의 일시적 5xx, 네트워크 hiccup, 가끔 JSON 형식 어긋남은 단순 재시도로 흡수 가능.
 */
async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    options: { attempts?: number; baseDelayMs?: number; label?: string } = {}
): Promise<T> {
    const { attempts = 3, baseDelayMs = 400, label = 'gemini' } = options;
    let lastError: unknown;
    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            const isLast = i === attempts - 1;
            if (isLast) break;
            const delay = baseDelayMs * Math.pow(2, i);
            logger.warn(`[${label}] 시도 ${i + 1}/${attempts} 실패, ${delay}ms 후 재시도`, {
                message: error instanceof Error ? error.message : String(error)
            });
            await sleep(delay);
        }
    }
    throw lastError;
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
        else if (lowerKey.includes('followup') || lowerKey.includes('follow_up')) newObj.isFollowUp = obj[key];
        else newObj[lowerKey] = obj[key];
    }
    return newObj;
}

export interface WikiContentQuality {
    ok: boolean;
    headings: number;
    links: number;
    words: number;
    reasons: string[];
}

/**
 * 나무위키 스타일 프롬프트 산출물이 최소 구조를 갖췄는지 검사합니다.
 * 임계값은 프롬프트의 "600~1000단어 / 섹션 ## 헤딩 / 8-15링크" 요구에서 안전 마진을 둠.
 */
export function evaluateWikiContent(content: string): WikiContentQuality {
    if (!content) {
        return { ok: false, headings: 0, links: 0, words: 0, reasons: ['empty'] };
    }
    const headings = (content.match(/^##\s/gm) || []).length;
    const links = (content.match(/\[\[[^\]]+\]\]/g) || []).length;
    const words = content.split(/\s+/).filter(Boolean).length;
    const reasons: string[] = [];
    if (headings < 3) reasons.push(`headings=${headings}<3`);
    if (links < 5) reasons.push(`links=${links}<5`);
    if (words < 400) reasons.push(`words=${words}<400`);
    return { ok: reasons.length === 0, headings, links, words, reasons };
}

/**
 * 위키 콘텐츠를 생성합니다.
 * @param topic 주제
 * @param language 언어 코드 (기본값: 'en')
 */
export async function generateWikiContent(topic: string, language: string = 'en', conversationHistory?: ChatHistoryEntry[]) {
    if (!apiKey) {
        throw new Error("API 키가 없습니다. .env 파일을 확인해주세요.");
    }

    const prompt = `
  Role: 당신은 지식 탐구 플랫폼 "Constella"의 AI 사서입니다.
  Task: 사용자 입력 "${topic}"에서 핵심 주제(Topic)를 추출하고, 그 주제에 대해 초보자도 이해하기 쉽게 설명해주세요.
  Language Instruction: 답변은 반드시 **${language === 'ko' ? '한국어(Korean)' : 'English'}**로 작성해야 합니다.
  
  Requirements:
  1. **Output Format**: 단일 JSON 객체로 반환하세요. 마크다운 코드 블록으로 감싸지 마세요. 배열이나 "response" 객체로 감싸지 마세요.
  2. **Keys**: 다음의 정확한 키(camelCase)를 사용하세요:
     - topic: 키워드 (명사).
     - title: 현지화된 이름 (${language === 'ko' ? '한국어' : 'English'}).
     - canonicalName: 공식 영문명 (Full Name). **반드시 해당 개념의 가장 널리 사용되는 공식 영어 명칭을 사용하세요. Wikipedia 표제어를 기준으로 삼으세요.** 예: "양자역학", "quantum physics", "quantum theory"는 모두 canonicalName = "Quantum Mechanics"로 통일해야 합니다.
     - tags: 문자열 배열 (카테고리).
     - content: 위키 아티클 내용 (Markdown, 객관적, [[links]] 포함).
     - chatResponse: 대화형 답변 (Markdown, [[links]] 포함).
     - isFollowUp: boolean. 이 질문이 이전 대화의 후속 질문인지 여부. 아래 6번 규칙을 참고하세요.
  3. **Content (나무위키 스타일 위키 아티클)**:
     - **구조**: 반드시 마크다운 헤딩(\`##\`, \`###\`)으로 섹션을 명확히 구분하세요. 아래 템플릿을 기본으로 하되, 주제 성격에 따라 섹션을 가감하세요(예: 인물 → 생애/업적, 작품 → 줄거리/등장인물, 과학 개념 → 원리/응용). 무관한 섹션은 억지로 채우지 말고 생략하세요.
       1. \`## 개요\` (영문: \`## Overview\`) — 주제를 한두 문단으로 압축 정의. 첫 문장은 "X는 ~이다." 형식의 명료한 정의로 시작.
       2. \`## 상세\` (영문: \`## Details\`) — 핵심 개념, 작동 원리, 본질적 설명을 2-3 문단으로.
       3. \`## 역사\` 또는 \`## 배경\` (영문: \`## History\` / \`## Background\`) — 등장 배경, 발전 과정. \`### 초기\`, \`### 현대\` 등 소제목 활용 가능 (해당될 때만).
       4. \`## 특징\` / \`## 구성\` / \`## 종류\` 중 적절한 것 (영문: \`## Features\` / \`## Components\` / \`## Types\`) — 주요 특징·구성요소·분류를 \`###\` 소제목 또는 불릿 리스트로 구조화.
       5. \`## 영향 및 의의\` 또는 \`## 응용\` (영문: \`## Impact\` / \`## Applications\`) — 관련 분야, 실제 활용, 사회·학문적 영향.
       6. \`## 관련 문서\` (영문: \`## See also\`) — 인접 토픽을 \`- [[토픽명]]\` 불릿 리스트로 5개 이상 나열.
     - **분량**: 전체 600~1000단어. 각 섹션은 최소 한 문단(2-3문장) 이상. 너무 짧으면 섹션을 분리하지 말 것.
     - **링크**: 본문 전반에 **8-15개의 [[brackets]] 링크**를 자연스럽게 배치. 과학·기술·인문·예술 등 인접 개념을 폭넓게 연결하고, \`## 관련 문서\` 섹션에 핵심 링크를 다시 모아 제시.
     - **문체**: 객관적·중립적 백과사전 톤. 한국어는 "~이다/한다"체(평서형 종결). 인사말("안녕하세요"), 자기소개, "~에 대해 설명해드리겠습니다" 같은 메타 문구 금지. 추측이나 주관적 평가는 "~로 알려져 있다", "~로 평가된다" 형태로 출처를 암시.
     - **언어별 섹션명**: 위 헤딩 목록의 첫 번째(한국어) 또는 두 번째(영문)를 답변 언어에 맞게 일관되게 사용. 한 문서 안에서 한국어/영어 헤딩을 섞지 말 것.
   - **chatResponse**: 친근하고 대화체. 3개 이상의 관련 주제를 [[links]]로 포함하세요. (채팅 답변이므로 \`##\` 헤딩은 사용하지 않고 평문 1-3문단으로 작성)
   - **Link Note**: 링크는 **개별적이고 원자적인 개념**이어야 합니다 (예: "[[인공지능 윤리]]" 대신 "[[인공지능]], [[윤리]]"). 서로 다른 개념을 하나의 링크로 합치지 마세요.
   - **Format Warning**: 표준 마크다운 링크 문법(\`[text](url)\`, \`[text](#id)\`)을 사용하지 마세요. 내부 링크는 오직 \`[[링크]]\` 형식만 허용. 이미지·외부 URL도 삽입 금지.
  4. **Accuracy & Hallucination Control**:
     - 신뢰할 수 있는 지식과 문헌에 기반하여 정보를 검증하세요.
     - 주제가 터무니없거나, 알려지지 않았거나, 모호한 경우 'chatResponse'에 명확히 정의할 수 없음을 명시하세요. 사실을 지어내지 마세요.
  5. **Input Validation & Handling**:
     - **Complex Sentences/Questions**: 사용자 입력이 문장인 경우(예: "양자역학이 뭐야?", "르네상스 설명해줘"), 가장 관련성 높은 명사(예: "양자역학", "르네상스")를 'topic'으로 **추출**하세요.
     - **Rejection**: 입력이 지식 학습과 무관한 복잡한 기술 명령인 경우(예: "gitlab mermaid diagram to svg", "write python code"), 'topic'을 "Unknown"으로, 'content'를 "Invalid Request"로 설정하세요.
     - **Guidance**: 입력이 문장이나 질문이었던 경우, 'chatResponse'에 부드러운 안내를 포함하세요: "효율적인 데이터베이스 조회를 위해 키워드 입력이 권장됩니다. 요청을 다음으로 해석했습니다: [Topic Name]." (타겟 언어로 번역).
  6. **Follow-Up Detection (대화 맥락 연속성)**:
     - 이전 대화 이력이 제공된 경우, 현재 질문이 이전 대화의 후속 질문인지 판단하세요.
     - **후속 질문의 예**: "좀 더 자세히 알려줘", "다른 관점은?", "그게 왜 중요해?", "예시를 들어줘", "아까 그거 관련해서..."
     - 후속 질문이면 **isFollowUp을 true**로, **topic/canonicalName은 이전 대화에서 다룬 주제와 동일하게** 설정하세요.
     - 새로운 주제에 대한 질문이면 **isFollowUp을 false**로 설정하세요.
     - 후속 질문일 때의 chatResponse는 이전 대화 맥락을 자연스럽게 이어가며 답변하세요. content(위키 아티클)도 해당 주제에 대해 정상적으로 작성하세요.
  `;

    let text = "";
    try {
        // Build multi-turn contents array
        const contents: { role: string; parts: { text: string }[] }[] = [];

        // Add conversation history as alternating user/model turns
        if (conversationHistory && conversationHistory.length > 0) {
            // System prompt as preamble in the first user turn
            contents.push({ role: "user", parts: [{ text: prompt }] });
            contents.push({ role: "model", parts: [{ text: "네, 위의 지침을 이해했습니다. 사용자의 질문에 JSON 형식으로 답변하겠습니다." }] });

            // Add previous conversation turns (last N messages, excluding the current query)
            for (const entry of conversationHistory) {
                contents.push({
                    role: entry.role === 'user' ? 'user' : 'model',
                    parts: [{ text: entry.content }]
                });
            }

            // Current query as the final user turn
            contents.push({ role: "user", parts: [{ text: topic }] });
        } else {
            // No history: single-turn (original behavior)
            contents.push({ role: "user", parts: [{ text: prompt }] });
        }

        let parsed = await retryWithBackoff(async () => {
            const result = await genAI.models.generateContent({
                model: MODEL,
                contents,
                config: {
                    responseMimeType: "application/json",
                    httpOptions: { timeout: REQUEST_TIMEOUT_MS },
                }
            });
            // 이전 SDK의 response.text()는 메서드였고, 새 SDK에서는 접근자다.
            // 응답이 차단되면 예외 대신 undefined가 오므로 빈 문자열로 떨어뜨려
            // 아래 JSON.parse가 SyntaxError를 내게 한다 — 기존 오류 경로와 동일하게 처리된다.
            let raw = result.text ?? "";

            // JSON 추출 (마크다운 코드 블록이나 주변 텍스트 제거)
            const firstBrace = raw.indexOf('{');
            const firstBracket = raw.indexOf('[');
            const lastBrace = raw.lastIndexOf('}');
            const lastBracket = raw.lastIndexOf(']');

            const start = (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) ? firstBrace : firstBracket;
            const end = (lastBrace !== -1 && (lastBracket === -1 || lastBrace > lastBracket)) ? lastBrace : lastBracket;

            if (start !== -1 && end !== -1 && start < end) {
                raw = raw.substring(start, end + 1);
            }

            text = raw;
            return JSON.parse(raw);
        }, { attempts: 3, baseDelayMs: 500, label: 'gemini.generateWikiContent' });

        parsed = unwrapGeminiResponse(parsed);
        parsed = normalizeWikiResponse(parsed);

        // 필수 필드 검증
        if (!parsed.topic) throw new Error("Gemini 응답에 'topic' 필드가 누락되었습니다.");
        if (!parsed.content) throw new Error("Gemini 응답에 'content' 필드가 누락되었습니다.");

        // 기본값 보장
        parsed.tags = parsed.tags || [];
        parsed.canonicalName = parsed.canonicalName || parsed.topic;
        parsed.chatResponse = parsed.chatResponse || "";
        parsed.isFollowUp = parsed.isFollowUp === true;

        return parsed as { topic: string, title?: string, canonicalName: string, tags: string[], content: string, chatResponse: string, isFollowUp: boolean };
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
        return await retryWithBackoff(async () => {
            const result = await genAI.models.generateContent({
                model: MODEL,
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                config: {
                    responseMimeType: "application/json",
                    httpOptions: { timeout: REQUEST_TIMEOUT_MS },
                }
            });
            let text = result.text ?? "";
            // JSON 추출 (마크다운 코드 블록이나 주변 텍스트 제거)
            const firstBrace = text.indexOf('{');
            const lastBrace = text.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
                text = text.substring(firstBrace, lastBrace + 1);
            }
            return JSON.parse(text) as Record<string, string>;
        }, { attempts: 3, baseDelayMs: 500, label: 'gemini.batchTranslate' });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
        logger.error("Gemini 일괄 번역 오류", e);
        return {};
    }
};
