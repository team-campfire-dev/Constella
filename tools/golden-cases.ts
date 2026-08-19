/**
 * 골든 셋 케이스 정의 (30건)
 *
 * AI 하네스 재설계의 회귀 판정용 고정 입력 집합.
 * 재설계로 바뀌는 것들을 정확히 겨냥해 네 부류로 구성한다:
 *
 *   synonym  (9) — 동의어가 같은 canonicalName으로 수렴하는가.
 *                  사고(thinking) 레벨 인하의 직격 대상.
 *   followup (6) — 후속질문을 follow_up으로 판정하는가.
 *   reject   (5) — 지식 탐구와 무관한 입력을 거부하는가.
 *   general (10) — 본문 품질 점수 분포. 프롬프트 분해와 언어별 임계값의 영향.
 *
 * ⚠️ 케이스를 수정하면 기존 베이스라인과 비교할 수 없다.
 *    추가는 안전하지만(신규 id는 비교에서 'new'로 표시), 기존 id의 query/history 변경은 금지.
 */

export type CaseKind = 'synonym' | 'followup' | 'reject' | 'general';
export type Intent = 'new_topic' | 'follow_up' | 'reject';

export interface HistoryTurn {
    role: 'user' | 'assistant';
    content: string;
}

export interface GoldenCase {
    /** 안정적 식별자. 비교의 키이므로 절대 바꾸지 않는다. */
    id: string;
    kind: CaseKind;
    query: string;
    language: 'ko' | 'en';
    /** 기대 intent. 정확도 집계의 기준. */
    expectIntent: Intent;
    /** synonym 부류에서 같은 group은 하나의 canonicalName으로 수렴해야 한다. */
    group?: string;
    /** 수렴 목표 이름(참고용). 엄격 단언이 아니라 사람이 읽기 위한 메모. */
    expectCanonical?: string;
    /** followup 부류에 주입할 직전 대화. */
    history?: HistoryTurn[];
    /** 분류가 흔들려도 회귀로 치지 않음. 경계가 원래 모호한 케이스. */
    soft?: boolean;
    /** 왜 이 케이스가 셋에 있는지. */
    note?: string;
}

/** followup 케이스에 재사용하는 직전 대화 조각들. */
const HISTORY_QM_KO: HistoryTurn[] = [
    { role: 'user', content: '양자역학' },
    { role: 'assistant', content: '양자역학은 원자와 아원자 입자의 거동을 다루는 물리학 분야입니다. [[불확정성 원리]]와 [[파동함수]]가 핵심 개념이에요.' },
];

const HISTORY_RENAISSANCE_KO: HistoryTurn[] = [
    { role: 'user', content: '르네상스' },
    { role: 'assistant', content: '르네상스는 14~16세기 유럽에서 일어난 문화 운동입니다. [[인문주의]]가 그 사상적 토대였어요.' },
];

const HISTORY_PHOTOSYNTHESIS_EN: HistoryTurn[] = [
    { role: 'user', content: 'photosynthesis' },
    { role: 'assistant', content: 'Photosynthesis is how plants convert light into chemical energy. [[Chlorophyll]] and [[Calvin cycle]] are central to it.' },
];

