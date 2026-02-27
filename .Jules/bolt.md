## 2025-02-18 - [Optimization] Wiki Engine Keyword Processing
**Learning:** Copying large `Map` objects (e.g. 20k entries) for transaction isolation is a significant performance bottleneck in Node.js, taking ~5ms per operation.
**Action:** Use a "look-aside" pattern (check local map, then fallback to global/cached map) instead of cloning the entire map when only a few local overrides are needed.
