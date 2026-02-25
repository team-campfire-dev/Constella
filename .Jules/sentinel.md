# Sentinel's Journal

## 2025-02-12 - [Hardcoded Local Agent Credentials]
**Vulnerability:** Hardcoded credentials (`agent@test.local` / `constella-agent`) in `src/lib/auth.ts` allowed anyone with knowledge of the repository to bypass authentication as the "Local Agent".
**Learning:** Hardcoded credentials often slip into production codebases from testing/prototyping phases. Even if intended for local development, they pose a significant risk if the code is exposed.
**Prevention:** Always use environment variables for sensitive data. Implement checks to disable insecure providers if required environment variables are missing.
