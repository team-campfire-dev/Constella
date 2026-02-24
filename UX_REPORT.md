# User Experience (UX) Report

This report summarizes the current User Experience (UX) of the `constella` application based on an analysis of the codebase.

## 1. Visual Design & Theme

### Theme Inconsistency
- **Global Settings:** The root layout (`src/app/[locale]/layout.tsx`) sets a light theme background (`bg-gray-50`) and text color (`text-gray-900` implied).
- **Dashboard Layout:** The dashboard layout (`src/components/DashboardLayout.tsx`) enforces a deep dark theme (`bg-[#0B0C15]`, `text-white`) for authenticated users.
- **Navbar:** The global navbar (`src/components/NavbarClient.tsx`) is designed for a dark theme (`bg-[#0B0C15]/80` on scroll, `text-white`), which may clash visually on light-themed pages (e.g., Login or landing pages if they don't override the background).

### Typography
- The application uses the **Geist** font family (Sans and Mono), providing a modern, clean, and legible typeface suitable for technical interfaces.

### Iconography
- Consistent use of **Lucide React** icons (Globe, FileText, Terminal) and **Heroicons** (Bars3, XMark) ensures a coherent visual language.

## 2. Navigation & Information Architecture

### Structure
The application employs a dual navigation structure:
1.  **Global Top Navbar:** Always visible, handles authentication status (Sign In/Out, Profile).
2.  **Dashboard Sidebar:** Visible only on desktop (`md` breakpoint and up), provides access to core application features:
    -   **Ship Log** (`/ship-log`)
    -   **Star Map** (`/`)
    -   **Comms Console** (`/console`)

### Critical Mobile Navigation Issue ⚠️
-   The **Dashboard Sidebar is hidden on mobile devices** (`hidden md:block`).
-   The **Global Navbar**'s mobile menu (`NavbarClient.tsx`) only provides links to "Home", "Profile", and "Sign In".
-   **Result:** Mobile users **cannot access** the "Ship Log" or "Comms Console" pages, rendering major parts of the application unusable on small screens.

## 3. Interactivity & Feedback

### Authentication
-   Protected routes (like the dashboard) correctly redirect unauthenticated users to the login page via `next-auth` middleware or server-side checks.
-   The UI reflects authentication state clearly (Sign In button vs. User Dropdown).

### Interactive Elements
-   **Star Map:** The `StarMapWrapper` component (using `react-force-graph-2d`) suggests a high degree of interactivity for data visualization.
-   **Active States:** Navigation links in the sidebar use clear active states (Cyan accent color `#38BDF8` and left border) to indicate the current page.
-   **Hover Effects:** Buttons and links have consistent hover states (e.g., `hover:bg-white/10`).

### Performance Perception
-   **Client-Side Navigation:** Uses `next-intl`'s `Link` component for smooth client-side transitions without full page reloads.
-   **Feedback:** Interactive elements provide immediate visual feedback (hover, focus states).

## 4. Recommendations

1.  **Fix Mobile Navigation:** Update `NavbarClient.tsx` to include the dashboard links (Ship Log, Console) in the mobile menu when the user is authenticated.
2.  **Harmonize Theme:** Decide on a primary theme strategy. If the dashboard is dark, ensure the landing/login pages either match this aesthetic or transition smoothly.
3.  **Accessibility Check:** Verify color contrast ratios for the custom dark colors (`#1C1E2D` background with gray text) to ensure readability for visually impaired users.
