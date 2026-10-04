# Implementation Plan: Templates & Showcase Gallery & Admin Hybrid Upload

Replace the "More info" dropdown in the navbar with a dedicated **Templates & Showcase** experience. Visitors can explore pre-built design architectures with live interactive previews, while the admin can upload and manage templates via either live URLs or direct HTML files.

---

## 1. User Journey & Architecture Overview

```
[Public Website Nav]
       │
       ▼ (Clicks "Templates & Showcase")
[Dedicated Full-Screen Template Gallery]
   ├── Filter by Category (SaaS, E-Commerce, Landing Page, Mobile)
   ├── Interactive Live Preview Modal (Desktop / Tablet / Mobile frame switchers)
   └── "Use This Template" CTA ──► Opens Intake Form with Pre-selected Scope

[Admin Console Desk]
       │
       ▼ (Clicks "Templates Manager")
[Admin Template Management Section]
   ├── List & Manage Existing Templates (Active/Inactive, Delete, Preview)
   └── "+ Add Template" Modal:
         ├── Title, Category, Description, Tags, Thumbnail
         └── Hybrid Source Switcher:
               ├── Option A: Live Website / Demo URL
               └── Option B: Direct HTML File Upload (.html file reader -> sandboxed srcdoc)
```

---

## 2. Key Components to Implement

### A. Navigation Bar Replacement
- Remove the `More info ▾` dropdown button and its nested service anchor tags in `index.html`.
- Add a prominent, styled `Templates & Showcase` navigation item that smoothly switches to the full-screen gallery view (`showTemplatesView()`).
- Add corresponding entry in the mobile navigation drawer.

### B. Dedicated Full-Screen Template Gallery (`#templates-view`)
- **Header**:
  - DexterTech logo and brand identity.
  - "← Back to Home" quick return button.
  - "Custom Request" CTA button linking to intake.
- **Hero & Controls**:
  - Title: *Design Architectures & Production Templates*.
  - Subtitle: *Explore pre-engineered web solutions, SaaS dashboards, and high-converting storefronts.*
  - Category filter pills: `All`, `SaaS & Web Apps`, `E-Commerce`, `Landing Pages`, `Corporate & Portfolios`.
  - Search input for real-time keyword filtering.
- **Template Card Grid**:
  - High-fidelity preview thumbnail with hover zoom.
  - Category badge & tech stack tags (`React`, `Tailwind`, `Next.js`, `Vite`).
  - Title and deliverable summary.
  - Action buttons:
    - **Live Preview**: Opens interactive device-view modal.
    - **Use Template**: Opens project brief with template info pre-populated.
- **Interactive Device Preview Modal**:
  - Live iframe displaying the URL or raw HTML `srcdoc`.
  - Viewport switcher buttons: **Desktop** (100%), **Tablet** (768px), **Mobile** (375px).
  - "Open in New Tab" external link.

### C. Persistent Template Store (`TemplateStore`)
- Local storage key: `dextertech_templates_v1`.
- Built-in initial seed templates:
  1. **Apex SaaS Analytics Platform** (SaaS & Web App)
  2. **Veloce Modern E-Commerce Store** (E-Commerce)
  3. **Kroma Minimalist Studio Portfolio** (Portfolio / Landing Page)
  4. **Pulse Fintech Dashboard & MVP** (Application Making)
- Full CRUD API: `getAll()`, `getById(id)`, `addTemplate(data)`, `updateTemplate(id, data)`, `deleteTemplate(id)`.
- Support for both `liveUrl` (string) and `htmlContent` (raw HTML string read via HTML5 `FileReader`).

### D. Admin Console Template Management (`#admin-section-templates`)
- Add a **"Templates"** manager button in the admin console header alongside Projects and FAQ Inquiries.
- **Admin Template Section**:
  - Table of all uploaded templates showing Title, Category, Upload Type (`URL` vs `HTML File`), Date, and Actions.
  - **"+ Upload New Template"** modal:
    - Template Title & Category selector.
    - Short description and tech tags.
    - **Source Type Tab**:
      - **Live URL**: Direct demo link input.
      - **HTML File Upload**: Drag-and-drop or file browser for `.html` / `.htm` files (stores code locally for instant rendering).
    - Thumbnail image: upload local image or enter image URL.
    - Instant preview before saving.

---

## 3. Verification & Testing Plan

1. **Navigation Flow**: Verify clicking "Templates & Showcase" opens the full-screen gallery, and "← Back to Home" returns seamlessly.
2. **Interactive Preview**: Test both Live URL templates and uploaded HTML templates inside the device preview modal across Desktop, Tablet, and Mobile viewports.
3. **Template-to-Brief Integration**: Click "Use Template" on any card and confirm it opens the intake portal with the service and deliverable pre-filled.
4. **Admin Upload**: In the admin console, upload an HTML file and create a Live URL template; confirm they appear immediately in the public gallery.
5. **Code Quality**: Verify build with `compile_applet` and run `lint_applet`.
