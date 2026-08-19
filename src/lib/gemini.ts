import { GoogleGenAI, ThinkingLevel, Type, type Schema } from "@google/genai";
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

// ════════════════════════════════════════════════════════════════
// 라우터 — 사용자 질의 1건당 임계 경로에 놓이는 유일한 모델 호출.
//
// 분류(intent) · 이름 정규화 · 대화 답변까지만 담당한다. 위키 본문은
// 만들지 않는다 — 화면에 표시되지도 않는 600~1000단어를 사용자가 기다리게
// 만드는 것이 이 재설계가 없애려는 문제다.
// ════════════════════════════════════════════════════════════════

export type RouterIntent = 'new_topic' | 'follow_up' | 'reject';

export interface RouterResult {
    intent: RouterIntent;
    /** 채팅 말풍선에 그대로 실린다. 모든 분기에서 채워진다. */
    chatResponse: string;
    /** 아래 넷은 new_topic일 때만 의미가 있다. 그 외에는 빈 값. */
    topic: string;
    canonicalName: string;
    title: string;
    tags: string[];
}

/**
 * 라우터 출력 스키마.
 *
 * propertyOrdering으로 intent를 가장 먼저 생성하게 한다. 분류가 먼저 확정되어야
 * 뒤따르는 이름과 답변이 그 분류에 맞게 나온다.
 *
 * required는 intent와 chatResponse뿐이다. follow_up·reject 경로에서 쓰지도 않을
 * 이름 필드를 강제로 채우게 하면 출력 토큰만 늘어난다.
 */
const ROUTER_SCHEMA: Schema = {
    type: Type.OBJECT,
    propertyOrdering: ['intent', 'topic', 'canonicalName', 'title', 'tags', 'chatResponse'],
    required: ['intent', 'chatResponse'],
    properties: {
        intent: {
            type: Type.STRING,
            enum: ['new_topic', 'follow_up', 'reject'],
            description: '입력의 분류.',
        },
        topic: {
            type: Type.STRING,
            description: '추출한 핵심 키워드(명사). new_topic일 때만.',
        },
        canonicalName: {
            type: Type.STRING,
            description: '공식 영문 명칭. Wikipedia 표제어 기준. new_topic일 때만.',
        },
        title: {
            type: Type.STRING,
            description: '답변 언어로 된 표제. new_topic일 때만.',
        },
        tags: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '소문자 카테고리 목록. new_topic일 때만.',
        },
        chatResponse: {
            type: Type.STRING,
            description: '채팅 말풍선에 표시할 대화형 답변. 평문 마크다운.',
        },
    },
};

