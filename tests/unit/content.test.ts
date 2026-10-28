import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createUpload, deleteAsset, finalizeUpload, getAsset, importFile } from "@/lib/content/assets";
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
} from "@/lib/content/manage";
import { getLatestPublication, getPublishedAssetKey, publishProject } from "@/lib/content/publish";
import { buildSnapshot } from "@/lib/content/snapshot";
import { openTestDatabase, setDbForTesting, type Database } from "@/lib/db";
import { setStorageForTesting } from "@/lib/storage";
import { createLocalStorage } from "@/lib/storage/local";

let db: Database;
let dir: string;
const ids: Record<string, string> = {};

const png = (w: number, h: number, color = "#56163b") =>
  sharp({ create: { width: w, height: h, channels: 3, background: color } }).png().toBuffer();

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "tour-test-"));
  db = await openTestDatabase();
  setDbForTesting(db);
  setStorageForTesting(createLocalStorage(dir));

  const p = await createProject("Test Tower", "test-tower");
  ids.project = p.id;
  await updateProject(p.id, { status: "published" });
  const pano = async (name: string) =>
    (await importFile(p.id, { fileName: name, mimeType: "image/png", data: await png(400, 200), category: "panorama" })).id;

  const planImg = (await importFile(p.id, { fileName: "plan.png", mimeType: "image/png", data: await png(300, 200, "#ffffff"), category: "floor_plan_image" })).id;
  ids.plan = (await createFloorPlan(p.id, "Plan A"))!.id;
  await updateFloorPlan(p.id, ids.plan, { imageAssetId: planImg, status: "published", orientationOffset: 10 });

  ids.living = (await createGroup(p.id, "rooms", "Living"))!.id;
  ids.kitchen = (await createGroup(p.id, "rooms", "Kitchen"))!.id;
  ids.secret = (await createGroup(p.id, "rooms", "Secret Room"))!.id;
  for (const g of [ids.living, ids.kitchen]) await updateGroup(p.id, g, { status: "published", floorPlanId: ids.plan });

  ids.apA = (await createAccessPoint(p.id, ids.living, "Entrance")).id;
  ids.apB = (await createAccessPoint(p.id, ids.living, "Window")).id;
  ids.apK = (await createAccessPoint(p.id, ids.kitchen, "Kitchen View")).id;
  ids.apS = (await createAccessPoint(p.id, ids.secret, "Secret View")).id;
  ids.apDraft = (await createAccessPoint(p.id, ids.kitchen, "Unfinished")).id;
  ids.panoA = await pano("a.png");

  await updateAccessPoint(p.id, ids.apA, {
    panoramaAssetId: ids.panoA,
    status: "published",
    marker: { x: 0.25, y: 0.5 },
    headingOffset: 90,
    hotspots: [
      { destinationAccessPointId: ids.apB, label: "", yaw: 10, pitch: -20, style: "ring" },
      { destinationAccessPointId: ids.apK, label: "To kitchen", yaw: 90, pitch: 0, style: "door" },
      { destinationAccessPointId: ids.apS, label: "Secret", yaw: -90, pitch: 0, style: "door" },
      { destinationAccessPointId: ids.apDraft, label: "Draft", yaw: 180, pitch: 0, style: "door" },
    ],
  });
  await updateAccessPoint(p.id, ids.apB, { panoramaAssetId: await pano("b.png"), status: "published", hotspots: [{ destinationAccessPointId: ids.apA, label: "", yaw: 0, pitch: 0, style: "ring" }] });
  await updateAccessPoint(p.id, ids.apK, { panoramaAssetId: await pano("k.png"), status: "published" });
  await updateAccessPoint(p.id, ids.apS, { panoramaAssetId: await pano("s.png"), status: "published" }); // group is draft
  await updateAccessPoint(p.id, ids.apDraft, { panoramaAssetId: await pano("d.png") }); // AP itself is draft
  await updateTour(p.id, "rooms", { status: "published", defaultAccessPointId: ids.apA });

  ids.pdf = (await importFile(p.id, { fileName: "brochure.pdf", mimeType: "application/pdf", data: Buffer.from("%PDF-1.4\n%test\n"), category: "pdf" })).id;
  await upsertDocument(p.id, "brochure", { assetId: ids.pdf, status: "published", allowDownload: false });
});

