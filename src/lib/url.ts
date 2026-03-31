/**
 * 🛡️ Sentinel: URL Sanitization Utility
 * Centralized utility for checking if a URL is safe to render in the application.
 * Replaces legacy inline blacklist checks to prevent XSS.
 */

/**
 * Checks if a given URL string uses a safe protocol.
 * Uses the built-in URL constructor to parse the URL correctly.
 * Allowed protocols: http:, https:, mailto:, tel:
 *
 * @param url The URL string to check
 * @returns true if the URL is safe or empty, false otherwise
 */
export function isSafeUrl(url?: string): boolean {
    if (!url) return true;

    try {
        const parsedUrl = new URL(url);
        const protocol = parsedUrl.protocol.toLowerCase();

        // Allowlist of safe protocols
        const safeProtocols = ['http:', 'https:', 'mailto:', 'tel:'];

        return safeProtocols.includes(protocol);
    } catch {
        // If URL parsing fails, it might be a relative path (e.g., /about, #section)
        // Relative paths don't have a protocol and are generally safe in this context,
        // but to be extremely cautious, we check if it starts with potentially dangerous strings
        // like javascript: or data: even if it failed parsing (e.g. malformed).
        const lowerUrl = url.trim().toLowerCase();

        // Reject known dangerous protocols even if URL constructor fails
        if (
            lowerUrl.startsWith('javascript:') ||
            lowerUrl.startsWith('vbscript:') ||
            lowerUrl.startsWith('data:')
        ) {
            return false;
        }

        // Allow relative paths
        return true;
    }
}
