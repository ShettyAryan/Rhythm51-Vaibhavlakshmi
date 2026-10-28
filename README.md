# Property Tour Platform

A data-driven 360° virtual tour for real-estate projects: a brochure-styled landing
page, an apartment ("rooms") tour and an amenities tour built on one shared
panorama engine, a live floor-plan navigator showing position and viewing
direction, in-page PDF viewers for the floor plan and brochure, and a protected
admin panel ("Tour Studio") to manage everything without code.

The visual design follows the supplied *Rhythm 51* brochure: plum `#56163B`,
wine `#351020`, coral/magenta ribbon `#EC6C69 → #A42D66`, champagne gold
`#C7A56A`, ivory/sand backgrounds, Cormorant Garamond display type and Jost
tracked-uppercase labels.

## Stack

| Concern | Choice |
|---|---|
| App | Next.js 16 (App Router), React 19, TypeScript (strict) |
| Styling | Tailwind CSS 4, self-hosted fonts (`@fontsource`) |
| 360° viewer | three.js (custom equirectangular sphere viewer, DOM hotspots) |
| PDFs | pdf.js (`pdfjs-dist` 6), lazy page rendering + HTTP range requests |
| Database | PostgreSQL. **Local:** embedded PGlite (no install). **Production:** any Postgres (e.g. Supabase) via `DATABASE_URL` |
| Storage | **Local:** files under `DATA_DIR/storage`. **Production:** any private S3-compatible bucket (Supabase Storage S3, Cloudflare R2, AWS S3) |
| Images | sharp (dimension checks, 640/2048/4096 px renditions) |
| Auth | Own email + password auth: scrypt hashes, DB-backed sessions, HTTP-only cookies, rate-limited login |
| Tests | Vitest (unit/integration on real Postgres via PGlite), Playwright (E2E, desktop + mobile) |

Why not Supabase Auth / supabase-js? The same SQL, auth and storage code then
runs identically on a laptop with zero services and on hosted Postgres; Supabase
remains a first-class production target through its Postgres connection string
and S3-compatible storage endpoint.

## Quick start (local development)

Requirements: Node 22+, npm. (Python 3 + numpy + Pillow + PyMuPDF only if you want
to regenerate the demo assets.)

```bash
npm install                 # also copies the pdf.js worker into public/vendor
cp .env.example .env.local  # defaults work as-is for local development
npm run db:seed             # creates the demo project (see "Demo content")
npm run admin:create -- --email you@example.com --name "Your Name"   # prompts for a password (min 12 chars)
npm run dev                 # http://localhost:3000  ·  admin: /admin
```

> The embedded database can be opened by **one process at a time**. Stop
> `npm run dev` before running `db:seed` / `admin:create` (you'll get a clear error
> otherwise). With a real `DATABASE_URL` this restriction doesn't apply.

### Scripts

| Script | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | Apply SQL migrations in `db/migrations` (also applied automatically on first connection) |
| `npm run db:seed [-- --force]` | Seed the demo project (skips if a project exists unless `--force`) |
| `npm run admin:create -- --email … [--name …] [--reset]` | Create an admin / reset a password (reads `ADMIN_PASSWORD` or prompts). There are **no default credentials**. |
| `npm run export [-- --slug … --out …]` | Export the latest published snapshot as a static website (default `./static-site`) |
| `npm run export:shell` | Developer use only: rebuilds the code bundle in `.static-shell/`. It does **not** update `static-site/` — use `npm run export` or the admin button for that |
| `npm run demo:assets` | Regenerate `seed/demo/*` (synthetic panoramas/plans + brochure-derived hero, logo, floor-plan PDF) |
| `npm test` | Vitest unit + integration tests |
| `npm run test:e2e` | Production build + Playwright E2E against an isolated `.data-test` database |

## Demo content

`npm run db:seed` builds a complete, published demo so every feature works before
real content arrives:

* **Hero image, logo, brochure PDF and floor-plan PDF** come from the supplied
  brochure (`references/Rhythm 51 brochure.pdf`): hero = page 30 render, logo =
  cover wordmark, floor-plan PDF = layout pages 31–35, brochure = full PDF.
* **Panoramas and interactive plans are synthetic** (ray-cast box rooms rendered by
  `scripts/generate-demo-assets.py`) and are watermarked *"DEMO PANORAMA – NOT
  PROPERTY IMAGERY"* / *"DEMO LAYOUT, NOT THE PROPERTY'S PLAN"*. Their hotspot
  angles and plan positions are computed from the same geometry, so they are exact
  and make a good calibration reference.
