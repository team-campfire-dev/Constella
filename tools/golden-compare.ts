/**
 * 골든 셋 비교기 — 베이스라인과 후보를 대조해 회귀를 판정한다.
 *
 * 사용법:
 *   npx tsx tools/golden-compare.ts golden/baseline.json golden/candidate.json
 *   npx tsx tools/golden-compare.ts a.json b.json --verbose
 *   npx tsx tools/golden-compare.ts a.json b.json --tol-intent 5 --tol-content 10
 *
 * 종료 코드: 회귀가 있으면 1, 없으면 0. PR 머지 게이트로 쓸 수 있다.
 *
 * ── 무엇이 회귀이고 무엇이 아닌가 ──────────────────────────────
 * 회귀로 친다:
 *   · intent 분류 정확도 하락        (라우터가 판단을 잘못하게 됨)
 *   · 동의어 수렴 그룹 감소          (중복 토픽이 생긴다는 뜻)
 *   · 본문 품질 통과율 하락          (문서가 부실해짐)
 *   · 호출 실패 건수 증가
 *
 * 회귀가 아니다 (설계상 의도된 변화):
 *   · follow_up·reject 케이스에서 본문이 사라짐 — 그게 재설계의 목적이다
 *   · 임계 경로 지연 감소            — 목표 그 자체
 *   · 본문 해시 변경                 — 모델은 매번 다르게 쓴다
 */

import { readFileSync } from 'node:fs';
import type { GoldenReport, Observation } from './golden-run.ts';

const RESET = '\x1b[0m', DIM = '\x1b[2m', BOLD = '\x1b[1m';
const RED = '\x1b[31m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m', CYAN = '\x1b[36m';

function arg(name: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i !== -1 ? process.argv[i + 1] : undefined;
}

const [, , basePath, candPath] = process.argv;
const verbose = process.argv.includes('--verbose');
const TOL_INTENT = Number(arg('tol-intent') ?? 5);   // 퍼센트포인트
const TOL_CONTENT = Number(arg('tol-content') ?? 10); // 퍼센트포인트

if (!basePath || !candPath) {
    console.error('사용법: npx tsx tools/golden-compare.ts <baseline.json> <candidate.json> [--verbose]');
    process.exit(1);
}

const base: GoldenReport = JSON.parse(readFileSync(basePath, 'utf8'));
const cand: GoldenReport = JSON.parse(readFileSync(candPath, 'utf8'));

const byId = (r: GoldenReport) => new Map(r.observations.map(o => [o.id, o]));
const B = byId(base), C = byId(cand);

const regressions: string[] = [];
const warnings: string[] = [];

type Dir = 'up-good' | 'down-good' | 'neutral';

/** 숫자 델타를 방향까지 포함해 문자열로. 'neutral'은 좋고 나쁨을 판단하지 않는다. */
function delta(before: number, after: number, unit = '', dir: Dir = 'up-good'): string {
    const d = Math.round((after - before) * 100) / 100;
    if (d === 0) return `${DIM}변화 없음${RESET}`;
    const color = dir === 'neutral' ? CYAN : (dir === 'up-good') === (d > 0) ? GREEN : RED;
    return `${before}${unit} → ${after}${unit}  ${color}${d > 0 ? '+' : ''}${d}${unit}${RESET}`;
}

function head(t: string) {
    console.log(`\n${BOLD}${t}${RESET}`);
    console.log(DIM + '─'.repeat(Math.max(28, t.length + 4)) + RESET);
}

// ── 메타 ────────────────────────────────────────────────────────
console.log(`${BOLD}골든 셋 비교${RESET}`);
console.log(`  기준  ${base.meta.label}  ${DIM}(${base.meta.gitRev}, ${base.meta.generatedAt.slice(0, 16).replace('T', ' ')})${RESET}`);
console.log(`  후보  ${cand.meta.label}  ${DIM}(${cand.meta.gitRev}, ${cand.meta.generatedAt.slice(0, 16).replace('T', ' ')})${RESET}`);