function routerSystemInstruction(language: string): string {
    const langName = language === 'ko' ? '한국어(Korean)' : 'English';
    return `당신은 지식 탐구 플랫폼 "Constella"의 AI 사서입니다.
사용자 입력을 분류하고 대화형 답변을 작성합니다.
**위키 본문은 작성하지 않습니다.** 본문은 별도 단계에서 생성됩니다.

답변은 반드시 ${langName}로 작성하세요.

# 분류 (intent)

## reject — 지식 항목에 대한 설명 요청이 아닌 경우. 두 종류가 있습니다.

**(1) 작업 수행 요청**
코드 작성·수정·리팩터링, 번역, 요약, 계산, 파일/포맷 변환, 도구 조작 등.
예: "write python code" / "gitlab mermaid diagram to svg"
    "이 코드 리팩터링해줘" / "translate this to french: hello world"

**(2) 지식 항목으로 해석할 수 없는 입력**
무의미한 문자열, 자판을 두드린 흔적, 오타 뭉치.
예: "ㅁㄴㅇㄹ asdfqwer" / "asdkjfhaskdjf"

두 경우 모두 topic·canonicalName·title·tags를 만들지 마세요. chatResponse로만 답합니다.
특히 "Unidentified Input", "Unknown", "Invalid Request" 같은 **가짜 토픽 이름을 지어내지 마세요.**
존재하지 않는 개념이 저장소에 들어가면 다른 탐험가들의 별자리 지도까지 오염됩니다.

## follow_up — 직전 대화의 주제를 이어받는 질문
예: "좀 더 자세히" / "그게 왜 중요해?" / "예시를 들어줘" / "아까 그거 관련해서"
**주제 이름을 다시 말할 필요가 없습니다.** 서버가 직전 주제를 기억하고 있습니다.
topic·canonicalName·title·tags를 만들지 마세요.

## new_topic — 그 외 전부. 지식 항목에 대한 키워드 또는 질문.

# reject와 '안내'를 혼동하지 마세요

입력이 문장이라 키워드 추출이 필요했다는 것은 reject의 근거가 **아닙니다**.
그런 경우 new_topic으로 분류하고, chatResponse 끝에 한 문장을 덧붙이세요:
"효율적인 탐사를 위해 키워드 입력을 권장합니다. 요청을 [주제]로 해석했습니다."

**안내는 new_topic의 부가 요소이지 reject의 대체재가 아닙니다.**
작업 수행 요청은 아무리 정중하게 표현되어도 reject입니다. 그런 입력에
안내 문구만 돌려주고 토픽을 만들면 안 됩니다.

# new_topic일 때의 필드

- topic: 입력에서 추출한 핵심 키워드(명사). 문장이면 가장 관련성 높은 명사를 뽑습니다.
- canonicalName: 그 개념의 가장 널리 쓰이는 **공식 영어 명칭**. Wikipedia 표제어를 기준으로
  삼으세요. "양자역학" / "quantum physics" / "quantum theory"는 모두
  canonicalName = "Quantum Mechanics"로 통일되어야 합니다. 이 값이 저장소의 키이므로
  같은 개념이 다른 이름으로 갈라지면 중복 문서가 생깁니다.
- title: ${langName}로 표기한 표제.
- tags: 소문자 카테고리 문자열 배열.

# chatResponse 작성 규칙

- 친근한 대화체. 평문 1~3문단. \`##\` 헤딩을 쓰지 마세요.
- 관련 개념을 \`[[대괄호]]\` 링크로 **3개 이상** 포함하세요.
- 링크는 원자적 개념이어야 합니다. "[[인공지능 윤리]]"가 아니라 "[[인공지능]], [[윤리]]".
- 표준 마크다운 링크(\`[text](url)\`)와 이미지·외부 URL은 금지입니다.
- reject일 때: 왜 이 요청을 처리할 수 없는지와 무엇을 입력하면 되는지 안내하세요.
  이 경우 [[링크]]는 넣지 않아도 됩니다.
- follow_up일 때: 직전 대화 맥락을 자연스럽게 이어 답변하세요.
- 주제가 모호하거나 알려지지 않았다면 명확히 정의할 수 없다고 밝히세요. 지어내지 마세요.`;
}

/**
 * 사용자 질의를 분류하고 대화 답변을 만듭니다. 위키 본문은 만들지 않습니다.
 *
 * 사고 레벨을 LOW로 둡니다 — 3분기 분류와 이름 정규화에 깊은 추론이 필요하지 않고,
 * 이 호출이 사용자가 실제로 기다리는 유일한 구간이기 때문입니다. 완전히 끄지 않는
 * 이유는 canonicalName 정규화가 세계 지식을 요구하는 작업이라서입니다.
 */