* Apartment: Living Room (3 viewpoints), Kitchen, Bathroom, Master Bedroom (2),
  Bedroom 2 — 8 viewpoints, 30+ hotspots. Amenities: Lobby, Swimming Pool (2),
  Gymnasium, Garden on a site plan.

Replace or delete all demo content before launch. **Note:** the brochure's footer
states it is "intended solely for internal circulation"; confirm with the builder
before publishing it on a public site.

## Architecture

```
app/
  page.tsx                    Landing (reads the live published snapshot)
  tour/[type]/page.tsx        rooms | amenities tour (?ap=<accessPointId> deep links)
  admin/login                 Sign in
  admin/(panel)/…             Dashboard, Settings, Media, Rooms, Amenities, Floor plans,
                              Documents, Preview & Publish, Projects, viewpoint editor
  admin/preview/…             Same public UI built from draft content (admin only)
  api/media/[id]              Media delivery with authorisation + Range support
  api/auth/*, api/admin/*     JSON APIs (every admin route wrapped by lib/api.ts → adminRoute)
components/
  tour/                       PanoramaViewer, TourExperience, TourSidebar, FloorPlanNavigator, HotspotMarker
  public/                     Landing, Ribbon, ThemeStyle
  pdf/PdfViewer.tsx           pdf.js viewer (lazy pages, zoom, fit width, page nav, download)
  admin/                      Admin UI (MediaLibrary, AccessPointEditor, FloorPlanEditor, …)
lib/
  db/                         Driver (PGlite | pg), migrations runner
  content/                    Snapshot builder, publishing, asset pipeline, mutations, admin queries
  auth/                       Password hashing, sessions, guards
  storage/                    local | s3 drivers
  tour/geometry.ts            Coordinate maths (see docs/COORDINATES.md)
  validation.ts               Zod schemas for every admin input
db/migrations/                Plain SQL
```

### Data model

`projects` → `tours` (one `rooms`, one `amenities`) → `tour_groups` (rooms /
amenities) → `access_points` (one panorama each) → `hotspots` (source → destination
access point, yaw/pitch). Plus `floor_plans`, `documents` (floor_plan, brochure),
`assets` (metadata only; binaries live in object storage), `publications`
(frozen snapshots), `admin_users`, `sessions`, `login_attempts`, `storage_garbage`.

Integrity rules enforced in the database and/or service layer:

* hotspot destinations must exist, be in the same tour and not be the source
  (FK `on delete cascade` removes hotspots when an access point is deleted);
* assets referenced by any content cannot be deleted (FK `on delete restrict` +
  a friendly usage check); every referenced id is checked to belong to the
  admin's active project;
* marker coordinates ∈ [0, 1] (both or neither), pitch ∈ [-90, 90], fov ∈ [30, 110];
* default access points are added after creation (nullable FKs, `on delete set
  null`) to avoid circular creation dependencies.

### Draft vs. published

Every room, viewpoint, plan, document and tour has a `draft | published` status.
**Publish** builds a snapshot containing only published items whose parents are
published, drops hotspots that lead to anything hidden, drops viewpoints without a
panorama, and records the exact storage key of every file it references. Visitors
are served only the latest snapshot; media URLs carry `p=1` and `/api/media` serves
the file frozen in that publication. So:

* edits — including replacing a file — are invisible publicly until republished;
* unpublished/draft files are never served to visitors (draft URLs require an admin session);
* switching *Public site online* off hides everything immediately.

Optionally, *Publish changes immediately* in Settings republishes after each save.

### Performance

* Panoramas: a 2048 px rendition shows first, then the best size the device can
  use (≤ 4096 px on phones/low-memory devices, original up to 8192 px otherwise,
  respecting `MAX_TEXTURE_SIZE`). Textures are uploaded before display, kept in a
  4-entry LRU cache and disposed on eviction. Obsolete loads are aborted.
  Hotspot destinations are prefetched once a view is ready.
* Rendering is on-demand (only when the view changes) to save battery.
* PDFs: range requests (`Accept-Ranges` on local storage, native on S3), pages
  rendered only near the viewport and released when far away, canvas size capped.
* Thumbnails use the 640 px rendition.

### Security

* Server-side authorisation on every admin page (`requireAdminPage`) and API
  (`adminRoute` → 401); `proxy.ts` only adds an early redirect for UX.
* State-changing admin requests require same-origin (`Origin` / `Sec-Fetch-Site`
  check, 403) in addition to `SameSite=Lax` cookies.
* Passwords: scrypt (N=2¹⁵); sessions are random 256-bit tokens stored hashed;
  12-hour expiry; login throttled to 8 failures / 15 min per email or IP.
* Uploads: type/size validated on request, **magic bytes verified** on finalize,
  images decoded by sharp, panoramas must be full-sphere equirectangular (2:1 or 16:9 frame); storage keys are random and never
  user-controlled; the bucket is private.