export const GOLDEN_CASES: GoldenCase[] = [
    // ─────────────────────────────────────────────────────────────
    // synonym (9) — 3 그룹 × 3. 그룹 내 canonicalName이 하나로 모여야 한다.
    // ─────────────────────────────────────────────────────────────
    {
        id: 'syn-qm-ko', kind: 'synonym', group: 'quantum-mechanics',
        query: '양자역학', language: 'ko',
        expectIntent: 'new_topic', expectCanonical: 'Quantum Mechanics',
        note: '한국어 표제 → 영문 정식명 정규화',
    },
    {
        id: 'syn-qm-en-physics', kind: 'synonym', group: 'quantum-mechanics',
        query: 'quantum physics', language: 'en',
        expectIntent: 'new_topic', expectCanonical: 'Quantum Mechanics',
        note: '흔한 별칭 → 위키피디아 표제어로 흡수되어야 함',
    },
    {
        id: 'syn-qm-en-theory', kind: 'synonym', group: 'quantum-mechanics',
        query: 'quantum theory', language: 'en',
        expectIntent: 'new_topic', expectCanonical: 'Quantum Mechanics',
        note: '가장 흔들리기 쉬운 별칭',
    },
    {
        id: 'syn-bh-ko', kind: 'synonym', group: 'black-hole',
        query: '블랙홀', language: 'ko',
        expectIntent: 'new_topic', expectCanonical: 'Black Hole',
    },
    {
        id: 'syn-bh-en', kind: 'synonym', group: 'black-hole',
        query: 'black hole', language: 'en',
        expectIntent: 'new_topic', expectCanonical: 'Black Hole',
    },
    {
        id: 'syn-bh-en-alt', kind: 'synonym', group: 'black-hole',
        query: 'gravitational singularity', language: 'en',
        expectIntent: 'new_topic', expectCanonical: 'Black Hole', soft: true,
        note: '인접 개념이라 별도 토픽으로 갈라질 수 있음 — 변화만 기록',
    },
    {
        id: 'syn-ml-ko-loan', kind: 'synonym', group: 'machine-learning',
        query: '머신러닝', language: 'ko',
        expectIntent: 'new_topic', expectCanonical: 'Machine Learning',
        note: '외래어 표기',
    },
    {
        id: 'syn-ml-ko-native', kind: 'synonym', group: 'machine-learning',
        query: '기계학습', language: 'ko',
        expectIntent: 'new_topic', expectCanonical: 'Machine Learning',
        note: '한자어 표기 — 외래어 표기와 같은 곳으로 모여야 함',
    },
    {
        id: 'syn-ml-en', kind: 'synonym', group: 'machine-learning',
        query: 'machine learning', language: 'en',
        expectIntent: 'new_topic', expectCanonical: 'Machine Learning',
    },

    // ─────────────────────────────────────────────────────────────
    // followup (6) — 직전 대화가 주어졌을 때 후속질문으로 판정하는가.
    // ─────────────────────────────────────────────────────────────
    {
        id: 'fup-ko-detail', kind: 'followup',
        query: '좀 더 자세히 알려줘', language: 'ko',
        expectIntent: 'follow_up', history: HISTORY_QM_KO,
        note: '가장 전형적인 후속질문',
    },
    {
        id: 'fup-ko-why', kind: 'followup',
        query: '그게 왜 중요해?', language: 'ko',
        expectIntent: 'follow_up', history: HISTORY_QM_KO,
    },
    {
        id: 'fup-ko-example', kind: 'followup',
        query: '예시를 들어줘', language: 'ko',
        expectIntent: 'follow_up', history: HISTORY_RENAISSANCE_KO,
    },
    {
        id: 'fup-ko-anaphora', kind: 'followup',
        query: '아까 그거 관련해서 다른 관점은?', language: 'ko',
        expectIntent: 'follow_up', history: HISTORY_RENAISSANCE_KO,
        note: '지시대명사만으로 참조 — 가장 어려운 케이스',
    },
    {
        id: 'fup-en-more', kind: 'followup',
        query: 'tell me more', language: 'en',
        expectIntent: 'follow_up', history: HISTORY_PHOTOSYNTHESIS_EN,
    },
    {
        id: 'fup-en-matter', kind: 'followup',
        query: 'why does that matter?', language: 'en',
        expectIntent: 'follow_up', history: HISTORY_PHOTOSYNTHESIS_EN,
    },

    // ─────────────────────────────────────────────────────────────
    // reject (5) — 지식 탐구와 무관한 입력.
    // ─────────────────────────────────────────────────────────────
    {
        id: 'rej-en-code', kind: 'reject',
        query: 'write python code', language: 'en',
        expectIntent: 'reject',
        note: '프롬프트가 명시적으로 예시한 입력',
    },
    {
        id: 'rej-en-tooling', kind: 'reject',
        query: 'gitlab mermaid diagram to svg', language: 'en',
        expectIntent: 'reject',
        note: '프롬프트가 명시적으로 예시한 입력',
    },
    {
        id: 'rej-ko-refactor', kind: 'reject',
        query: '이 코드 리팩터링해줘', language: 'ko',
        expectIntent: 'reject',
    },
    {
        id: 'rej-en-translate', kind: 'reject',
        query: 'translate this to french: hello world', language: 'en',
        expectIntent: 'reject',
    },
    {
        id: 'rej-ko-gibberish', kind: 'reject',
        query: 'ㅁㄴㅇㄹ asdfqwer', language: 'ko',
        expectIntent: 'reject',
        note: '무의미 입력. 프롬프트가 이것을 reject의 두 번째 종류로 명시하므로 더 이상 soft가 아니다',
    },

    // ─────────────────────────────────────────────────────────────
    // general (10) — 본문 품질 분포. 도메인을 흩어 섹션 템플릿 적응력을 본다.
    // ─────────────────────────────────────────────────────────────
    { id: 'gen-ko-renaissance', kind: 'general', query: '르네상스', language: 'ko', expectIntent: 'new_topic', note: '역사 — 시대/배경 섹션이 살아야 함' },
    { id: 'gen-ko-photosynthesis', kind: 'general', query: '광합성', language: 'ko', expectIntent: 'new_topic', note: '자연과학 — 원리/과정' },
    { id: 'gen-ko-plate-tectonics', kind: 'general', query: '판 구조론', language: 'ko', expectIntent: 'new_topic', note: '띄어쓰기 포함 다어절 토픽' },
    { id: 'gen-ko-existentialism', kind: 'general', query: '실존주의', language: 'ko', expectIntent: 'new_topic', note: '철학 — 추상 개념' },
    { id: 'gen-ko-haiku', kind: 'general', query: '하이쿠', language: 'ko', expectIntent: 'new_topic', note: '문학 — 짧은 주제, 분량 미달이 나기 쉬움' },
    { id: 'gen-en-string-theory', kind: 'general', query: 'string theory', language: 'en', expectIntent: 'new_topic', note: '이론물리' },
    { id: 'gen-en-bauhaus', kind: 'general', query: 'Bauhaus', language: 'en', expectIntent: 'new_topic', note: '예술/디자인 — 고유명사' },
    { id: 'gen-en-mitochondria', kind: 'general', query: 'mitochondria', language: 'en', expectIntent: 'new_topic', note: '생물학 — 복수형 입력' },
    { id: 'gen-en-silk-road', kind: 'general', query: 'Silk Road', language: 'en', expectIntent: 'new_topic', note: '역사/지리' },
    { id: 'gen-en-turing-machine', kind: 'general', query: 'Turing machine', language: 'en', expectIntent: 'new_topic', note: '전산학 — 인물명 포함' },
];

