import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, cpSync } from "node:fs";
import path from "node:path";
import { queryOne } from "../db";
import { ApiError } from "../errors";
import type { PublicationKeys } from "../content/publish";
import { getStorage } from "../storage";
import type { Snapshot, TourType } from "../tour/types";

const MARKER = ".tour-export";
/** Hosting-tool folders that must survive re-exports. */
const KEEP = new Set([".vercel", ".netlify", ".wrangler", ".git"]);
const LONG_CACHE = "public, max-age=31536000, immutable";
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

export function defaultExportDir() {
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.STATIC_EXPORT_DIR?.trim() || "static-site");
}

/** Builds .static-shell (JS/CSS/fonts) in a child process; it needs no database access. */
export function buildShell(): Promise<void> {
  return new Promise((resolve, reject) => {
    const cli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
    const child = spawn(process.execPath, [cli, "scripts/build-static-shell.ts"], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    child.stdout.on("data", (d) => (log += d));
    child.stderr.on("data", (d) => (log += d));
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`Building the static site code failed:\n${log.slice(-2000)}`))));
  });
}

function safeName(name: string) {
  const cleaned = name.normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return cleaned.slice(0, 80) || "file";
}

/**
 * Maps a published media URL (/api/media/<id>?v=…&p=1[&variant=…][&download=1])
 * to a static file path, recording which storage object must be copied there.
 */
