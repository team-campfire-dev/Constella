# Sentinel's Journal

## 2025-02-12 - [Hardcoded Local Agent Credentials]
**Vulnerability:** Hardcoded credentials (`agent@test.local` / `constella-agent`) in `src/lib/auth.ts` allowed anyone with knowledge of the repository to bypass authentication as the "Local Agent".
**Learning:** Hardcoded credentials often slip into production codebases from testing/prototyping phases. Even if intended for local development, they pose a significant risk if the code is exposed.
**Prevention:** Always use environment variables for sensitive data. Implement checks to disable insecure providers if required environment variables are missing.

## 2025-02-23 - [Timing Attack in Password Comparison]
**Vulnerability:** Direct string comparison (`===`) in `src/lib/auth.ts` allowed timing attacks, potentially leaking the password length and content by measuring response times.
**Learning:** Even internal or "agent" authentication mechanisms require constant-time comparison to prevent side-channel attacks. Standard equality operators short-circuit on mismatch, leaking information.
**Prevention:** Use `crypto.timingSafeEqual` with a hashing step (e.g., SHA-256) to compare sensitive strings in constant time regardless of length.
## 2025-03-01 - Missing Rate Limiting on AI Endpoints
**Vulnerability:** The `/api/chat` and `/api/wiki` endpoints, which invoke the resource-intensive Gemini AI model, lacked rate limiting.
**Learning:** This exposed the application to Denial of Wallet (DoW) and Denial of Service (DoS) attacks, as a malicious user could spam the endpoints to inflate billing costs and consume server resources.
**Prevention:** Always implement rate limiting on API endpoints that consume external APIs or perform expensive operations. In this instance, a lightweight, in-memory rate limiter using a `Map` tracking `userId` and timestamp windows was added.
