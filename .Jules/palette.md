## 2026-02-24 - [Missing Loading State on Profile Save]
**Learning:** Server Actions in Next.js provide a great backend DX but can leave users hanging without client-side feedback. `useFormStatus` is essential but often forgotten.
**Action:** Always wrap server action buttons in a component that uses `useFormStatus` to provide immediate feedback (spinner, disabled state).

## 2026-02-25 - [Trapped Mobile Users]
**Learning:** It's easy to forget to replicate desktop dropdown functionality (like Sign Out) in the simplified mobile menu, effectively trapping mobile users in a logged-in state.
**Action:** Always verify that critical session actions (Sign Out) are accessible in the mobile view, not just desktop.

## 2026-02-25 - [Broken Visual Controls]
**Learning:** Visual controls (zoom buttons, search icons) without handlers or accessibility attributes frustrate users who expect interactivity. A "Reset Zoom" function is critical for canvas-based visualizations where users can easily get lost.
**Action:** Always ensure UI controls (even placeholders) are functional and accessible (aria-label, keyboard support) before shipping. Add a "Reset View" mechanism for all interactive canvas elements.

## 2026-03-01 - [Hidden Context in Custom Modals]
**Learning:** Custom floating UI components (like sliding side panels or modals) often implement custom "Close" (X) buttons visually, but neglect `aria-label`, leaving screen reader users confused about the button's purpose. Additionally, `focus-visible` states are critical here because keyboard users will often tab directly to these close buttons upon panel activation.
**Action:** Always verify that purely visual "Close" buttons inside modals/panels have `aria-label`, an explicit `title` for hover tooltips, and distinct `focus-visible` styles to ensure full accessibility.

## 2026-03-03 - [Missing Aria-Expanded on Mobile Menus]
**Learning:** Screen reader users rely on `aria-expanded` to know whether a toggle button has opened a menu, and `aria-controls` to understand the relationship between the button and the menu container. These are frequently missed on responsive mobile navigation buttons.
**Action:** Always verify that mobile hamburger menus and other toggleable navigation elements include dynamic `aria-expanded` and explicit `aria-controls` attributes linking to the menu's ID.
