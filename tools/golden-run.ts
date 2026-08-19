/**
 * 골든 셋 실행기 — 30개 고정 입력을 모델에 통과시켜 관측치를 JSON으로 남긴다.
 *
 * 사용법:
 *   npx tsx tools/golden-run.ts --out golden/baseline.json --label "main 재설계 전"
 *   npx tsx tools/golden-run.ts --out golden/candidate.json --label "PR2 라우터 분해"
 *   npx tsx tools/golden-run.ts --dry-run                      # API 호출 없이 셋업만 검증
 *   npx tsx tools/golden-run.ts --only synonym,reject --out golden/quick.json
 *
 * DB를 건드리지 않는다. processUserQuery가 아니라 모델 호출 계층을 직접 부르므로
 * SSH 터널도, 시드 유저도 필요 없다. 측정 대상은 파이프라인이 아니라 모델 산출물이다.
 */

import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { routeQuery, generateArticleBody, evaluateWikiContent } from '@/lib/gemini';
import { GOLDEN_CASES, groupsOf, validateCases, type GoldenCase, type Intent } from './golden-cases.ts';

// ════════════════════════════════════════════════════════════════
// ADAPTER — 구현이 바뀌어도 여기 하나만 고치면 기존 베이스라인과 계속 비교된다.
//
// 재설계 전에는 generateWikiContent 한 번이 분류·이름·본문·대화답변을 전부 만들었고
// intent는 반환값에서 역산해야 했다. 지금은 routeQuery가 intent를 직접 주고 본문은
// generateArticleBody가 따로 만든다 — 그래서 criticalPathMs와 totalMs가 갈라진다.
//
// wiki-engine이 아니라 모델 호출 계층을 직접 부르므로 DB를 건드리지 않는다.
// ════════════════════════════════════════════════════════════════

interface Probe {
    intent: Intent;
    canonicalName: string;
    topic: string;
    title: string;
    tags: string[];
    chatResponse: string;
    /** 위키 본문. 재설계 후 follow_up·reject 경로에서는 null이 되는 것이 정상이다. */
    content: string | null;
    /** 사용자가 실제로 기다리는 구간. 재설계 후에는 라우터 호출만 여기 해당한다. */
    criticalPathMs: number;
    /** 본문 생성까지 포함한 전체 소요. 비용·엣지 생성 지연의 지표. */
    totalMs: number;
}

async function probe(c: GoldenCase): Promise<Probe> {
    const t0 = Date.now();
    const routed = await routeQuery(c.query, c.language, c.history);
    const criticalPathMs = Date.now() - t0;

    // 본문은 new_topic일 때만 만든다. follow_up·reject에서 본문이 null이 되는 것은
    // 회귀가 아니라 이 재설계의 목적이며, 비교기가 그렇게 분류한다.
    let content: string | null = null;
    if (routed.intent === 'new_topic' && routed.canonicalName) {
        content = await generateArticleBody({
            canonicalName: routed.canonicalName,
            title: routed.title,
            tags: routed.tags,
            language: c.language,
        });
    }

    return {
        intent: routed.intent,
        canonicalName: routed.canonicalName,
        topic: routed.topic,
        title: routed.title,
        tags: routed.tags,
        chatResponse: routed.chatResponse,
        content,
        criticalPathMs,
        totalMs: Date.now() - t0,
    };
}

// ════════════════════════════════════════════════════════════════
// 관측치
// ════════════════════════════════════════════════════════════════

export interface Observation {
    id: string;
    kind: GoldenCase['kind'];
    query: string;
    language: string;
    expectIntent: Intent;
    soft: boolean;

    ok: boolean;
    error: string | null;

    criticalPathMs: number;
    totalMs: number;

    intent: Intent | null;
    intentMatch: boolean;
    canonicalName: string;
    /** 그룹 수렴 판정용 정규화 키. */
    canonicalKey: string;
    topic: string;
    title: string;
    tags: string[];

    chatResponse: string;
    chatChars: number;
    chatLinks: number;

    /** 본문이 없는 것이 정상인 경로(follow_up/reject)에서는 null. */
    content: string | null;
    contentChars: number;
    contentHash: string | null;
    quality: { ok: boolean; headings: number; links: number; words: number; reasons: string[]; score?: number } | null;
}

