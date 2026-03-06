import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { checkRateLimit } from './rate-limit';

describe('checkRateLimit', () => {
    beforeEach(() => {
        // Reset the internal rate limit maps by mocking Date.now
        vi.useFakeTimers();
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
});
