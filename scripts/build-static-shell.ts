/**
 * Builds the code part of the static site ("shell") into .static-shell/:
 *   assets/app.js (+ lazily loaded chunks), assets/app.css (fonts), assets/tailwind.css,
 *   vendor/pdf.worker.min.mjs, shell.json (file list).
 * Content (snapshot + media) is added per export by lib/export/static.ts.
 * Does not touch the database, so it can run while the admin server is up.
 *
 *   npm run export:shell
 */
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import tailwind from "@tailwindcss/postcss";
import * as esbuild from "esbuild";
import postcss from "postcss";

const root = process.cwd();
const out = path.join(root, ".static-shell");
const require = createRequire(import.meta.url);

async function main() {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(path.join(out, "assets"), { recursive: true });
  mkdirSync(path.join(out, "vendor"), { recursive: true });

  // 1. JavaScript + font CSS
  const result = await esbuild.build({
    entryPoints: { app: path.join(root, "static-export", "entry.tsx") },
    outdir: path.join(out, "assets"),
    bundle: true,
    splitting: true,
    format: "esm",
    platform: "browser",
    target: ["es2022", "chrome111", "safari16.4", "firefox115"],
    minify: true,
    jsx: "automatic",
    tsconfig: path.join(root, "tsconfig.json"),
    chunkNames: "chunk-[hash]",
    assetNames: "[name]-[hash]",
    loader: { ".woff2": "file", ".woff": "file" },
    alias: {
      "next/link": path.join(root, "static-export", "shims", "next-link.tsx"),
      "next/navigation": path.join(root, "static-export", "shims", "next-navigation.ts"),
    },
    define: { "process.env.NODE_ENV": '"production"' },
    logOverride: { "unsupported-directive": "silent" },
    metafile: true,
    logLevel: "warning",
  });
  const outputs = Object.keys(result.metafile.outputs).map((p) => path.relative(out, path.resolve(p)).replace(/\\/g, "/"));

  // 2. Tailwind CSS (scans the project sources for class names)
  const cssPath = path.join(root, "app", "globals.css");
  const css = await postcss([tailwind({ base: root, optimize: { minify: true } })]).process(readFileSync(cssPath, "utf8"), {
    from: cssPath,
  });
  writeFileSync(path.join(out, "assets", "tailwind.css"), css.css);

  // 3. pdf.js worker (must match the bundled pdfjs-dist version)
  const pdfDir = path.dirname(require.resolve("pdfjs-dist/package.json"));
  copyFileSync(path.join(pdfDir, "build", "pdf.worker.min.mjs"), path.join(out, "vendor", "pdf.worker.min.mjs"));

  const manifest = {
    builtAt: new Date().toISOString(),
    js: "assets/app.js",
    css: ["assets/app.css", "assets/tailwind.css"].filter((f) => f === "assets/tailwind.css" || outputs.includes(f)),
  };
  writeFileSync(path.join(out, "shell.json"), JSON.stringify(manifest, null, 2));
  const size = outputs.length;
  console.log(`Static shell built in .static-shell (${size} bundled files).`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
