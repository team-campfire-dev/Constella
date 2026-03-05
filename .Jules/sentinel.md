# Sentinel's Journal

## 2025-02-12 - [Hardcoded Local Agent Credentials]
**Vulnerability:** Hardcoded credentials (`agent@test.local` / `constella-agent`) in `src/lib/auth.ts` allowed anyone with knowledge of the repository to bypass authentication as the "Local Agent".
**Learning:** Hardcoded credentials often slip into production codebases from testing/prototyping phases. Even if intended for local development, they pose a significant risk if the code is exposed.
**Prevention:** Always use environment variables for sensitive data. Implement checks to disable insecure providers if required environment variables are missing.

## 2025-02-23 - [Timing Attack in Password Comparison]
**Vulnerability:** Direct string comparison (`===`) in `src/lib/auth.ts` allowed timing attacks, potentially leaking the password length and content by measuring response times.
**Learning:** Even internal or "agent" authentication mechanisms require constant-time comparison to prevent side-channel attacks. Standard equality operators short-circuit on mismatch, leaking information.
**Prevention:** Use `crypto.timingSafeEqual` with a hashing step (e.g., SHA-256) to compare sensitive strings in constant time regardless of length.

## 2024-05-20 - [AI Chat Rate Limiting]
**Vulnerability:** The `/api/chat` endpoint, which makes expensive calls to the Gemini AI API, had no rate limiting in place. This could allow a malicious actor or bot to spam the endpoint, leading to API abuse, high costs (Denial of Wallet), or service disruption.
**Learning:** In Next.js App Router API routes, missing rate limits on resource-intensive endpoints (like AI generation or DB writes) is a common pattern that needs addressing.
**Prevention:** Implement rate limiting (e.g., using an in-memory `Map` for simple cases or Redis for distributed setups) on all endpoints that perform expensive operations or external API calls.
