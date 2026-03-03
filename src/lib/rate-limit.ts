// 🛡️ Sentinel: Simple in-memory rate limiter to prevent DoS/API abuse across endpoints
const rateLimitMaps = new Map<string, Map<string, number>>();

/**
 * Checks if a request from a user is within the rate limit.
 *
 * @param endpoint The identifier for the API endpoint (e.g., 'chat', 'wiki').
 * @param userId The unique ID of the user.
 * @param windowMs The minimum time in milliseconds required between requests.
 * @returns `true` if the request is allowed, `false` if it exceeds the rate limit.
 */
export function checkRateLimit(endpoint: string, userId: string, windowMs: number): boolean {
    if (!rateLimitMaps.has(endpoint)) {
        rateLimitMaps.set(endpoint, new Map<string, number>());
    }

    const endpointMap = rateLimitMaps.get(endpoint)!;
    const now = Date.now();
    const lastRequestTime = endpointMap.get(userId) || 0;

    if (now - lastRequestTime < windowMs) {
        return false; // Rate limit exceeded
    }

    endpointMap.set(userId, now);
    return true;
}
