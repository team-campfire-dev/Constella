## 2025-02-18 - [Optimization] Wiki Engine Keyword Processing
**Learning:** Copying large `Map` objects (e.g. 20k entries) for transaction isolation is a significant performance bottleneck in Node.js, taking ~5ms per operation.
**Action:** Use a "look-aside" pattern (check local map, then fallback to global/cached map) instead of cloning the entire map when only a few local overrides are needed.

## 2025-03-02 - [Optimization] ReactMarkdown component memoization
**Learning:** `ReactMarkdown` recreates the DOM for the entire markdown content on every render if the `components` prop is not memoized or declared statically. Inline object creation for `components` (`components={{ a: ... }}`) causes the reference to change on every parent re-render, leading to expensive unmounting and remounting of all markdown elements.
**Action:** Always extract the `components` prop for `ReactMarkdown` into a `useMemo` hook (or define it outside the component if it doesn't depend on component scope). For closures that need access to changing props/state, use `useRef` to store the latest callbacks without breaking the `useMemo` dependency array for the `components` object.