export interface Aggregates {
    total: number;
    succeeded: number;
    failed: number;

    /** soft 케이스를 제외한 intent 분류 정확도. */
    intentAccuracy: number;
    intentAccuracyByKind: Record<string, { hit: number; of: number }>;

    /** 그룹별 canonicalName 유일값 개수. 1이면 수렴. */
    synonymConvergence: Record<string, { distinct: number; names: string[]; converged: boolean }>;
    convergedGroups: number;
    totalGroups: number;

    /** 본문 품질은 synonym + general 케이스에서만 집계한다.
     *  follow_up/reject는 재설계 후 본문을 만들지 않는 것이 정상이므로 분포를 오염시킨다. */
    contentSampleSize: number;
    contentPassRate: number;
    avgHeadings: number;
    avgLinks: number;
    avgWords: number;

    medianCriticalPathMs: number;
    p90CriticalPathMs: number;
    medianTotalMs: number;
}

export interface GoldenReport {
    meta: {
        label: string;
        generatedAt: string;
        gitRev: string;
        model: string;
        caseCount: number;
        concurrency: number;
        adapterNote: string;
    };
    aggregates: Aggregates;
    observations: Observation[];
}

// ════════════════════════════════════════════════════════════════
// 실행
// ════════════════════════════════════════════════════════════════

const LINK_RE = /\[\[[^\]]+\]\]/g;

function normalizeName(s: string): string {
    return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function shortHash(s: string): string {
    return createHash('sha1').update(s).digest('hex').slice(0, 12);
}

function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const i = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
    return sorted[i];
}

function mean(xs: number[]): number {
    return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : 0;
}

async function observe(c: GoldenCase): Promise<Observation> {
    const base = {
        id: c.id, kind: c.kind, query: c.query, language: c.language,
        expectIntent: c.expectIntent, soft: c.soft === true,
    };

    try {
        const p = await probe(c);
        const quality = p.content ? evaluateWikiContent(p.content, c.language) : null;

        return {
            ...base,
            ok: true,
            error: null,
            criticalPathMs: p.criticalPathMs,
            totalMs: p.totalMs,
            intent: p.intent,
            intentMatch: p.intent === c.expectIntent,
            canonicalName: p.canonicalName,
            canonicalKey: normalizeName(p.canonicalName),
            topic: p.topic,
            title: p.title,
            tags: p.tags,
            chatResponse: p.chatResponse,
            chatChars: p.chatResponse.length,
            chatLinks: (p.chatResponse.match(LINK_RE) ?? []).length,
            content: p.content,
            contentChars: p.content?.length ?? 0,
            contentHash: p.content ? shortHash(p.content) : null,
            quality,
        };
    } catch (e) {
        return {
            ...base,
            ok: false,
            error: e instanceof Error ? e.message : String(e),
            criticalPathMs: 0, totalMs: 0,
            intent: null, intentMatch: false,
            canonicalName: '', canonicalKey: '', topic: '', title: '', tags: [],
            chatResponse: '', chatChars: 0, chatLinks: 0,
            content: null, contentChars: 0, contentHash: null, quality: null,
        };
    }
}

