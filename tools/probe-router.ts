import 'dotenv/config';
import { routeQuery } from '@/lib/gemini';

const cases: Array<[string, string, string, any?]> = [
    ['신규 토픽 (한국어)', '양자역학', 'ko'],
    ['문장 입력 → 안내 동반 new_topic', '르네상스에 대해 설명해줘', 'ko'],
    ['거부 ① 베이스라인 실패', '이 코드 리팩터링해줘', 'ko'],
    ['거부 ② 베이스라인 실패', 'translate this to french: hello world', 'en'],
    ['후속질문', '좀 더 자세히 알려줘', 'ko', [
        { role: 'user', content: '양자역학' },
        { role: 'assistant', content: '양자역학은 원자와 아원자 입자의 거동을 다루는 물리학 분야입니다.' },
    ]],
];

(async () => {
    for (const [label, q, lang, history] of cases) {
        const t = Date.now();
        try {
            const r = await routeQuery(q, lang, history);
            console.log(`\n━━ ${label}  (${Date.now() - t}ms)`);
            console.log(`   입력          ${JSON.stringify(q)}`);
            console.log(`   intent        ${r.intent}`);
            console.log(`   topic         ${JSON.stringify(r.topic)}`);
            console.log(`   canonicalName ${JSON.stringify(r.canonicalName)}`);
            console.log(`   title         ${JSON.stringify(r.title)}`);
            console.log(`   tags          ${JSON.stringify(r.tags)}`);
            console.log(`   chatResponse  ${r.chatResponse.replace(/\n/g, '\n                 ').slice(0, 300)}`);
        } catch (e) {
            console.log(`\n━━ ${label}\n   ✖ ${e instanceof Error ? e.message : e}`);
        }
    }
})();