* All input validated with Zod; text is stripped of control characters and always
  rendered escaped by React; URLs restricted to http(s).
* Security headers (`nosniff`, frame-ancestors, referrer policy, permissions
  policy); admin pages `no-store` + `noindex`.

## Deployment

### Simplest: static export (no server, no database online)

Keep the admin panel on your own computer and publish the tour as plain files:

1. Edit content locally (`npm run dev` → `/admin`) and **Publish**.
2. *Preview & Publish → Export static site* (or, with the dev server stopped,
   `npm run export [-- --out <folder>]`). This writes `static-site/`:
   `index.html`, `tour/rooms/index.html`, `tour/amenities/index.html`, the bundled
   code in `assets/`, the pdf.js worker, and every published image/PDF in `media/`.
   Only **published** content is exported.
3. Upload the folder's contents to any static host, for example:
   * **Netlify** — drag the folder onto app.netlify.com/drop (or `netlify deploy --dir static-site --prod`).
   * **Cloudflare Pages** — Workers & Pages → Create → Pages → *Upload assets* (free, unmetered bandwidth). Note the 25 MB per-file limit: keep PDFs under 25 MB or use Netlify.
   * **GitHub Pages**, or any normal web hosting account via FTP / file manager.
   It works at a domain root or in a sub-folder. It must be served over http(s);
   opening `index.html` from disk does not work.
4. After every change: Publish → Export → upload again.

Visitors only ever get read-only files; there is no admin panel online.
`_headers` (Netlify / Cloudflare Pages) sets long-term caching for media and code.
Every export rebuilds the code too, so code changes (e.g. after updating this project) reach the site the same way: **export, then deploy**. Code and media file names contain a content hash, so visitors never get stale cached files after a redeploy.

### Full online deployment (online admin panel)

You need **Postgres**, **S3-compatible storage**, and a **Node.js host**.

### Recommended: Supabase (Postgres + Storage) + any Node host

1. **Database** — create a Supabase project. Copy *Project Settings → Database →
   Connection string → Session pooler* into `DATABASE_URL`. Tables are created
   automatically on first start (or run `npm run db:migrate`).
2. **Storage** — create a **private** bucket (e.g. `tour-media`). Under *Storage →
   S3 Connection* enable S3 access and create an access key. Set:
   ```
   STORAGE_DRIVER=s3
   S3_ENDPOINT=https://<project-ref>.supabase.co/storage/v1/s3
   S3_REGION=<project region, e.g. ap-south-1>
   S3_BUCKET=tour-media
   S3_ACCESS_KEY_ID=…
   S3_SECRET_ACCESS_KEY=…
   S3_FORCE_PATH_STYLE=true
   ```
   Allow CORS `GET, PUT, HEAD` from your site origin with headers
   `Content-Type, Range` and expose `Content-Range, Accept-Ranges, Content-Length`
   (browsers upload directly to the bucket and pdf.js reads ranges).
3. **App** — on Render, Railway, Fly.io, a VPS, or Vercel:
   ```
   npm ci && npm run build && npm start
   ```
   Set `SECURE_COOKIES=true` (HTTPS) and optionally `PUBLIC_PROJECT_SLUG`.
4. Create the first admin from a machine with `DATABASE_URL` set:
   `npm run admin:create -- --email owner@builder.com`.
5. Sign in at `/admin`, upload content, publish.

Notes:

* On serverless hosts (Vercel) the local storage driver and embedded database do
  **not** persist — `DATABASE_URL` and `STORAGE_DRIVER=s3` are mandatory. Panorama
  processing with sharp needs memory roughly proportional to image size (~1 GB for
  16k×8k); raise the function memory/timeout or prefer a long-running Node host.
* Cloudflare R2 / AWS S3 work the same way (set `S3_ENDPOINT`/`S3_REGION` accordingly).
* Single-server installs can keep the embedded database and local storage on a
  persistent disk (`DATA_DIR=/var/lib/tour`); back up that directory.
* Rate limiting of login attempts is stored in the database, so it works across
  instances. Put the app behind a CDN/reverse proxy that sets `X-Forwarded-For`.

### Multiple properties

The schema is multi-project. *Admin → Projects* creates projects and switches the
one being edited; `PUBLIC_PROJECT_SLUG` selects which project the public site
serves (one deployment per property domain).

## Further docs

* [docs/CONTENT-GUIDE.md](docs/CONTENT-GUIDE.md) — uploading panoramas, building tours, placing hotspots, calibrating the floor plan, publishing.
* [docs/COORDINATES.md](docs/COORDINATES.md) — yaw/pitch/bearing conventions and calibration maths.