/** 케이스 정의 자체의 무결성 검사. --dry-run이 이걸 돌린다. */
export function validateCases(cases: GoldenCase[] = GOLDEN_CASES): string[] {
    const problems: string[] = [];

    const seen = new Set<string>();
    for (const c of cases) {
        if (seen.has(c.id)) problems.push(`중복 id: ${c.id}`);
        seen.add(c.id);
        if (!c.query.trim()) problems.push(`빈 query: ${c.id}`);
        if (c.kind === 'followup' && !c.history?.length) problems.push(`followup인데 history 없음: ${c.id}`);
        if (c.kind === 'synonym' && !c.group) problems.push(`synonym인데 group 없음: ${c.id}`);
    }

    for (const [group, members] of groupsOf(cases)) {
        if (members.length < 2) problems.push(`동의어 그룹 '${group}'의 멤버가 ${members.length}개 — 수렴을 측정할 수 없음`);
    }

    return problems;
}

/** synonym 그룹별 케이스 묶음. */
export function groupsOf(cases: GoldenCase[] = GOLDEN_CASES): Map<string, GoldenCase[]> {
    const map = new Map<string, GoldenCase[]>();
    for (const c of cases) {
        if (c.kind !== 'synonym' || !c.group) continue;
        const list = map.get(c.group) ?? [];
        list.push(c);
        map.set(c.group, list);
    }
    return map;
}
