// Simple in-memory rate limiter to prevent DoS/DoW attacks
interface RateLimitInfo {
  count: number;
  lastReset: number;
}

const rateLimitStore = new Map<string, RateLimitInfo>();

/**
 * Checks if the request should be rate-limited.
 * @param key The unique key for the client (e.g., userId).
 * @param limit The maximum number of requests allowed in the window.
 * @param windowMs The time window in milliseconds.
 * @returns true if allowed, false if rate limited.
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const info = rateLimitStore.get(key);

  if (!info || now - info.lastReset > windowMs) {
    rateLimitStore.set(key, { count: 1, lastReset: now });
    return true; // Allowed
  }

  if (info.count >= limit) {
    return false; // Rate limited
  }

  info.count += 1;
  return true; // Allowed
}
