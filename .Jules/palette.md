## 2026-02-24 - [Missing Loading State on Profile Save]
**Learning:** Server Actions in Next.js provide a great backend DX but can leave users hanging without client-side feedback. `useFormStatus` is essential but often forgotten.
**Action:** Always wrap server action buttons in a component that uses `useFormStatus` to provide immediate feedback (spinner, disabled state).

## 2026-02-25 - [Trapped Mobile Users]
**Learning:** It's easy to forget to replicate desktop dropdown functionality (like Sign Out) in the simplified mobile menu, effectively trapping mobile users in a logged-in state.
**Action:** Always verify that critical session actions (Sign Out) are accessible in the mobile view, not just desktop.

## 2026-02-25 - [Broken Visual Controls]
**Learning:** Visual controls (zoom buttons, search icons) without handlers or accessibility attributes frustrate users who expect interactivity. A "Reset Zoom" function is critical for canvas-based visualizations where users can easily get lost.
**Action:** Always ensure UI controls (even placeholders) are functional and accessible (aria-label, keyboard support) before shipping. Add a "Reset View" mechanism for all interactive canvas elements.