export async function routeQuery(
    query: string,
    language: string = 'en',
    conversationHistory?: ChatHistoryEntry[]
): Promise<RouterResult> {
    if (!apiKey) {
        throw new Error("API 키가 없습니다. .env 파일을 확인해주세요.");
    }

    const contents = [
        ...(conversationHistory ?? []).map(entry => ({
            role: entry.role === 'user' ? 'user' : 'model',
            parts: [{ text: entry.content }],
        })),
        { role: 'user', parts: [{ text: query }] },
    ];

    let raw = "";
    try {
        const parsed = await retryWithBackoff(async () => {
            const result = await genAI.models.generateContent({
                model: MODEL,
                contents,
                config: {
                    systemInstruction: routerSystemInstruction(language),
                    responseMimeType: "application/json",
                    responseSchema: ROUTER_SCHEMA,
                    thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
                    httpOptions: { timeout: REQUEST_TIMEOUT_MS },
                },
            });
            raw = result.text ?? "";
            // 스키마가 형태를 보장하므로 껍데기를 벗기거나 키 이름을 추측할 필요가 없다.
            return JSON.parse(raw);
        }, { attempts: 3, baseDelayMs: 400, label: 'gemini.routeQuery' });

        const intent: RouterIntent =
            parsed.intent === 'follow_up' || parsed.intent === 'reject' ? parsed.intent : 'new_topic';

        return {
            intent,
            chatResponse: typeof parsed.chatResponse === 'string' ? parsed.chatResponse : "",
            topic: intent === 'new_topic' ? (parsed.topic ?? "") : "",
            canonicalName: intent === 'new_topic' ? (parsed.canonicalName || parsed.topic || "") : "",
            title: intent === 'new_topic' ? (parsed.title ?? "") : "",
            tags: intent === 'new_topic' && Array.isArray(parsed.tags) ? parsed.tags : [],
        };
    } catch (error) {
        logger.error("라우터 호출 실패", {
            message: error instanceof Error ? error.message : String(error),
            query, language, rawResponse: raw,
        });
        throw new Error("AI 사서가 요청을 해석하지 못했습니다.");
    }
}

// ════════════════════════════════════════════════════════════════
// 본문 생성 — 응답 이후 백그라운드에서 돈다.
//
// (canonicalName, language)의 순수 함수다. 사용자 대화 이력을 받지 않는다:
// WikiArticle은 @@unique([topicId, language])로 모든 탐험가가 공유하는 문서이므로,
// 한 사용자의 맥락으로 만들면 안 된다.
//
// JSON이 아니라 순수 마크다운을 반환한다 — 껍데기가 없으므로 필요해지면
// generateContentStream으로 그대로 흘려보낼 수 있다.
// ════════════════════════════════════════════════════════════════

export interface ArticleBodyRequest {
    /** 저장소 키. 문서의 주제를 결정한다. */
    canonicalName: string;
    /** 해당 언어 표제. 비어 있으면 canonicalName을 쓴다. */
    title?: string;
    tags?: string[];
    language?: string;
    /**
     * 직전 시도가 품질 기준에 미달했을 때의 보강 정보.
     * 대화 이력이 아니라 단일 턴 지시로 전달한다 — 그래야 본문 생성이
     * 사용자와 무관한 순수 함수로 남는다.
     */
    deficiency?: { reasons: string[]; previous: string };
}

