
import { performance } from 'perf_hooks';

// Mock data
const KEYWORD_COUNT = 10000;
const keywords = Array.from({ length: KEYWORD_COUNT }, (_, i) => `Keyword${i}`);
// Add some common words to match
keywords.push('apple', 'banana', 'space', 'program', 'optimization');
keywords.sort((a, b) => b.length - a.length);

const text = `
This is a text about space program and optimization.
It mentions apple and banana.
And a lot of other things that might match Keyword100 or Keyword5000.
We want to see how fast we can link these keywords.
Space program is cool. Optimization is key.
`;

// --- Current Implementation ---
function currentPerformAutoLink(text, keywordsToLink) {
    if (!text) return text;

    const lowerText = text.toLowerCase();
    const candidates = keywordsToLink.filter(keyword => {
        if (keyword.length < 2) return false;
        return lowerText.includes(keyword.toLowerCase());
    });

    if (candidates.length === 0) return text;

    const placeholders = [];
    let masked = text.replace(/\[\[(.*?)\]\]/g, (match) => {
        placeholders.push(match);
        return `__PH_${placeholders.length - 1}__`;
    });

    const patternParts = candidates.map(keyword => {
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const isKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(keyword);
        const boundary = isKorean ? '' : '\\b';
        return `${boundary}${escaped}${boundary}`;
    });

    if (patternParts.length > 0) {
        const combinedPattern = new RegExp(`(${patternParts.join('|')})`, 'gi');
        masked = masked.replace(combinedPattern, '[[$1]]');
    }

    return masked.replace(/__PH_(\d+)__/g, (_, index) => placeholders[parseInt(index)]);
}

// --- Optimized Implementation ---
// Pre-calculation (simulating cache generation)
const processedKeywords = keywords
    .filter(k => k.length >= 2)
    .sort((a, b) => b.length - a.length)
    .map(keyword => {
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const isKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(keyword);
        const boundary = isKorean ? '' : '\\b';
        return {
            word: keyword.toLowerCase(),
            pattern: `${boundary}${escaped}${boundary}`
        };
    });

function optimizedPerformAutoLink(text, cachedKeywords) {
    if (!text) return text;

    const lowerText = text.toLowerCase();
    // Optimization: check against pre-lowercased word
    const candidates = cachedKeywords.filter(k => lowerText.includes(k.word));

    if (candidates.length === 0) return text;

    const placeholders = [];
    let masked = text.replace(/\[\[(.*?)\]\]/g, (match) => {
        placeholders.push(match);
        return `__PH_${placeholders.length - 1}__`;
    });

    // Optimization: use pre-calculated patterns
    const patternParts = candidates.map(k => k.pattern);

    if (patternParts.length > 0) {
        const combinedPattern = new RegExp(`(${patternParts.join('|')})`, 'gi');
        masked = masked.replace(combinedPattern, '[[$1]]');
    }

    return masked.replace(/__PH_(\d+)__/g, (_, index) => placeholders[parseInt(index)]);
}

// --- Benchmark ---
console.log(`Benchmarking with ${keywords.length} keywords...`);

const ITERATIONS = 1000;

const startCurrent = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
    currentPerformAutoLink(text, keywords);
}
const endCurrent = performance.now();
console.log(`Current: ${(endCurrent - startCurrent).toFixed(2)}ms`);

const startOptimized = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
    optimizedPerformAutoLink(text, processedKeywords);
}
const endOptimized = performance.now();
console.log(`Optimized: ${(endOptimized - startOptimized).toFixed(2)}ms`);

console.log(`Speedup: ${((endCurrent - startCurrent) / (endOptimized - startOptimized)).toFixed(2)}x`);
