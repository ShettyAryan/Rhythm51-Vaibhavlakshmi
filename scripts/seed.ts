/**
 * Seeds a DEVELOPMENT/DEMO project from seed/demo/manifest.json.
 *
 *   npm run db:seed              # creates the demo project if no project exists
 *   npm run db:seed -- --force   # adds the demo project even if others exist
 *
 * Demo panoramas and plans are synthetic and watermarked as such. The hero image,
 * logo, brochure and floor-plan PDF come from the builder-supplied brochure in
 * /references when present. Replace everything through the admin panel before
 * going live.
 *
 * Optional: SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD create an admin account too
 * (used by the automated tests; never commit real credentials).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getDb, query } from "../lib/db";
import { importFile } from "../lib/content/assets";
import {
  createAccessPoint,
  createFloorPlan,
  createGroup,
  createProject,
  updateAccessPoint,
  updateFloorPlan,
  updateGroup,
  updateProject,
  updateTour,
  upsertDocument,
} from "../lib/content/manage";
import { publishProject } from "../lib/content/publish";
import type { AssetCategory } from "../lib/content/rows";
import { createAdmin } from "./create-admin";

interface ManifestAp {
  key: string;
  group: string;
  name: string;
  panorama: string;
  initialYaw: number;
  initialPitch: number;
  initialFov: number;
  headingOffset: number;
  marker: { x: number; y: number };
  hotspots: { to: string; label: string; yaw: number; pitch: number; style: "ring" | "arrow" | "door" }[];
}
interface Manifest {
  hero?: string;
  logo?: string;
  floorPlanPdf?: string;
  brochurePdf?: string;
  tours: Record<"rooms" | "amenities", { plan: { file: string; name: string }; groups: { key: string; name: string }[]; accessPoints: ManifestAp[] }>;
}

const ROOT = process.cwd();
const DEMO = path.join(ROOT, "seed", "demo");

async function main() {
  const force = process.argv.includes("--force");
  const manifestPath = path.join(DEMO, "manifest.json");
  if (!existsSync(manifestPath)) throw new Error("seed/demo/manifest.json missing. Run `npm run demo:assets` first.");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;

  await getDb();
  if (process.env.SEED_ADMIN_EMAIL && process.env.SEED_ADMIN_PASSWORD) {
    await createAdmin(process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD, "Seed admin", { upsert: true });
  }
  const existing = await query<{ id: string }>("select id from projects");
  if (existing.length && !force) {
    console.log("A project already exists; nothing seeded (use --force to add the demo project anyway).");
    return;
  }
  const slug = existing.length ? `demo-${Date.now().toString(36)}` : "rhythm-51";
  const project = await createProject("Rhythm 51", slug);
  const pid = project.id;

  const mime = (f: string) =>
    f.endsWith(".pdf") ? "application/pdf" : f.endsWith(".png") ? "image/png" : f.endsWith(".webp") ? "image/webp" : "image/jpeg";
  const importAsset = async (file: string, category: AssetCategory, displayName?: string) => {
    const full = path.isAbsolute(file) ? file : file.startsWith("references/") ? path.join(ROOT, file) : path.join(DEMO, file);
    const asset = await importFile(pid, {
      fileName: displayName ?? path.basename(full),
      mimeType: mime(full),
      data: readFileSync(full),
      category,
    });
    console.log(`  imported ${asset.file_name}`);
    return asset.id;
  };

  console.log("Importing media…");
  const heroId = manifest.hero ? await importAsset(manifest.hero, "image", "hero-night-entrance.jpg") : null;
  const logoId = manifest.logo ? await importAsset(manifest.logo, "image", "rhythm-51-logo.png") : null;

  await updateProject(pid, {
    name: "Rhythm 51",
    developerName: "Vaibhavlaxmi",
    heroAssetId: heroId,
    logoAssetId: logoId,
    heroHeadline: "Live to the Rhythm of Bandra",
    heroSubtitle: "",
    showHeroText: true,
    heroOverlay: 0.35,
    status: "published",
  });

  for (const type of ["rooms", "amenities"] as const) {
    const t = manifest.tours[type];
    console.log(`Building ${type} tour…`);
    const planImage = await importAsset(t.plan.file, "floor_plan_image");
    const plan = (await createFloorPlan(pid, t.plan.name))!;
    await updateFloorPlan(pid, plan.id, { imageAssetId: planImage, orientationOffset: 0, status: "published" });

    const groupIds = new Map<string, string>();
    for (const g of t.groups) {
      const created = (await createGroup(pid, type, g.name))!;
      await updateGroup(pid, created.id, { floorPlanId: plan.id, status: "published" });
      groupIds.set(g.key, created.id);
    }
    const apIds = new Map<string, string>();
    for (const ap of t.accessPoints) {
      const created = await createAccessPoint(pid, groupIds.get(ap.group)!, ap.name);
      apIds.set(ap.key, created.id);
    }
    for (const ap of t.accessPoints) {
      const panoId = await importAsset(ap.panorama, "panorama");
      await updateAccessPoint(pid, apIds.get(ap.key)!, {
        panoramaAssetId: panoId,
        initialYaw: ap.initialYaw,
        initialPitch: ap.initialPitch,
        initialFov: ap.initialFov,
        floorPlanId: plan.id,
        marker: ap.marker,
        headingOffset: ap.headingOffset,
        status: "published",
        hotspots: ap.hotspots.map((h) => ({
          destinationAccessPointId: apIds.get(h.to)!,
          label: h.label,
          yaw: h.yaw,
          pitch: h.pitch,
          style: h.style,
        })),
      });
    }
    await updateTour(pid, type, {
      name: type === "rooms" ? "Apartment Tour" : "Amenities Tour",
      status: "published",
      defaultAccessPointId: apIds.get(t.accessPoints[0]!.key)!,
    });
  }

  console.log("Documents…");
  if (manifest.floorPlanPdf) {
    const id = await importAsset(manifest.floorPlanPdf, "pdf", "rhythm-51-floor-plans.pdf");
    await upsertDocument(pid, "floor_plan", { assetId: id, title: "Floor Plans", status: "published", allowDownload: true });
  }
  if (manifest.brochurePdf && existsSync(path.join(ROOT, manifest.brochurePdf))) {
    const id = await importAsset(manifest.brochurePdf, "pdf", "rhythm-51-brochure.pdf");
    await upsertDocument(pid, "brochure", { assetId: id, title: "Brochure", status: "published", allowDownload: false });
  }

  const pub = await publishProject(pid, null);
  console.log(`Seeded project "${slug}" and published snapshot ${pub.publication.id}.`);
}

main()
  .then(async () => {
    await (await getDb()).close();
  })
  .catch(async (err) => {
    console.error(err);
    process.exitCode = 1;
  });
