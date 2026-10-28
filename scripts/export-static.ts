/**
 * Exports the latest published snapshot as a static website folder.
 *
 *   npm run export                       # public project → ./static-site
 *   npm run export -- --slug my-project --out D:\site
 *
 * (Or use "Export static site" on the admin Preview & Publish page while the
 * app is running — the embedded database allows only one process at a time.)
 */
import path from "node:path";
import { getDb, queryOne } from "../lib/db";
import { getPublicProject } from "../lib/content/publish";
import type { ProjectRow } from "../lib/content/rows";
import { defaultExportDir, exportStaticSite } from "../lib/export/static";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  await getDb();
  const slug = arg("slug");
  const project = slug ? await queryOne<ProjectRow>("select * from projects where slug = $1", [slug]) : await getPublicProject();
  if (!project) throw new Error(slug ? `No project with slug "${slug}".` : "No project exists yet.");
  const out = arg("out") ? path.resolve(arg("out")!) : defaultExportDir();
  const res = await exportStaticSite(project.id, out);
  console.log(`Exported "${project.name}" to ${res.outDir}`);
  console.log(`${res.files} media files, ${(res.bytes / 1024 / 1024).toFixed(1)} MB (published ${res.publishedAt}).`);
  await (await getDb()).close();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
