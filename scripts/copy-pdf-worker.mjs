// Copies the pdf.js worker into /public so it is served as a static file with the
// exact same version as the installed pdfjs-dist API (they must match).
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
try {
  const pkgDir = path.dirname(require.resolve("pdfjs-dist/package.json"));
  const src = path.join(pkgDir, "build", "pdf.worker.min.mjs");
  const destDir = path.join(process.cwd(), "public", "vendor");
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
  copyFileSync(src, path.join(destDir, "pdf.worker.min.mjs"));
  console.log("Copied pdf.js worker to public/vendor/");
} catch (err) {
  console.warn("Could not copy pdf.js worker:", err.message);
}
