## 2024-05-04 - [Missing Rate Limit on SSE Stream]
**Vulnerability:** The SSE stream endpoint for real-time COMMS (`GET /api/comms/stream`) was missing a rate limit check, allowing potential attackers to exhaust server resources through excessive stream connection requests.
**Learning:** Even long-lived connections (like SSE) are initiated via standard HTTP GET requests and require the same rate limiting as other API endpoints to prevent DoS at the connection layer.
**Prevention:** Ensure all public-facing endpoints, including real-time stream handlers, invoke `checkRateLimit` during the initial connection handshake.
