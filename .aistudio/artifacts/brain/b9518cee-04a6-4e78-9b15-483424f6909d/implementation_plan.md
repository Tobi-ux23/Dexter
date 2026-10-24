# Desktop View Suggestion Banner for Templates Page

A lightweight, non-intrusive suggestion banner for smartphone visitors on the Templates & Showcase page, encouraging them to view the interactive architectures on a desktop display for the full multi-device and code preview experience.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> **Summary of Confirmed Design & Functional Choices**:
> - **Banner Placement**: Clean, dismissible top banner integrated into the Templates page layout directly beneath the navigation header.
> - **Target Devices**: Active exclusively on smartphone viewports (`< 768px`). Completely hidden on tablets, laptops, and desktop screens.
> - **Dismissal Memory**: Utilizes `sessionStorage` (`dexter_dismiss_desktop_suggestion`) so once dismissed, it remains closed throughout the visitor's browsing session without recurring or annoying the user.

---

### 1. Overview & Core Concept

- **What It Does**: When a visitor accesses the Templates & Showcase page (`#templates`) on a mobile phone (screen width `< 768px`), a polished, dismissible banner appears at the top of the content area. It informs the visitor that our production templates and interactive device previews are best explored on a desktop screen.
- **Target Audience**: Mobile visitors, founders, and prospective clients browsing the Dexter agency portfolio on smartphones who might miss the full depth of the interactive multi-frame viewport simulations.
- **Key Value**: Sets clear user expectations while preserving a seamless, frictionless mobile browsing experience with zero obstructive popups or full-screen takeovers.

---

### 2. User Experience & Visual Design

#### Key User Flows
1. **Entry & Detection**:
   - Visitor navigates to `#templates` from the home page or via direct link.
   - Client script checks `window.innerWidth < 768` and verifies `sessionStorage.getItem('dexter_templates_desktop_hint_dismissed')`.
   - If unvisited and on mobile, the banner renders with a subtle slide-down and fade-in reveal.
2. **Reading & Perception**:
   - The banner features a sleek desktop monitor icon (`desktop_windows`), a clear single-line heading, and a brief explanatory subtext:
     - *Heading*: `Desktop Recommended`
     - *Message*: `For the full multi-device simulation and source code views, open on a desktop browser.`
3. **Dismissal**:
   - Visitor taps the `✕` close button or an inline `Got it` affordance.
   - The banner animates closed (height and opacity smoothly transition to zero within 180ms).
   - The dismissal state is recorded in `sessionStorage`.

#### Visual Identity & Theme
- **Surface**: Dark glassmorphic background matching Dexter's luxury aesthetic (`rgba(15, 23, 42, 0.85)` with `backdrop-filter: blur(12px)` and hairline border `1px solid rgba(255, 255, 255, 0.08)`).
- **Accent**: Soft ambient cobalt glow (`rgba(37, 99, 235, 0.12)`) and crisp cyan/blue desktop icon.
- **Typography**: Clean, single-line typography pairing `Plus Jakarta Sans` with high contrast (`#f8fafc` text, `#94a3b8` muted copy).
- **15% Mobile Sticky Cap Compliance**: Adheres strictly to the frontend design guidelines—the banner is compact (under 48px height) and sits within the natural flow above the hero rather than locking as an oversized fixed overlay.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Natural Document Flow vs. Fixed Screen Lock**
  - *Chosen Approach*: Embed the banner at the top of `.templates-container` immediately above `.templates-hero`.
  - *Why*: Fixed top banners on mobile screens consume valuable vertical viewport space and risk obscuring template filters. Placing it at the top of the container allows natural scrolling while remaining immediately visible on page load.
  - *Alternatives Considered*: Pinned fixed overlay (rejected due to mobile viewport height constraints).

- **Decision 2: Session Storage (`sessionStorage`) vs. Persistent Storage (`localStorage`)**
  - *Chosen Approach*: `sessionStorage` (`dexter_templates_desktop_hint_dismissed`).
  - *Why*: It respects the user's immediate session without permanently suppressing the helpful reminder if they return weeks later on a new mobile visit.

- **Decision 3: Pure CSS Media Queries + JavaScript Guard**
  - *Chosen Approach*: The container is styled with `@media (min-width: 768px) { display: none !important; }` in CSS, backed by a JavaScript initialization check before rendering.
  - *Why*: Guarantees zero layout shift or accidental flashing on desktop and tablet viewports, even during rapid resizing or initial asset load.

---

### 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                      Templates View                         │
│                  (<div id="templates-view">)                │
└──────────────────────────────┬──────────────────────────────┘
                               │
                ┌──────────────┴──────────────┐
                ▼                             ▼
┌──────────────────────────────┐ ┌─────────────────────────────┐
│  .templates-nav-bar (Fixed)  │ │   .templates-container      │
└──────────────────────────────┘ └─────────────┬───────────────┘
                                              │
                      ┌───────────────────────┴───────────────────────┐
                      ▼                                               ▼
     ┌───────────────────────────────────┐          ┌───────────────────────────────────┐
     │   #templates-desktop-hint-banner   │          │          .templates-hero          │
     │  (Visible only if <768px & active)│          │  (Search, Categories, Grid...)    │
     └────────────────┬──────────────────┘          └───────────────────────────────────┘
                      │
           User clicks dismiss (✕)
                      ▼
     ┌───────────────────────────────────┐
     │  sessionStorage.setItem(          │
     │    'dexter_desktop_hint_dismissed'│
     │    'true')                        │
     │  Banner smoothly collapses & hides│
     └───────────────────────────────────┘
```

#### State & Storage Contract
- **Storage Key**: `sessionStorage.getItem('dexter_desktop_hint_dismissed')`
- **DOM ID**: `#templates-desktop-hint-banner`
- **Dismiss Handler**: `dismissDesktopHint()` (updates session storage, triggers slide-up animation, sets `display: none`).
- **Show Handler**: `checkAndShowDesktopHint()` (invoked whenever navigating to the templates view).