function aggregate(obs: Observation[], cases: GoldenCase[]): Aggregates {
    const done = obs.filter(o => o.ok);

    // soft는 실행 결과가 아니라 케이스 정의의 속성이다. 저장된 관측치가 아니라
    // 현재 정의를 기준으로 판정해야 --recompute가 정의 변경을 반영한다.
    const softIds = new Set(cases.filter(c => c.soft).map(c => c.id));
    const isSoft = (o: Observation) => softIds.has(o.id);

    const hard = done.filter(o => !isSoft(o));
    const intentHits = hard.filter(o => o.intentMatch).length;

    const byKind: Record<string, { hit: number; of: number }> = {};
    for (const o of hard) {
        byKind[o.kind] ??= { hit: 0, of: 0 };
        byKind[o.kind].of += 1;
        if (o.intentMatch) byKind[o.kind].hit += 1;
    }

    const synonymConvergence: Aggregates['synonymConvergence'] = {};
    for (const [group, members] of groupsOf(cases)) {
        // soft 멤버는 수렴 판정에서 뺀다. 별도 토픽으로 갈라지는 것이 합리적인
        // 인접 개념까지 넣으면 그룹이 영구히 '비수렴'으로 굳어 지표가 죽는다.
        // (해당 케이스의 canonicalName 변화는 케이스별 비교에서 계속 추적된다.)
        const names = members
            .filter(m => !softIds.has(m.id))
            .map(m => done.find(o => o.id === m.id)?.canonicalKey)
            .filter((n): n is string => !!n);
        const distinct = Array.from(new Set(names));
        synonymConvergence[group] = {
            distinct: distinct.length,
            names: distinct,
            converged: distinct.length === 1,
        };
    }
    const groupStats = Object.values(synonymConvergence);

    // 본문 품질은 본문이 있는 것이 정상인 부류에서만 집계.
    const contentSample = done.filter(o => (o.kind === 'synonym' || o.kind === 'general') && o.quality);
    const q = contentSample.map(o => o.quality!);

    const crit = done.map(o => o.criticalPathMs).sort((a, b) => a - b);
    const tot = done.map(o => o.totalMs).sort((a, b) => a - b);

    return {
        total: obs.length,
        succeeded: done.length,
        failed: obs.length - done.length,

        intentAccuracy: hard.length ? Math.round((intentHits / hard.length) * 1000) / 10 : 0,
        intentAccuracyByKind: byKind,

        synonymConvergence,
        convergedGroups: groupStats.filter(g => g.converged).length,
        totalGroups: groupStats.length,

        contentSampleSize: contentSample.length,
        contentPassRate: q.length ? Math.round((q.filter(x => x.ok).length / q.length) * 1000) / 10 : 0,
        avgHeadings: mean(q.map(x => x.headings)),
        avgLinks: mean(q.map(x => x.links)),
        avgWords: mean(q.map(x => x.words)),

        medianCriticalPathMs: percentile(crit, 0.5),
        p90CriticalPathMs: percentile(crit, 0.9),
        medianTotalMs: percentile(tot, 0.5),
    };
}