function articleSystemInstruction(language: string): string {
    const ko = language === 'ko';
    const langName = ko ? '한국어(Korean)' : 'English';
    return `당신은 지식 백과사전의 편집자입니다. 주어진 주제에 대한 위키 아티클 본문만 작성합니다.

답변은 반드시 ${langName}로 작성하세요.

# 출력 형식
마크다운 본문만 출력하세요. JSON도, 코드 블록 감싸기도, 머리말도 붙이지 마세요.
첫 글자부터 곧바로 \`##\` 헤딩으로 시작합니다.

# 구조
아래 템플릿을 기본으로 하되 주제 성격에 따라 섹션을 가감하세요.
(인물 → 생애/업적, 작품 → 줄거리/등장인물, 과학 개념 → 원리/응용)
무관한 섹션은 억지로 채우지 말고 생략하세요.

1. \`## ${ko ? '개요' : 'Overview'}\` — 한두 문단으로 압축 정의. 첫 문장은 "X는 ~이다." 형식.
2. \`## ${ko ? '상세' : 'Details'}\` — 핵심 개념·작동 원리를 2-3 문단으로.
3. \`## ${ko ? '역사' : 'History'}\` 또는 \`## ${ko ? '배경' : 'Background'}\` — 등장 배경과 발전 과정 (해당될 때만).
4. \`## ${ko ? '특징' : 'Features'}\` / \`## ${ko ? '구성' : 'Components'}\` / \`## ${ko ? '종류' : 'Types'}\` 중 적절한 것.
5. \`## ${ko ? '영향 및 의의' : 'Impact'}\` 또는 \`## ${ko ? '응용' : 'Applications'}\`.
6. \`## ${ko ? '관련 문서' : 'See also'}\` — 인접 토픽을 \`- [[토픽명]]\` 불릿으로 5개 이상.

한 문서 안에서 언어를 섞지 마세요.

# 분량
전체 600~1000단어. 각 섹션은 최소 한 문단(2-3문장) 이상.

# 링크
본문 전반에 \`[[대괄호]]\` 링크를 8-15개 자연스럽게 배치하세요.
과학·기술·인문·예술 등 인접 개념을 폭넓게 연결하고, \`## ${ko ? '관련 문서' : 'See also'}\`에 핵심 링크를 다시 모읍니다.
링크는 원자적 개념이어야 합니다: "[[인공지능 윤리]]"가 아니라 "[[인공지능]], [[윤리]]".
표준 마크다운 링크(\`[text](url)\`)와 이미지·외부 URL은 금지입니다.

# 문체
객관적·중립적 백과사전 톤.${ko ? ' 한국어는 "~이다/한다"체(평서형 종결).' : ''}
인사말, 자기소개, "~에 대해 설명해드리겠습니다" 같은 메타 문구를 쓰지 마세요.
신뢰할 수 있는 지식에 근거하고, 추측은 "~로 알려져 있다" 형태로 표현하세요. 지어내지 마세요.`;
}

/**
 * 위키 본문(마크다운)을 생성합니다.
 * 반환값은 순수 마크다운 문자열이며 JSON 껍데기가 없습니다.
 */
export async function generateArticleBody(req: ArticleBodyRequest): Promise<string> {
    if (!apiKey) {
        throw new Error("API 키가 없습니다. .env 파일을 확인해주세요.");
    }

    const language = req.language ?? 'en';
    const title = req.title?.trim() || req.canonicalName;
    const tagLine = req.tags?.length ? `\n분류: ${req.tags.join(', ')}` : '';

    let userText = `주제: ${req.canonicalName}\n표제: ${title}${tagLine}\n\n위 주제에 대한 위키 아티클 본문을 작성하세요.`;

    if (req.deficiency) {
        userText += `\n\n---\n이전 시도가 다음 기준에 미달했습니다: ${req.deficiency.reasons.join(', ')}.
\`##\` 헤딩 3개 이상, \`[[링크]]\` 5개 이상, 충분한 분량을 갖추어 다시 작성하세요.

[이전 시도]
${req.deficiency.previous}`;
    }

    try {
        return await retryWithBackoff(async () => {
            const result = await genAI.models.generateContent({
                model: MODEL,
                contents: [{ role: 'user', parts: [{ text: userText }] }],
                config: {
                    systemInstruction: articleSystemInstruction(language),
                    httpOptions: { timeout: REQUEST_TIMEOUT_MS },
                },
            });
            const text = (result.text ?? "").trim();
            if (!text) throw new Error("본문이 비어 있습니다.");
            return text;
        }, { attempts: 3, baseDelayMs: 500, label: 'gemini.generateArticleBody' });
    } catch (error) {
        logger.error("본문 생성 실패", {
            message: error instanceof Error ? error.message : String(error),
            canonicalName: req.canonicalName, language,
        });
        throw new Error("위키 본문을 생성하지 못했습니다: " + (error instanceof Error ? error.message : "Unknown Error"));
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
