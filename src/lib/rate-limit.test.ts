import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

describe('checkRateLimit', () => {
    let checkRateLimit: typeof import('./rate-limit').checkRateLimit;
    let _getRateLimitMapSize: typeof import('./rate-limit')._getRateLimitMapSize;

    beforeEach(async () => {
        vi.useFakeTimers();
        vi.resetModules();
        const mod = await import('./rate-limit');
        checkRateLimit = mod.checkRateLimit;
        _getRateLimitMapSize = mod._getRateLimitMapSize;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('첫 요청은 항상 허용', () => {
        expect(checkRateLimit('test-endpoint', 'user-1', 5000)).toBe(true);
    });

    it('윈도우 내 중복 요청은 차단', () => {
        expect(checkRateLimit('test-endpoint-2', 'user-1', 5000)).toBe(true);
        expect(checkRateLimit('test-endpoint-2', 'user-1', 5000)).toBe(false);
    });

    it('윈도우 경과 후 재요청 허용', () => {
        expect(checkRateLimit('test-endpoint-3', 'user-1', 5000)).toBe(true);
        expect(checkRateLimit('test-endpoint-3', 'user-1', 5000)).toBe(false);

        // 윈도우 시간 경과
        vi.advanceTimersByTime(5001);

        expect(checkRateLimit('test-endpoint-3', 'user-1', 5000)).toBe(true);
    });

    it('다른 사용자는 독립적으로 제한', () => {
        expect(checkRateLimit('test-endpoint-4', 'user-a', 5000)).toBe(true);
        expect(checkRateLimit('test-endpoint-4', 'user-b', 5000)).toBe(true);
        // user-a는 아직 윈도우 내이므로 차단
        expect(checkRateLimit('test-endpoint-4', 'user-a', 5000)).toBe(false);
        // user-b도 윈도우 내이므로 차단
        expect(checkRateLimit('test-endpoint-4', 'user-b', 5000)).toBe(false);
    });

    it('다른 엔드포인트는 독립적으로 제한', () => {
        expect(checkRateLimit('endpoint-x', 'user-1', 5000)).toBe(true);
        expect(checkRateLimit('endpoint-y', 'user-1', 5000)).toBe(true);
        // 같은 엔드포인트로 재요청하면 차단
        expect(checkRateLimit('endpoint-x', 'user-1', 5000)).toBe(false);
    });

    it('윈도우 크기가 0이면 항상 허용', () => {
        expect(checkRateLimit('test-zero', 'user-1', 0)).toBe(true);
        expect(checkRateLimit('test-zero', 'user-1', 0)).toBe(true);
    });

    it('주기적 클린업으로 오래된 항목 제거 (메모리 누수 방지)', () => {
        // T=0
        expect(checkRateLimit('test-cleanup', 'user-old', 5000)).toBe(true);
        expect(checkRateLimit('test-cleanup', 'user-new', 5000)).toBe(true);

        expect(_getRateLimitMapSize('test-cleanup')).toBe(2);

        // Advance to T=30000
        vi.advanceTimersByTime(30000);

        // Update 'user-new'
        expect(checkRateLimit('test-cleanup', 'user-new', 5000)).toBe(true);

        // Both still present
        expect(_getRateLimitMapSize('test-cleanup')).toBe(2);

        // Advance to T=60000. The interval (every 60000ms) will trigger.
        // At T=60000, user-old has age 60000, user-new has age 30000.
        // The expiration for a 5000ms window is Math.max(5000*2, 60000) = 60000ms.
        // Since age > expiration (60000 > 60000 is false), neither is deleted yet.
        vi.advanceTimersByTime(30000);
        expect(_getRateLimitMapSize('test-cleanup')).toBe(2);

        // Advance to T=90000.
        vi.advanceTimersByTime(30000);
        // The interval hasn't run again yet (next is at 120000). So size is still 2.

        // Advance to T=120000. The interval triggers again.
        // At T=120000, user-old has age 120000 (> 60000). user-new has age 90000 (> 60000).
        // BOTH will be deleted.
        vi.advanceTimersByTime(30000);
        expect(_getRateLimitMapSize('test-cleanup')).toBe(0);
    });
});
