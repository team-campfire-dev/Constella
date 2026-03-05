
import { performance } from 'perf_hooks';

const ITEM_COUNT = 10000;
const cachedNameMap = new Map();
for (let i = 0; i < ITEM_COUNT; i++) {
    cachedNameMap.set(`key${i}`, `value${i}`);
    cachedNameMap.set(`stripped${i}`, `value${i}`);
}

console.log(`Map size: ${cachedNameMap.size}`);

// --- Current: Copy Map ---
function testCopyMap() {
    const currentNameMap = new Map(cachedNameMap);
    // Add a few new items
    currentNameMap.set('newKey', 'newValue');
    currentNameMap.set('anotherKey', 'anotherValue');

    // Resolve
    return currentNameMap.get('key5000');
}

// --- Optimized: Look-aside ---
function testLookAside() {
    const localNameMap = new Map();
    // Add a few new items
    localNameMap.set('newKey', 'newValue');
    localNameMap.set('anotherKey', 'anotherValue');

    // Resolve helper
    const resolve = (key) => {
        return localNameMap.get(key) || cachedNameMap.get(key);
    };

    return resolve('key5000');
}

const ITERATIONS = 1000;

console.log(`Benchmarking Map Copy vs Look-aside with ${ITERATIONS} iterations...`);

const startCopy = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
    testCopyMap();
}
const endCopy = performance.now();
console.log(`Copy Map: ${(endCopy - startCopy).toFixed(2)}ms`);

const startLookAside = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
    testLookAside();
}
const endLookAside = performance.now();
console.log(`Look-aside: ${(endLookAside - startLookAside).toFixed(2)}ms`);

console.log(`Speedup: ${((endCopy - startCopy) / (endLookAside - startLookAside)).toFixed(2)}x`);