// ── 케이스 집합 변화 ────────────────────────────────────────────
const added = [...C.keys()].filter(id => !B.has(id));
const removed = [...B.keys()].filter(id => !C.has(id));
if (added.length || removed.length) {
    head('케이스 집합 변화');
    added.forEach(id => console.log(`  ${CYAN}신규${RESET} ${id}  ${DIM}(비교 대상 없음)${RESET}`));
    removed.forEach(id => {
        console.log(`  ${YELLOW}누락${RESET} ${id}`);
        warnings.push(`베이스라인에 있던 케이스 '${id}'가 후보에 없습니다 — --only 로 부분 실행했나요?`);
    });
}

// ── 집계 비교 ───────────────────────────────────────────────────
const a = base.aggregates, b = cand.aggregates;

head('집계');
console.log(`  호출 실패        ${delta(a.failed, b.failed, '건', 'down-good')}`);
console.log(`  intent 정확도    ${delta(a.intentAccuracy, b.intentAccuracy, '%')}`);
console.log(`  동의어 수렴      ${delta(a.convergedGroups, b.convergedGroups, `/${b.totalGroups} 그룹`)}`);
console.log(`  본문 통과율      ${delta(a.contentPassRate, b.contentPassRate, '%')}  ${DIM}(표본 ${a.contentSampleSize} → ${b.contentSampleSize})${RESET}`);
console.log(`  본문 평균 헤딩   ${delta(a.avgHeadings, b.avgHeadings)}`);
console.log(`  본문 평균 링크   ${delta(a.avgLinks, b.avgLinks)}`);
console.log(`  본문 평균 단어   ${delta(a.avgWords, b.avgWords)}`);
console.log(`  ${BOLD}임계 경로 중앙값 ${delta(a.medianCriticalPathMs, b.medianCriticalPathMs, 'ms', 'down-good')}${RESET}`);
console.log(`  임계 경로 p90    ${delta(a.p90CriticalPathMs, b.p90CriticalPathMs, 'ms', 'down-good')}`);
console.log(`  전체 소요 중앙값 ${delta(a.medianTotalMs, b.medianTotalMs, 'ms', 'neutral')}  ${DIM}(호출이 둘로 나뉘면 늘어나는 게 정상)${RESET}`);

if (b.failed > a.failed) regressions.push(`호출 실패가 ${a.failed}건에서 ${b.failed}건으로 늘었습니다.`);
if (a.intentAccuracy - b.intentAccuracy > TOL_INTENT) {
    regressions.push(`intent 정확도가 ${a.intentAccuracy}% → ${b.intentAccuracy}% 로 허용치(${TOL_INTENT}pp)를 넘어 떨어졌습니다.`);
}
if (b.convergedGroups < a.convergedGroups) {
    regressions.push(`동의어 수렴 그룹이 ${a.convergedGroups}개에서 ${b.convergedGroups}개로 줄었습니다 — 중복 토픽이 생긴다는 뜻입니다.`);
}
if (a.contentPassRate - b.contentPassRate > TOL_CONTENT) {
    regressions.push(`본문 품질 통과율이 ${a.contentPassRate}% → ${b.contentPassRate}% 로 허용치(${TOL_CONTENT}pp)를 넘어 떨어졌습니다.`);
}

// ── 동의어 그룹 상세 ────────────────────────────────────────────
head('동의어 수렴');
for (const g of new Set([...Object.keys(a.synonymConvergence), ...Object.keys(b.synonymConvergence)])) {
    const before = a.synonymConvergence[g], after = b.synonymConvergence[g];
    if (!after) continue;
    const mark = after.converged ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    const shifted = before && before.names.join('|') !== after.names.join('|');
    console.log(`  ${mark} ${g.padEnd(20)} ${after.names.join(' | ') || '(없음)'}`);
    if (shifted) console.log(`      ${DIM}이전: ${before.names.join(' | ')}${RESET}`);
    if (before?.converged && !after.converged) {
        regressions.push(`'${g}' 그룹이 수렴을 잃었습니다: ${after.names.join(' | ')}`);
    }
}

// ── 케이스별 변화 ───────────────────────────────────────────────
interface Change { id: string; lines: string[]; regressed: boolean }
const changes: Change[] = [];

