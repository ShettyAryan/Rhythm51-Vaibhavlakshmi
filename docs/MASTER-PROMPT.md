# Master prompts — same 3D web tour, different look

Two prompts. Fill in the **Design brief** first (it's shared by both), then paste
**one** prompt plus the brief into your AI coding agent.

* **Prompt A — Reskin this codebase (recommended).** Fastest and safest: keeps the
  tested tour engine, admin, publishing and static export; changes only the look.
* **Prompt B — Rebuild from scratch.** Use when starting a brand-new repository.

---

## Design brief (fill this in — paste it after either prompt)

```
DESIGN BRIEF
- Brand / project name: [e.g. "Skyline Residences" — or "take it from the brochure"]
- Reference material: [path to brochure PDF / website URL / mood-board images]
- Mood in 3–5 words: [e.g. "modern, airy, minimal, coastal"]
- Colour palette (hex):
    primary:        [#______]   (main brand colour: panels, buttons)
    primary-dark:   [#______]   (deep backgrounds, toolbars)
    accent:         [#______]   (highlights, focus rings, active states)
    background:     [#______]   (light page / admin background)
    secondary:      [#______]   (supporting accent, e.g. hotspot cone)
    text:           [#______]
- Typography: display/heading font [name], UI/body font [name]
  (must be self-hosted via @fontsource — no Google Fonts at runtime/build)
- Shape language: [sharp corners / soft rounded / pill buttons]
- Panel style: [solid / frosted glass / outlined / dark / light]
- Landing hero layout: [e.g. full-bleed image with bottom bar / split screen /
  centred title with menu cards]
- Menu panel position for the tour: [left side panel / bottom drawer / top bar]
- Hotspot style: [ring / arrow / pin / numbered dot]
- Motion: [minimal / subtle / expressive] — always respect reduced-motion
- Anything to avoid: [e.g. "no gold", "no serif fonts", "no glassmorphism"]
```

---

## Prompt A — Reskin this codebase

```
You are a senior front-end engineer and UI designer. This repository is a
working, tested real-estate 360° virtual tour platform (Next.js 16 App Router,
React 19, TypeScript strict, Tailwind CSS 4, three.js, pdf.js, PGlite/Postgres).
Your job: give it a completely new visual design according to the DESIGN BRIEF
below, WITHOUT changing behaviour, data, URLs or APIs.

FIRST
1. Read README.md, docs/COORDINATES.md, docs/CONTENT-GUIDE.md and AGENTS.md.
   This Next.js version has breaking changes — read the relevant guide in
   node_modules/next/dist/docs/ before writing Next.js code.
2. Map the visual layer before editing:
   - Design tokens: app/globals.css (@theme block) and components/public/ThemeStyle.tsx
     (admin-editable colour overrides via CSS variables --brand-*).
   - Fonts: app/layout.tsx and static-export/entry.tsx (@fontsource imports — keep
     both in sync).
   - Public UI: components/public/* (Landing, Ribbon, Unpublished),
     components/tour/* (TourExperience, TourSidebar, FloorPlanNavigator,
     HotspotMarker, PanoramaViewer overlays), components/pdf/PdfViewer.tsx,
     components/ui/* (Dialog, Spinner).
   - Admin UI: components/admin/* (ui.tsx holds the shared primitives).
3. Run the baseline: `npx tsc --noEmit`, `npm test`, `npm run test:e2e`. All
   must pass before you start; report the counts.

WHAT TO CHANGE
- Replace the design tokens with the brief's palette and fonts. Keep the token
  NAMES used across components working (or rename them everywhere consistently),
  and keep the admin "Theme colours" override mechanism working with the new
  tokens.
- Redesign the landing page, tour chrome (top bar, side panel, viewpoint strip,
  controls, floor-plan navigator card), hotspots, PDF modal toolbar, empty /
  loading / error states, and the admin panel styling, following the brief.
- Replace decorative elements tied to the old brand (e.g. Ribbon.tsx) with ones
  that fit the new brief, or remove them.

WHAT MUST NOT CHANGE (these are tested and were hard-won)
- All `data-testid` attributes, routes, URL shapes (`/`, `/tour/rooms/`,
  `?ap=<id>`), API contracts, database schema and stored data.
- Panorama maths and conventions (lib/tour/geometry.ts, docs/COORDINATES.md).
- Accessibility: labelled icon buttons, visible focus, native <dialog> modals with
  Escape + focus restore, reduced-motion support, keyboard panorama controls.
- Responsive behaviour: side panel can be fully hidden on desktop (remembered in
  localStorage) with a tab to reopen it; long names truncate with a tooltip and
  never overflow the panel; mobile uses a bottom sheet; floor plan collapses on
  phones; no page scroll while dragging the panorama.
- Performance rules:
  * NO infinite CSS animations over the panorama (an endless pulse forced a
    full-screen repaint every frame and pegged the CPU). Hotspot attention
    animations must stop after a few cycles.
  * Avoid stacking many large backdrop-blur layers over the WebGL canvas.
  * Rendering stays on-demand (only when the view changes).
- Static export (lib/export/static.ts, scripts/build-static-shell.ts,
  static-export/*): content-hashed asset names, clean URLs (no .html), relative
  <base href>, vercel.json + _headers caching. Any new client-side dependency
  must work in the static bundle too (next/link and next/navigation are shimmed
  there).
- Never delete .data/ or its process.lock file; never run scripts against the
  database while `npm run dev` is running.

VERIFY (do not claim success without running these)
- `npx tsc --noEmit`, `npm test`, `npm run test:e2e` — all pass. If a test fails
  because a visual assumption changed (not behaviour), fix the test minimally and
  explain why.
- Build the static site (`npm run export` with the dev server stopped) and check
  it in a browser: landing, tour, hotspot navigation, panel hide/show, PDF modals.
- Screenshot desktop (1440×900) and mobile (390×844) for: landing, tour with
  panel open, tour with panel hidden, PDF modal, admin dashboard, viewpoint
  editor. Check contrast (WCAG AA for text) on the new palette.

Report: what changed visually, files touched, test results, and screenshots.

[PASTE THE DESIGN BRIEF HERE]
```

---

## Prompt B — Rebuild from scratch

```
ROLE
Act as a senior full-stack engineer, WebGL/3D web developer, UI/UX designer and
software architect. Build a complete, production-ready, data-driven 360° property
tour platform for a real-estate developer: a public tour website plus a secure
admin panel. It must be a working application, not a mockup. Do not stop after a
plan — implement, test and verify. Never claim a test passed unless you ran it.

FIRST ACTION
Inspect the repository and any reference material in the DESIGN BRIEF. Verify
package versions and APIs against what is installed (frameworks change; read the
framework's bundled docs). Make sensible decisions without asking about minor
details. Do not invent property facts (name, address, specs, claims) — all
property content must be editable in the admin.

STACK (verified to work together)
- Next.js (App Router) + React + TypeScript strict + Tailwind CSS.
- three.js for the panorama viewer (custom, not a heavy wrapper).
- pdf.js (pdfjs-dist) for PDFs; copy its worker into /public on postinstall.
- PostgreSQL with plain SQL migrations; embedded PGlite locally (zero setup) and
  node-postgres via DATABASE_URL in production. Single-process lock file for the
  embedded DB with a clear error if a second process opens it.
- Storage adapter: local disk (with HTTP Range support) or any private
  S3-compatible bucket (signed URLs).
- sharp for image validation and renditions. Zod for all input validation.
- Self-hosted fonts via @fontsource (builds must not depend on Google Fonts).
- Own auth: scrypt password hashes, DB-backed sessions in HttpOnly SameSite=Lax
  cookies, login rate limiting, same-origin check on mutations, server-side
  authorisation on every admin page and API. No default credentials; a CLI
  command creates admins.

DESIGN
Follow the DESIGN BRIEF below exactly (palette, fonts, layout, panel and hotspot
style, motion). Expose the colours as design tokens (CSS variables) that the admin
can override. Image-led, minimal chrome, the panorama dominates. Accessible
contrast, visible focus states, reduced-motion support.

PUBLIC SITE
1. Landing: full-viewport (100dvh) hero image from the admin, optional overlay,
   headline/subtitle, logo; a 4-action menu: Explore Rooms, Explore Amenities,
   Floor Plan (PDF modal), Brochure (PDF modal). Optional About/contact panel.
2. Tours (/tour/rooms/ and /tour/amenities/), one shared engine:
   - Equirectangular 360° viewer: drag, touch, pinch, wheel and keyboard;
     zoom limits; reset; fullscreen; loading, error (with retry) and
     no-panorama states; WebGL-unavailable fallback (flat scrollable image).
   - Accept full-sphere panoramas in a 2:1 OR 16:9 frame (e.g. 7680×4320 renders
     from Blender are full 360°×180° stretched vertically — map by proportion).
   - Hotspots stored as yaw/pitch in panorama space, projected to DOM buttons each
     frame; labels on hover/focus and always on touch; never navigate to hidden
     destinations.
   - Side panel listing rooms → viewpoints, active item highlighted and synced
     with hotspot navigation; text truncates with tooltips and never overflows;
     panel can be FULLY hidden on desktop for a full-screen view, with a tab to
     reopen it (remembered per browser); mobile uses a bottom sheet.
   - Viewpoint thumbnail strip, zoom/reset/fullscreen controls.
   - Current location in the URL (?ap=<id>), falling back to the default viewpoint.
3. Floor-plan navigator (top-right, collapsible, enlargeable): marker at the
   viewpoint's normalised (0–1) position; a view cone whose rotation is
   bearing = cameraYaw + viewpoint.headingOffset + plan.orientationOffset and
   whose width is the actual horizontal field of view; other viewpoints clickable;
   hidden or clearly "not mapped" when data is missing — never misleading.
4. PDF modals: native <dialog> (focus trap, Escape, restore focus, scroll lock),
   continuous scroll, lazy page rendering, zoom, fit-width, page navigation,
   optional download button, loading/error states; HTTP range requests so large
   brochures open fast.

ADMIN PANEL (/admin, protected)
- Dashboard: real counts, last published, "needs attention" list (missing
  panoramas, unplaced viewpoints, hotspots to hidden items, items still Draft).
- Settings: name, developer, logo, hero, headline, overlay, button labels, theme
  colours, about/contact, site online/offline, optional auto-publish.
- Media library: direct uploads with progress and a "Processing…" state, magic-byte
  validation, renditions (thumb 640, md 2048, lg 4096, and a web-optimised
  FULL-resolution WebP for heavy/PNG panoramas so visitors never download a
  40 MB original), replace (new version, old file kept until republished),
  usage tracking, delete blocked while in use.
- Rooms & Amenities: create, reorder, edit, delete, thumbnails, floor plan,
  starting viewpoint, Draft/Published.
- Viewpoint editor: live panorama with crosshair and yaw/pitch/FOV readout; set
  initial view; add hotspot at centre or by clicking; edit/move/delete hotspots;
  create the return hotspot automatically (estimate its yaw from the plan); place
  the viewpoint on its plan by click or drag; calibrate direction by clicking the
  feature under the crosshair on the plan or by dragging the cone's handle.
- Floor plans: one-step "Add plan" with name + image OR PDF (PDF page rendered to
  an image in the browser; page selectable later); select viewpoints, drag to
  move, drag a handle to rotate (mode: "alignment with plan" vs "starting
  direction"), plan rotation offset, unsaved-changes warning.
- Documents: floor-plan PDF and brochure, title, download toggle, status.
- Preview & Publish: previews (optionally including drafts); a clear list of what
  is still Draft and a one-click "Mark all ready items as Published & publish";
  publishing freezes an immutable snapshot (content + exact file versions) that is
  the only thing visitors see. Projects page for multiple properties.

STATIC EXPORT (so the site can be hosted with no server)
- "Export static site" button + CLI: writes the latest published snapshot as plain
  HTML/JS/CSS + media into a folder deployable to Vercel/Netlify/Cloudflare
  Pages/shared hosting. Only published content; drafts never leave the machine.
- Content-hashed file names for code and media (long cache is then safe);
  clean URLs (/tour/rooms/, no .html) with vercel.json cleanUrls/trailingSlash
  and a Netlify/Cloudflare _headers file; relative <base href> so it works at a
  domain root or sub-folder; keep `.vercel`/`.netlify` link folders between
  exports; never copy heavy originals when an optimised copy exists.
- Export must always rebuild the code bundle (never ship stale code).

PERFORMANCE & RELIABILITY (lessons learned — treat as requirements)
- No infinite animations over the panorama; render on demand; avoid stacking
  large backdrop-blur layers over WebGL.
- Preview rendition first, then the best size the GPU allows; LRU texture cache
  with disposal; abort obsolete loads; prefetch hotspot destinations.
- Never let two processes open the embedded database; never delete its lock file.
- E2E tests must run the browser on the real GPU when available (software WebGL
  saturates the CPU and causes random timeouts); allow a software fallback flag.
- Be careful with Windows paths (file:// URLs for ESM imports, 260-char limit).

DEMO CONTENT
Seed script with clearly watermarked synthetic panoramas (ray-cast rooms with
exact hotspot geometry) and demo plans; never present placeholders as real
property imagery.

TESTING (run and report real results)
- Unit/integration (Vitest, real Postgres via PGlite): geometry and calibration
  maths, validation, auth, snapshot rules (drafts hidden, hotspots to hidden
  items pruned, file freezing on replace), integrity rules, export URL rewriting.
- E2E (Playwright, desktop + mobile, isolated seeded DB): landing, both tours,
  both PDF modals, side panel navigation, hotspot navigation updating room/panel/
  plan, cone following rotation, panel hide/show remembered, admin auth and
  cross-site rejection, draft media not served, changes persist and appear only
  after publishing, one-click publish of drafts, floor-plan add (image and PDF),
  marker drag and direction rotate persisting, error state, mobile sheet.

DELIVERABLES
Working public site, protected admin, migrations, .env.example (placeholders
only), README (setup, scripts, architecture, deployment: static export to
Vercel/Netlify, or full app with Postgres + S3), docs/COORDINATES.md,
docs/CONTENT-GUIDE.md (incl. Blender render settings: Cycles, Panoramic →
Equirectangular, 7680×3840 or 7680×4320, camera X90° Y0° Z0°, ~1.5 m height,
consistent exposure, JPEG 92–95), test results, and known limitations.

[PASTE THE DESIGN BRIEF HERE]
```