export function rewriteMediaUrls(snapshot: Snapshot, keys: PublicationKeys) {
  const copies = new Map<string, string>(); // relative path -> storage key
  const rewrite = (url: string): string => {
    const u = new URL(url, "http://export.local");
    const m = /^\/api\/media\/([0-9a-f-]{36})$/i.exec(u.pathname);
    if (!m) return url;
    const id = m[1]!;
    const entry = keys[id];
    if (!entry) throw new Error(`Published file ${id} is missing from the publication.`);
    const version = u.searchParams.get("v") ?? "1";
    const variant = u.searchParams.get("variant");
    const dir = `media/${id}-v${version}`;
    let rel: string;
    // Panoramas with a web-optimised full-resolution copy never need the heavy
    // original (e.g. a 40 MB PNG): visitors' browsers load the copy instead.
    const effective = variant && entry.variants[variant] ? variant : !variant && entry.variants.full ? "full" : null;
    if (effective) {
      rel = `${dir}/${effective}.webp`;
      copies.set(rel, entry.variants[effective]!);
    } else {
      const base = safeName(entry.fileName.replace(/\.[^.]+$/, ""));
      rel = `${dir}/${base}.${EXT[entry.mime] ?? "bin"}`;
      copies.set(rel, entry.key);
    }
    return rel;
  };
  const walk = (value: unknown): unknown => {
    if (typeof value === "string") return value.startsWith("/api/media/") ? rewrite(value) : value;
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v)]));
    return value;
  };
  return { snapshot: walk(snapshot) as Snapshot, copies };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function pageHtml(opts: { base: string; page: "landing" | TourType; title: string; description: string; data: string; shell: { js: string; css: string[] } }) {
  const css = opts.shell.css.map((c) => `<link rel="stylesheet" href="${c}">`).join("\n    ");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <base href="${opts.base}">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="theme-color" content="#56163b">
    <title>${escapeHtml(opts.title)}</title>
    <meta name="description" content="${escapeHtml(opts.description)}">
    ${css}
    <script type="module" src="${opts.shell.js}"></script>
  </head>
  <body class="min-h-dvh" data-page="${opts.page}">
    <div id="root"></div>
    <noscript>This virtual tour needs JavaScript enabled.</noscript>
    <script id="tour-data" type="application/json">${opts.data}</script>
  </body>
</html>
`;
}

export interface ExportResult {
  outDir: string;
  files: number;
  bytes: number;
  publishedAt: string;
}

/**
 * Writes the latest *published* snapshot of a project as a self-contained static
 * website (HTML + JS + CSS + media) that can be uploaded to any static host.
 * Only published content is exported; drafts never leave the computer.
 */
export async function exportStaticSite(projectId: string, outDir = defaultExportDir(), opts: { rebuildShell?: boolean } = {}): Promise<ExportResult> {
  const pub = await queryOne<{ snapshot: Snapshot; asset_keys: PublicationKeys; created_at: string }>(
    "select snapshot, asset_keys, created_at from publications where project_id = $1 order by created_at desc limit 1",
    [projectId],
  );
  if (!pub) throw new ApiError(409, "Nothing has been published yet. Publish first, then export.");

  const shellDir = path.join(/*turbopackIgnore: true*/ process.cwd(), ".static-shell");
  if (opts.rebuildShell !== false || !existsSync(/*turbopackIgnore: true*/ path.join(shellDir, "shell.json"))) await buildShell();
  const shell = JSON.parse(readFileSync(/*turbopackIgnore: true*/ path.join(shellDir, "shell.json"), "utf8")) as { js: string; css: string[] };

  // Only ever wipe an empty folder or one we created before.
  if (existsSync(/*turbopackIgnore: true*/ outDir) && readdirSync(/*turbopackIgnore: true*/ outDir).length > 0 && !existsSync(/*turbopackIgnore: true*/ path.join(outDir, MARKER))) {
    throw new ApiError(409, `${outDir} is not empty and was not created by this exporter. Choose an empty folder.`);
  }
  // Clear the previous export but keep hosting links (e.g. `.vercel` from
  // `vercel deploy`), so re-deploying doesn't ask to set the project up again.
  mkdirSync(/*turbopackIgnore: true*/ outDir, { recursive: true });
  for (const entry of readdirSync(/*turbopackIgnore: true*/ outDir)) {
    if (KEEP.has(entry)) continue;
    rmSync(/*turbopackIgnore: true*/ path.join(outDir, entry), { recursive: true, force: true });
  }
  cpSync(/*turbopackIgnore: true*/ shellDir, outDir, { recursive: true, filter: (src) => path.basename(src) !== "shell.json" });

  const { snapshot, copies } = rewriteMediaUrls(pub.snapshot, pub.asset_keys);
  const storage = await getStorage();
  let bytes = 0;
  for (const [rel, key] of copies) {
    const data = await storage.read(key);
    const file = path.join(outDir, rel);
    mkdirSync(/*turbopackIgnore: true*/ path.dirname(file), { recursive: true });
    writeFileSync(/*turbopackIgnore: true*/ file, data);
    bytes += data.length;
  }

  // JSON inside <script>: escape "<" so no content can close the tag.
  const data = JSON.stringify(snapshot).replace(/</g, "\\u003c");
  const p = snapshot.project;
  const siteTitle = [p.name, p.developerName].filter(Boolean).join(" · ") || "Virtual Tour";
  const description = p.heroSubtitle || p.heroHeadline || "Interactive 360° property tour";
  writeFileSync(/*turbopackIgnore: true*/ path.join(outDir, "index.html"), pageHtml({ base: "./", page: "landing", title: siteTitle, description, data, shell }));
  for (const type of ["rooms", "amenities"] as const) {
    const label = type === "rooms" ? p.navLabels.rooms : p.navLabels.amenities;
    mkdirSync(/*turbopackIgnore: true*/ path.join(outDir, "tour", type), { recursive: true });
    writeFileSync(/*turbopackIgnore: true*/ 
      path.join(outDir, "tour", type, "index.html"),
      pageHtml({ base: "../../", page: type, title: [label, p.name].filter(Boolean).join(" · "), description, data, shell }),
    );
  }

  // Caching rules (media and code file names are versioned, so they never change).
  // Vercel reads vercel.json; Netlify / Cloudflare Pages read _headers.
  writeFileSync(
    /*turbopackIgnore: true*/ path.join(outDir, "vercel.json"),
    JSON.stringify(
      {
        // Clean URLs: serve /tour/rooms/ (no ".html") and redirect old .html links there.
        // Trailing slashes keep each page's relative <base href> correct.
        cleanUrls: true,
        trailingSlash: true,
        headers: [
          { source: "/media/(.*)", headers: [{ key: "Cache-Control", value: LONG_CACHE }] },
          { source: "/assets/(.*)", headers: [{ key: "Cache-Control", value: LONG_CACHE }] },
          { source: "/(.*)", headers: [{ key: "X-Content-Type-Options", value: "nosniff" }] },
        ],
      },
      null,
      2,
    ),
  );
  writeFileSync(/*turbopackIgnore: true*/ 
    path.join(outDir, "_headers"),
    ["/media/*", `  Cache-Control: ${LONG_CACHE}`, "/assets/*", `  Cache-Control: ${LONG_CACHE}`, "/*", "  X-Content-Type-Options: nosniff", ""].join("\n"),
  );
  writeFileSync(/*turbopackIgnore: true*/ 
    path.join(outDir, "README.txt"),
    `Static export of "${p.name}" (published ${new Date(pub.created_at).toISOString()}).\n\nUpload the whole contents of this folder to any static web host\n(Netlify, Cloudflare Pages, GitHub Pages, or a normal web hosting account).\nIt must be served over http(s); opening index.html directly from disk will not work.\n`,
  );
  writeFileSync(/*turbopackIgnore: true*/ path.join(outDir, MARKER), new Date().toISOString());

  return { outDir, files: copies.size, bytes, publishedAt: new Date(pub.created_at).toISOString() };
}