for (const [id, after] of C) {
    const before = B.get(id);
    if (!before) continue;

    const lines: string[] = [];
    let regressed = false;

    if (before.ok && !after.ok) {
        lines.push(`${RED}호출 실패${RESET}: ${after.error}`);
        regressed = true;
    } else if (!before.ok && after.ok) {
        lines.push(`${GREEN}호출 복구됨${RESET}`);
    }

    if (before.intent !== after.intent) {
        const nowRight = after.intentMatch, wasRight = before.intentMatch;
        const color = nowRight ? GREEN : after.soft ? YELLOW : RED;
        lines.push(`intent ${before.intent} → ${color}${after.intent}${RESET} ${DIM}(기대 ${after.expectIntent})${RESET}`);
        if (wasRight && !nowRight && !after.soft) regressed = true;
    }

    if (before.canonicalKey !== after.canonicalKey) {
        lines.push(`canonical ${DIM}"${before.canonicalName}"${RESET} → ${CYAN}"${after.canonicalName}"${RESET}`);
    }

    // 본문 유무 변화 — follow_up/reject에서는 설계상 의도된 변화다.
    const hadContent = before.content !== null, hasContent = after.content !== null;
    if (hadContent && !hasContent) {
        const expected = after.intent === 'follow_up' || after.intent === 'reject';
        if (expected) {
            lines.push(`${DIM}본문 없어짐 — ${after.intent} 경로이므로 의도된 변화${RESET}`);
        } else {
            lines.push(`${RED}본문 없어짐${RESET} — new_topic인데 본문이 없습니다`);
            regressed = true;
        }
    }

    if (before.quality && after.quality) {
        const dw = after.quality.words - before.quality.words;
        const dh = after.quality.headings - before.quality.headings;
        const dl = after.quality.links - before.quality.links;
        if (before.quality.ok && !after.quality.ok) {
            lines.push(`${RED}품질 통과 → 미달${RESET} (${after.quality.reasons.join(', ')})`);
            regressed = true;
        } else if (!before.quality.ok && after.quality.ok) {
            lines.push(`${GREEN}품질 미달 → 통과${RESET}`);
        } else if (verbose && (dw || dh || dl)) {
            lines.push(`${DIM}품질 h${dh >= 0 ? '+' : ''}${dh} l${dl >= 0 ? '+' : ''}${dl} w${dw >= 0 ? '+' : ''}${dw}${RESET}`);
        }
    }

    const dms = after.criticalPathMs - before.criticalPathMs;
    if (verbose || Math.abs(dms) > 3000) {
        const color = dms < 0 ? GREEN : DIM;
        lines.push(`${color}임계 경로 ${before.criticalPathMs}ms → ${after.criticalPathMs}ms${RESET}`);
    }

    if (lines.length) changes.push({ id, lines, regressed });
}

head(`케이스별 변화 (${changes.length}/${C.size}건)`);
if (changes.length === 0) {
    console.log(`  ${DIM}변화 없음${RESET}`);
} else {
    for (const ch of changes.sort((x, y) => Number(y.regressed) - Number(x.regressed) || x.id.localeCompare(y.id))) {
        const mark = ch.regressed ? `${RED}✗${RESET}` : `${DIM}·${RESET}`;
        console.log(`  ${mark} ${BOLD}${ch.id}${RESET}`);
        ch.lines.forEach(l => console.log(`      ${l}`));
    }
}

// ── 판정 ────────────────────────────────────────────────────────
head('판정');
if (warnings.length) {
    warnings.forEach(w => console.log(`  ${YELLOW}주의${RESET} ${w}`));
    console.log('');
}

if (regressions.length === 0) {
    console.log(`  ${GREEN}${BOLD}회귀 없음${RESET} — 머지 가능`);
    console.log(`  ${DIM}본문 문장 자체의 변화는 자동 판정하지 않습니다. 표본 몇 건은 눈으로 읽어보세요.${RESET}`);
    process.exit(0);
} else {
    console.log(`  ${RED}${BOLD}회귀 ${regressions.length}건${RESET}`);
    regressions.forEach(r => console.log(`  ${RED}·${RESET} ${r}`));
    console.log('');
    console.log(`  ${DIM}허용치를 조정하려면 --tol-intent / --tol-content (퍼센트포인트)${RESET}`);
    process.exit(1);
}