afterAll(async () => {
  setDbForTesting(undefined);
  setStorageForTesting(undefined);
  await db?.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("published snapshot", () => {
  it("contains only published content and prunes hotspots to hidden destinations", async () => {
    const built = (await buildSnapshot(db, ids.project!, { mode: "published" }))!;
    const rooms = built.snapshot.tours.rooms!;
    expect(rooms.groups.map((g) => g.name)).toEqual(["Living", "Kitchen"]);
    const allAps = rooms.groups.flatMap((g) => g.accessPoints.map((a) => a.name));
    expect(allAps).toEqual(["Entrance", "Window", "Kitchen View"]);
    expect(allAps).not.toContain("Unfinished");
    expect(allAps).not.toContain("Secret View");

    const entrance = rooms.groups[0]!.accessPoints[0]!;
    expect(entrance.hotspots.map((h) => h.destinationId)).toEqual([ids.apB, ids.apK]);
    expect(entrance.marker).toEqual({ x: 0.25, y: 0.5 });
    expect(entrance.headingOffset).toBe(90);
    expect(entrance.floorPlanId).toBe(ids.plan);
    expect(rooms.floorPlans[ids.plan!]!.orientationOffset).toBe(10);
    expect(rooms.defaultAccessPointId).toBe(ids.apA);
    // Published URLs are served from the frozen publication.
    expect(entrance.panorama!.url).toContain("p=1");
    expect(built.snapshot.tours.amenities).toBeNull();
    expect(built.snapshot.documents.brochure?.downloadUrl).toBeNull();
    expect(built.snapshot.documents.floorPlan).toBeNull();
  });

  it("preview with drafts includes draft rooms and viewpoints", async () => {
    const built = (await buildSnapshot(db, ids.project!, { mode: "preview", includeDrafts: true }))!;
    const names = built.snapshot.tours.rooms!.groups.flatMap((g) => g.accessPoints.map((a) => a.name));
    expect(names).toEqual(expect.arrayContaining(["Unfinished", "Secret View"]));
    expect(built.snapshot.tours.rooms!.groups[0]!.accessPoints[0]!.panorama!.url).not.toContain("p=1");
  });

  it("publishing freezes files: a replaced file stays private until republished", async () => {
    await publishProject(ids.project!, null);
    const before = await getPublishedAssetKey(ids.panoA!);
    expect(before?.key).toBeTruthy();

    // Replace the panorama with a new file.
    const { assetId } = await (await import("@/lib/content/assets")).createReplacement(ids.project!, ids.panoA!, {
      fileName: "a2.png",
      mimeType: "image/png",
      size: 1,
    });
    const asset = await getAsset(ids.project!, assetId);
    const { getStorage } = await import("@/lib/storage");
    await (await getStorage()).put(asset.pending_key!, await png(400, 200, "#00ff00"), "image/png");
    const replaced = await finalizeUpload(ids.project!, assetId);
    expect(replaced.version).toBe(2);
    expect(replaced.storage_key).not.toBe(before!.key);

    // Public key is unchanged and the old file still exists until republish.
    expect((await getPublishedAssetKey(ids.panoA!))!.key).toBe(before!.key);
    expect(await (await getStorage()).head(before!.key)).not.toBeNull();

    await publishProject(ids.project!, null);
    expect((await getPublishedAssetKey(ids.panoA!))!.key).toBe(replaced.storage_key);
    const latest = await getLatestPublication(ids.project!);
    expect(latest?.snapshot.tours.rooms?.groups.length).toBe(2);
  });

  it("assets are not public when the project is offline", async () => {
    await updateProject(ids.project!, { status: "draft" });
    expect(await getPublishedAssetKey(ids.panoA!)).toBeNull();
    await updateProject(ids.project!, { status: "published" });
    expect(await getPublishedAssetKey(ids.panoA!)).not.toBeNull();
  });
});

describe("integrity rules", () => {
  it("refuses to delete a file that is in use", async () => {
    await expect(deleteAsset(ids.project!, ids.panoA!)).rejects.toThrow(/still used/);
  });

  it("rejects files whose contents do not match the declared type", async () => {
    const { assetId } = await createUpload(ids.project!, { fileName: "fake.png", mimeType: "image/png", size: 20, category: "image" });
    const asset = await getAsset(ids.project!, assetId);
    const { getStorage } = await import("@/lib/storage");
    await (await getStorage()).put(asset.pending_key!, Buffer.from("<script>alert(1)</script>"), "image/png");
    await expect(finalizeUpload(ids.project!, assetId)).rejects.toThrow(/do not match/);
  });

  it("accepts 2:1 and 16:9 full-sphere panoramas, rejects other shapes", async () => {
    const wide = await importFile(ids.project!, { fileName: "uhd.png", mimeType: "image/png", data: await png(768, 432), category: "panorama" });
    expect([wide.width, wide.height]).toEqual([768, 432]);
    await expect(
      importFile(ids.project!, { fileName: "square.png", mimeType: "image/png", data: await png(300, 300), category: "panorama" }),
    ).rejects.toThrow(/360/);
    await expect(
      importFile(ids.project!, { fileName: "ultra.png", mimeType: "image/png", data: await png(900, 300), category: "panorama" }),
    ).rejects.toThrow(/360/);
  });

  it("rejects hotspots to other tours, to itself, and assets of other projects", async () => {
    const other = await createProject("Other", "other-project");
    const amenityGroup = (await createGroup(ids.project!, "amenities", "Pool"))!.id;
    const amenityAp = (await createAccessPoint(ids.project!, amenityGroup, "Deck")).id;
    await expect(
      updateAccessPoint(ids.project!, ids.apK!, { hotspots: [{ destinationAccessPointId: amenityAp, label: "", yaw: 0, pitch: 0, style: "ring" }] }),
    ).rejects.toThrow(/same tour/);
    await expect(
      updateAccessPoint(ids.project!, ids.apK!, { hotspots: [{ destinationAccessPointId: ids.apK!, label: "", yaw: 0, pitch: 0, style: "ring" }] }),
    ).rejects.toThrow(/itself/);
    const foreign = (await importFile(other.id, { fileName: "x.png", mimeType: "image/png", data: await png(400, 200), category: "panorama" })).id;
    await expect(updateAccessPoint(ids.project!, ids.apK!, { panoramaAssetId: foreign })).rejects.toThrow(/not found/);
    // Other project cannot edit this project's content.
    await expect(updateAccessPoint(other.id, ids.apK!, { name: "Hacked" })).rejects.toThrow(/not found/);
  });

  it("deleting a destination removes hotspots pointing at it", async () => {
    const { deleteAccessPoint } = await import("@/lib/content/manage");
    await deleteAccessPoint(ids.project!, ids.apB!);
    const rows = (await db.query("select * from hotspots where destination_access_point_id = $1", [ids.apB])).rows;
    expect(rows).toHaveLength(0);
  });
});

describe("publishing drafts in bulk", () => {
  it("reports drafts, then publishes only items that are ready", async () => {
    const { draftSummary, publishReadyDrafts } = await import("@/lib/content/manage");
    const before = await draftSummary(ids.project!);
    expect(before.viewpoints).toBeGreaterThanOrEqual(1); // "Unfinished" has a panorama but is Draft
    expect(before.rooms).toBeGreaterThanOrEqual(1); // "Secret Room" is Draft

    const marked = await publishReadyDrafts(ids.project!);
    expect(marked.viewpoints).toBeGreaterThanOrEqual(1);
    await publishProject(ids.project!, null);
    const built = (await buildSnapshot(db, ids.project!, { mode: "published" }))!;
    const names = built.snapshot.tours.rooms!.groups.flatMap((g) => g.accessPoints.map((a) => a.name));
    expect(names).toEqual(expect.arrayContaining(["Unfinished", "Secret View"]));

    // A viewpoint without a panorama (and its otherwise-empty amenity/tour) stays Draft.
    const after = await draftSummary(ids.project!);
    expect(after.viewpoints).toBe(0);
    expect(after.viewpointsMissingPanorama).toBeGreaterThanOrEqual(1);
    const pool = (await db.query<{ status: string }>("select status from tour_groups where name = 'Pool'")).rows[0];
    expect(pool?.status).toBe("draft");
  });
});