/** 동시 실행 풀. 순서는 보존한다. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
    const results = new Array<R>(items.length);
    let cursor = 0;

    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        for (;;) {
            const i = cursor++;
            if (i >= items.length) return;
            results[i] = await fn(items[i], i);
        }
    });

    await Promise.all(workers);
    return results;
}

function arg(name: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i !== -1 ? process.argv[i + 1] : undefined;
}

function flag(name: string): boolean {
    return process.argv.includes(`--${name}`);
}

function gitRev(): string {
    try {
        return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
    } catch {
        return 'unknown';
    }
}

async function main() {
    const problems = validateCases();
    if (problems.length) {
        console.error('❌ 케이스 정의에 문제가 있습니다:');
        problems.forEach(p => console.error(`   - ${p}`));
        process.exit(1);
    }

    const only = arg('only')?.split(',').map(s => s.trim()).filter(Boolean);
    const cases = only?.length
        ? GOLDEN_CASES.filter(c => only.includes(c.kind) || only.includes(c.id))
        : GOLDEN_CASES;

    if (cases.length === 0) {
        console.error(`❌ --only ${only?.join(',')} 에 해당하는 케이스가 없습니다.`);
        process.exit(1);
    }

    const concurrency = Number(arg('concurrency') ?? 3);
    const label = arg('label') ?? `${gitRev()} 실행`;
    const out = arg('out');

    const counts = cases.reduce<Record<string, number>>((acc, c) => {
        acc[c.kind] = (acc[c.kind] ?? 0) + 1;
        return acc;
    }, {});

    console.log('골든 셋 실행 계획');
    console.log(`  케이스   ${cases.length}건 — ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
    console.log(`  동시성   ${concurrency}`);
    console.log(`  라벨     ${label}`);
    console.log(`  git      ${gitRev()}`);
    console.log(`  출력     ${out ?? '(미지정)'}`);
    console.log('');

    // 집계 로직만 바뀌었을 때, 저장된 관측치로 aggregates를 다시 계산한다. API 재호출 없음.
    const recompute = arg('recompute');
    if (recompute) {
        const prev: GoldenReport = JSON.parse(readFileSync(recompute, 'utf8'));
        prev.aggregates = aggregate(prev.observations, GOLDEN_CASES);
        writeFileSync(recompute, JSON.stringify(prev, null, 2) + '\n');
        console.log(`집계 재계산 완료: ${recompute}`);
        console.log(`  동의어 수렴   ${prev.aggregates.convergedGroups}/${prev.aggregates.totalGroups} 그룹`);
        for (const [g, s] of Object.entries(prev.aggregates.synonymConvergence)) {
            console.log(`    ${s.converged ? '✓' : '✗'} ${g.padEnd(20)} ${s.names.join(' | ')}`);
        }
        console.log(`  본문 통과율   ${prev.aggregates.contentPassRate}% (표본 ${prev.aggregates.contentSampleSize}건)`);
        return;
    }

    if (flag('dry-run')) {
        console.log('--dry-run: 케이스 정의 검증만 수행했습니다. API 호출 없음.');
        for (const c of cases) {
            console.log(`  ${c.id.padEnd(24)} ${c.kind.padEnd(9)} ${c.language}  ${JSON.stringify(c.query)}`);
        }
        return;
    }

    if (!out) {
        console.error('❌ --out <경로> 가 필요합니다. (--dry-run 이 아니라면)');
        process.exit(1);
    }
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
        console.error('❌ GOOGLE_GENERATIVE_AI_API_KEY 가 없습니다. .env 를 확인하세요.');
        process.exit(1);
    }

    mkdirSync(dirname(out), { recursive: true });

    const observations: Observation[] = [];
    let finished = 0;

    const write = () => {
        const report: GoldenReport = {
            meta: {
                label,
                generatedAt: new Date().toISOString(),
                gitRev: gitRev(),
                model: process.env.GEMINI_MODEL ?? 'gemini-3-flash-preview (코드에 하드코딩)',
                caseCount: cases.length,
                concurrency,
                adapterNote: 'probe() 어댑터를 통해 수집. 재설계 후에는 그 함수만 교체할 것.',
            },
            aggregates: aggregate(observations, cases),
            observations: observations.slice().sort((a, b) => a.id.localeCompare(b.id)),
        };
        writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
        return report;
    };

    await pool(cases, concurrency, async (c) => {
        const o = await observe(c);
        observations.push(o);
        finished += 1;

        const mark = !o.ok ? '✖' : o.intentMatch ? '✓' : o.soft ? '~' : '✗';
        const detail = o.ok
            ? `${String(o.intent).padEnd(10)} ${o.canonicalName.slice(0, 28).padEnd(28)} ${o.quality ? `h${o.quality.headings} l${o.quality.links} w${o.quality.words}` : '(본문 없음)'}`
            : o.error?.slice(0, 60);
        console.log(`  ${mark} [${String(finished).padStart(2)}/${cases.length}] ${o.id.padEnd(24)} ${String(o.criticalPathMs).padStart(6)}ms  ${detail}`);

        write(); // 중간 결과를 매번 저장 — 도중에 끊겨도 여기까지는 남는다
        return o;
    });

    const report = write();
    const a = report.aggregates;

    console.log('');
    console.log('요약');
    console.log(`  성공/실패        ${a.succeeded} / ${a.failed}`);
    console.log(`  intent 정확도    ${a.intentAccuracy}%  (soft 제외)` );
    for (const [kind, s] of Object.entries(a.intentAccuracyByKind)) {
        console.log(`    ${kind.padEnd(9)} ${s.hit}/${s.of}`);
    }
    console.log(`  동의어 수렴      ${a.convergedGroups}/${a.totalGroups} 그룹`);
    for (const [g, s] of Object.entries(a.synonymConvergence)) {
        console.log(`    ${s.converged ? '✓' : '✗'} ${g.padEnd(20)} ${s.names.join(' | ')}`);
    }
    console.log(`  본문 통과율      ${a.contentPassRate}%  (표본 ${a.contentSampleSize}건)`);
    console.log(`  본문 평균        헤딩 ${a.avgHeadings} · 링크 ${a.avgLinks} · 단어 ${a.avgWords}`);
    console.log(`  임계 경로 지연   중앙값 ${a.medianCriticalPathMs}ms · p90 ${a.p90CriticalPathMs}ms`);
    console.log('');
    console.log(`저장됨: ${out}`);

    if (a.failed > 0) {
        console.log('');
        console.log(`⚠️  ${a.failed}건이 호출 자체에 실패했습니다. 베이스라인으로 쓰기 전에 원인을 확인하세요.`);
        process.exit(2);
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
