## 2025-02-18 - [Optimization] Wiki Engine Keyword Processing
**Learning:** Copying large `Map` objects (e.g. 20k entries) for transaction isolation is a significant performance bottleneck in Node.js, taking ~5ms per operation.
**Action:** Use a "look-aside" pattern (check local map, then fallback to global/cached map) instead of cloning the entire map when only a few local overrides are needed.
## 2025-02-19 - [Optimization] ReactMarkdown Re-rendering
**Learning:** Defining the `components` prop inline for `ReactMarkdown` causes React to recreate the component definitions on every render. This forces `react-markdown` to unmount and remount those DOM elements, which is a significant performance bottleneck, especially in chat interfaces with many messages.
**Action:** Always extract the custom `components` object outside the component or wrap it in a `useMemo` block. When callbacks are passed to these components, ensure they are also memoized using `useCallback` or use the `useRef` (latest ref) pattern to prevent stale closures while maintaining referential stability.

## 2026-03-03 - [Optimization] Chat Interface Re-rendering Prevention
**Learning:** Mapping over message lists with inline components in a chat interface causes the entire list to re-render whenever the input state changes or new messages arrive. If the list contains heavy components like `ReactMarkdown`, this results in severe UI lag and CPU spikes during typing.
**Action:** Always extract message list items into separate components wrapped in `React.memo()` to prevent expensive components from re-rendering unless their specific props change.
