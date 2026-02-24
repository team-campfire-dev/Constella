## 2026-02-24 - [Missing Loading State on Profile Save]
**Learning:** Server Actions in Next.js provide a great backend DX but can leave users hanging without client-side feedback. `useFormStatus` is essential but often forgotten.
**Action:** Always wrap server action buttons in a component that uses `useFormStatus` to provide immediate feedback (spinner, disabled state).
