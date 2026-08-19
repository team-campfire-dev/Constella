// 🛡️ Sentinel: Simple in-memory rate limiter to prevent DoS/API abuse across endpoints
const rateLimitMaps = new Map<string, Map<string, number>>();
// Track the windowMs for each endpoint to use in cleanup
const endpointWindows = new Map<string, number>();

const CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute

// 🛡️ Sentinel: Periodic cleanup to prevent memory leaks in long-running server environments
const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [endpoint, userMap] of rateLimitMaps.entries()) {
        const windowMs = endpointWindows.get(endpoint) || CLEANUP_INTERVAL_MS;
        // Keep entries for 2x the window duration to be safe, minimum 1 minute
        const expirationTime = Math.max(windowMs * 2, 60000);

        for (const [userId, lastRequestTime] of userMap.entries()) {
            // Remove entries that haven't been accessed within the expiration time
            if (now - lastRequestTime > expirationTime) {
                userMap.delete(userId);
            }
        }
        // If an endpoint has no active users, remove it to save memory
        if (userMap.size === 0) {
            rateLimitMaps.delete(endpoint);
            endpointWindows.delete(endpoint);
        }
    }
}, CLEANUP_INTERVAL_MS);

// Ensure the interval doesn't block the Node.js process from exiting
cleanupInterval.unref?.();

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
        endpointWindows.set(endpoint, windowMs);
    } else {
        // Update the tracked windowMs if it changes (take the maximum to be safe)
        const currentWindow = endpointWindows.get(endpoint) || 0;
        if (windowMs > currentWindow) {
            endpointWindows.set(endpoint, windowMs);
        }
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

// Used for testing purposes
export function _getRateLimitMapSize(endpoint: string): number {
    return rateLimitMaps.get(endpoint)?.size || 0;
}
