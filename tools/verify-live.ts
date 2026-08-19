/**
 * 실 DB·Neo4j에 붙여 재설계된 흐름을 검증한다.
 * 골든 셋이 못 재는 것들: 스텁 생성 타이밍, 백그라운드 본문, in-flight 락, Neo4j 노드/엣지.
 *
 *   npx tsx tools/verify-live.ts
 */
import 'dotenv/config';
import prisma from '@/lib/prisma';
import prismaContent from '@/lib/prisma-content';
import { getDriver } from '@/lib/neo4j';
import { processUserQuery, ensureArticle } from '@/lib/wiki-engine';

const LANG = 'ko';
const Q1 = '리보솜';          // 신규 토픽 (기존 27개에 없음)
const Q2 = '골지체';          // in-flight 락 테스트용

async function neo4jNode(name: string) {
    const s = getDriver().session();
    try {
        const r = await s.run(
            `MATCH (n:Topic {name:$name})
             OPTIONAL MATCH (n)-[rel:MENTIONS]->(m)
             RETURN n.topicId AS topicId, count(rel) AS edges`, { name });
        if (r.records.length === 0) return null;
        return { topicId: r.records[0].get('topicId'), edges: Number(r.records[0].get('edges')) };
    } finally { await s.close(); }
}

async function articleOf(topicId: string) {
    return prismaContent.wikiArticle.findFirst({ where: { topicId, language: LANG } });
}

const ok = (b: boolean) => b ? '✓' : '✗';

(async () => {
    const user = await prisma.user.findFirst({ where: { email: process.env.AGENT_EMAIL ?? 'agent@test.local' } });
    if (!user) { console.error('agent 유저 없음. npx tsx prisma/seed.ts'); process.exit(1); }

    // ── 1. 신규 토픽: 임계 경로 ───────────────────────────────────
    console.log(`\n[1] 신규 토픽 "${Q1}" — 임계 경로`);
    const t0 = Date.now();
    const res = await processUserQuery(user.id, Q1, LANG);
    const criticalMs = Date.now() - t0;
    console.log(`    ${ok(criticalMs < 8000)} 응답 ${criticalMs}ms  (목표 <8000)`);
    console.log(`      isNew=${res.isNew} topicId=${res.topicId}`);
    console.log(`      말풍선: ${res.answer.replace(/\n/g, ' ').slice(0, 90)}...`);

    // ── 2. 응답 직후 상태: 스텁 + 엣지 없는 노드 ──────────────────
    console.log(`\n[2] 응답 직후 상태`);
    const stub = await articleOf(res.topicId);
    console.log(`    ${ok(stub !== null)} WikiArticle 행 존재`);
    console.log(`    ${ok(!stub?.content)} 본문은 아직 비어 있음 (스텁)  content=${stub?.content ? stub.content.length + 'chars' : 'null'}`);
    console.log(`      표제: ${JSON.stringify(stub?.title)}`);
    const n0 = await neo4jNode((await prismaContent.topic.findUnique({ where: { id: res.topicId } }))!.name);
    console.log(`    ${ok(n0 !== null)} Neo4j 노드 생성됨 (별이 즉시 뜬다)`);
    console.log(`    ${ok(n0?.edges === 0)} 엣지는 아직 0개  edges=${n0?.edges}`);

    // ── 3. 백그라운드 완료 대기 ───────────────────────────────────
    console.log(`\n[3] 백그라운드 본문 생성 대기`);
    const startWait = Date.now();
    let filled = null;
    for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 1000));
        filled = await articleOf(res.topicId);
        if (filled?.content) break;
    }
    const bgMs = Date.now() - startWait;
    console.log(`    ${ok(!!filled?.content)} 본문 채워짐 (+${(bgMs / 1000).toFixed(0)}s)  ${filled?.content?.length ?? 0}chars`);
    const topicRow = await prismaContent.topic.findUnique({ where: { id: res.topicId } });
    const n1 = await neo4jNode(topicRow!.name);
    console.log(`    ${ok((n1?.edges ?? 0) > 0)} Neo4j 엣지 생성됨  edges=${n1?.edges}`);
    console.log(`      본문 첫 줄: ${filled?.content?.split('\n')[0]}`);

    // ── 4. 캐시 히트: 같은 질의 재실행 ────────────────────────────
    console.log(`\n[4] 같은 질의 재실행 — 캐시 히트`);
    const t2 = Date.now();
    const again = await processUserQuery(user.id, Q1, LANG);
    const cacheMs = Date.now() - t2;
    console.log(`    ${ok(cacheMs < 3000)} ${cacheMs}ms (모델 호출 0회여야 함)`);
    console.log(`    ${ok(again.answer.includes('ARCHIVE RETRIEVED'))} 템플릿 응답`);

    // ── 5. in-flight 락 ──────────────────────────────────────────
    console.log(`\n[5] in-flight 락 — "${Q2}" 동시 요청`);
    const r2 = await processUserQuery(user.id, Q2, LANG);
    const name2 = (await prismaContent.topic.findUnique({ where: { id: r2.topicId } }))!.name;
    const t3 = Date.now();
    const [a, b] = await Promise.all([ensureArticle(name2, LANG), ensureArticle(name2.toUpperCase(), LANG)]);
    console.log(`    ${ok(a === b)} 두 호출이 같은 본문을 받음 (${Date.now() - t3}ms)`);
    console.log(`      길이 a=${a.length} b=${b.length}`);

    // ── 6. 후속질문 — 서버 기록으로 참조 해결 ─────────────────────
    console.log(`\n[6] 후속질문 — ChatHistory.topicId로 참조 해결`);
    await prismaContent.chatHistory.create({
        data: { userId: user.id, role: 'assistant', content: '리보솜은 단백질을 합성합니다.', topicId: res.topicId },
    });
    const fu = await processUserQuery(user.id, '좀 더 자세히 알려줘', LANG, [
        { role: 'user', content: Q1 },
        { role: 'assistant', content: '리보솜은 단백질을 합성합니다.' },
    ]);
    console.log(`    ${ok(fu.topicId === res.topicId)} 직전 토픽으로 해결됨  ${fu.topicId} (기대 ${res.topicId})`);
    console.log(`    ${ok(!fu.isNew)} isNew=false`);

    // ── 7. 거부 ──────────────────────────────────────────────────
    console.log(`\n[7] 거부 — 토픽을 만들지 않는다`);
    const before = await prismaContent.topic.count();
    const rej = await processUserQuery(user.id, '이 코드 리팩터링해줘', LANG);
    const after = await prismaContent.topic.count();
    console.log(`    ${ok(rej.topicId === '')} topicId 비어 있음`);
    console.log(`    ${ok(before === after)} 토픽 수 불변  ${before} → ${after}`);

    await prismaContent.$disconnect();
    await prisma.$disconnect();
    await getDriver().close();
    console.log('\n완료');
    process.exit(0);
})().catch(e => { console.error('실패:', e); process.exit(1); });
