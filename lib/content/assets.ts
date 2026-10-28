import { randomBytes } from "node:crypto";
import { ApiError } from "../errors";
import { isPanoramaAspect, PANORAMA_ASPECT } from "../tour/geometry";
import { getDb, query, queryOne, type Queryable } from "../db";
import { getStorage } from "../storage";
import { IMAGE_MIME, MAX_IMAGE_BYTES, MAX_PDF_BYTES } from "../validation";
import { collectGarbage, markGarbage } from "./publish";
import type { AssetCategory, AssetMetadata, AssetRow } from "./rows";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export const VARIANT_WIDTHS = { thumb: 640, md: 2048, lg: 4096 } as const;
/** Panoramas larger than this (or any PNG) also get a full-resolution WebP copy. */
const FULL_VARIANT_THRESHOLD = 12 * 1024 * 1024;

function newKey(projectId: string, assetId: string, ext: string, suffix = "") {
  return `${projectId}/${assetId}/${randomBytes(8).toString("hex")}${suffix}.${ext}`;
}

export function assertCategoryMime(category: AssetCategory, mime: string, size: number) {
  const isImage = (IMAGE_MIME as readonly string[]).includes(mime);
  if (category === "pdf" && mime !== "application/pdf") throw new ApiError(400, "Only PDF files can be uploaded as documents.");
  if (category !== "pdf" && !isImage) throw new ApiError(400, "Only JPEG, PNG or WebP images are accepted here.");
  const max = category === "pdf" ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
  if (size > max) throw new ApiError(413, `File is too large (max ${Math.round(max / 1024 / 1024)} MB).`);
}

/** Step 1: register an upload and get a target URL for the browser to PUT to. */
export async function createUpload(
  projectId: string,
  input: { fileName: string; mimeType: string; size: number; category: AssetCategory },
) {
  assertCategoryMime(input.category, input.mimeType, input.size);
  const row = await queryOne<{ id: string }>(
    `insert into assets (project_id, category, status, file_name, mime_type, file_size, metadata)
     values ($1, $2, 'uploading', $3, $4, $5, $6::jsonb) returning id`,
    [projectId, input.category, input.fileName, input.mimeType, input.size,
      JSON.stringify({ pendingMime: input.mimeType, pendingFileName: input.fileName, pendingSize: input.size })],
  );
  return startPending(projectId, row!.id, input.mimeType);
}

/** Step 1 (replacement): upload a new file for an existing asset, keeping its id. */
export async function createReplacement(
  projectId: string,
  assetId: string,
  input: { fileName: string; mimeType: string; size: number },
) {
  const asset = await getAsset(projectId, assetId);
  if (asset.category === "pdf" ? input.mimeType !== "application/pdf" : !input.mimeType.startsWith("image/")) {
    throw new ApiError(400, "A replacement must be the same kind of file (image or PDF).");
  }
  assertCategoryMime(asset.category, input.mimeType, input.size);
  await query(
    `update assets set metadata = metadata || $2::jsonb where id = $1`,
    [assetId, JSON.stringify({ pendingMime: input.mimeType, pendingFileName: input.fileName, pendingSize: input.size })],
  );
  return startPending(projectId, assetId, input.mimeType);
}

async function startPending(projectId: string, assetId: string, mime: string) {
  const key = newKey(projectId, assetId, EXT[mime] ?? "bin");
  await query("update assets set pending_key = $2, updated_at = now() where id = $1", [assetId, key]);
  const storage = await getStorage();
  const target = await storage.createUploadTarget(key, mime, assetId);
  return { assetId, upload: { method: "PUT" as const, ...target } };
}

/** Local driver only: receives the raw body for a pending upload. */
export async function receiveLocalUpload(projectId: string, assetId: string, request: Request) {
  const asset = await getAsset(projectId, assetId);
  if (!asset.pending_key) throw new ApiError(409, "No upload is pending for this asset.");
  const declared = Number(asset.metadata.pendingSize ?? 0);
  const limit = asset.category === "pdf" ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
  if (!request.body) throw new ApiError(400, "Empty upload");
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = request.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit || (declared && total > declared)) {
      await reader.cancel();
      throw new ApiError(413, "Upload is larger than declared or allowed.");
    }
    chunks.push(value);
  }
  const storage = await getStorage();
  await storage.put(asset.pending_key, Buffer.concat(chunks), asset.metadata.pendingMime ?? asset.mime_type);
  return { received: total };
}

function sniffMime(head: Buffer): string | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (head.length >= 12 && head.toString("ascii", 0, 4) === "RIFF" && head.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (head.length >= 5 && head.toString("ascii", 0, 5) === "%PDF-") return "application/pdf";
  return null;
}

/**
 * Step 2: verify the uploaded bytes (magic number must match the declared type),
 * read dimensions, generate downscaled variants, and atomically swap the asset to
 * the new file. The previous file is retained until no publication references it.
 */
export async function finalizeUpload(projectId: string, assetId: string) {
  const asset = await getAsset(projectId, assetId);
  if (!asset.pending_key) throw new ApiError(409, "No upload is pending for this asset.");
  const storage = await getStorage();
  const info = await storage.head(asset.pending_key);
  if (!info || info.size === 0) throw new ApiError(400, "The file did not finish uploading.");

  const declaredMime = asset.metadata.pendingMime ?? asset.mime_type;
  const sniffed = sniffMime(await storage.read(asset.pending_key, 0, 16));
  if (sniffed !== declaredMime) {
    await storage.delete(asset.pending_key);
    await query("update assets set pending_key = null where id = $1", [assetId]);
    throw new ApiError(400, "File contents do not match its type. Upload a genuine JPEG, PNG, WebP or PDF.");
  }

  let width: number | null = null;
  let height: number | null = null;
  const variants: AssetMetadata["variants"] = {};
  if (declaredMime.startsWith("image/")) {
    const sharp = (await import("sharp")).default;
    const buffer = await storage.read(asset.pending_key);
    let meta;
    try {
      meta = await sharp(buffer, { limitInputPixels: 300_000_000 }).metadata();
    } catch {
      throw new ApiError(400, "The image could not be decoded.");
    }
    width = meta.width ?? null;
    height = meta.height ?? null;
    if (!width || !height) throw new ApiError(400, "The image has no dimensions.");
    if (asset.category === "panorama" && !isPanoramaAspect(width, height)) {
      throw new ApiError(400, `Panoramas must be full 360° equirectangular images, ${PANORAMA_ASPECT.label} (got ${width}×${height}).`);
    }
    for (const [name, target] of Object.entries(VARIANT_WIDTHS) as [keyof typeof VARIANT_WIDTHS, number][]) {
      if (width <= target * 1.15) continue;
      const out = await sharp(buffer, { limitInputPixels: 300_000_000 })
        .rotate()
        .resize({ width: target })
        .webp({ quality: asset.category === "floor_plan_image" ? 90 : 82 })
        .toBuffer({ resolveWithObject: true });
      const key = newKey(projectId, assetId, "webp", `-${name}`);
      await storage.put(key, out.data, "image/webp");
      variants[name] = { key, width: out.info.width, height: out.info.height };
    }

    // Heavy panoramas (e.g. a 40 MB PNG render) get a full-resolution, web-optimised
    // copy that visitors download instead of the original. The original is kept.
    if (asset.category === "panorama" && (declaredMime === "image/png" || info.size > FULL_VARIANT_THRESHOLD)) {
      const out = await sharp(buffer, { limitInputPixels: 300_000_000 })
        .rotate()
        .webp({ quality: 90, smartSubsample: true, effort: 4 })
        .toBuffer({ resolveWithObject: true });
      if (out.data.length < info.size) {
        const key = newKey(projectId, assetId, "webp", "-full");
        await storage.put(key, out.data, "image/webp");
        variants.full = { key, width: out.info.width, height: out.info.height };
      }
    }
  }

  const db = await getDb();
  await db.transaction(async (tx) => {
    const oldKeys = [asset.storage_key, ...Object.values(asset.metadata.variants ?? {}).map((v) => v?.key)];
    await markGarbage(tx, oldKeys);
    const { pendingMime, pendingFileName, pendingSize, ...rest } = asset.metadata;
    void pendingMime; void pendingSize;
    await tx.query(
      `update assets set status = 'ready', storage_key = pending_key, pending_key = null,
              mime_type = $2, file_name = $3, file_size = $4, width = $5, height = $6,
              version = case when storage_key is null then version else version + 1 end,
              metadata = $7::jsonb, updated_at = now()
        where id = $1`,
      [assetId, declaredMime, pendingFileName ?? asset.file_name, info.size, width, height,
        JSON.stringify({ ...rest, variants })],
    );
  });
  await collectGarbage(db).catch(() => undefined);
  return getAsset(projectId, assetId);
}

export async function getAsset(projectId: string, assetId: string): Promise<AssetRow> {
  const a = await queryOne<AssetRow>("select * from assets where id = $1 and project_id = $2", [assetId, projectId]);
  if (!a) throw new ApiError(404, "Asset not found");
  return a;
}

export interface AssetUsage {
  kind: string;
  id: string;
  name: string;
  href: string;
  published: boolean;
}

/** Everything that references an asset (shown in the media library, blocks deletion). */
export async function assetUsage(db: Queryable, assetId: string): Promise<AssetUsage[]> {
  const rows = (
    await db.query<AssetUsage>(
      `select 'Project settings' as kind, p.id, p.name, '/admin/settings' as href, p.status = 'published' as published
         from projects p where p.logo_asset_id = $1 or p.hero_asset_id = $1
       union all
       select case when t.type = 'rooms' then 'Room thumbnail' else 'Amenity thumbnail' end, g.id, g.name,
              '/admin/tours/' || t.type, g.status = 'published'
         from tour_groups g join tours t on t.id = g.tour_id where g.thumbnail_asset_id = $1
       union all
       select case when ap.panorama_asset_id = $1 then 'Access point panorama' else 'Access point thumbnail' end,
              ap.id, g.name || ' — ' || ap.name, '/admin/access-points/' || ap.id, ap.status = 'published'
         from access_points ap join tour_groups g on g.id = ap.group_id
        where ap.panorama_asset_id = $1 or ap.thumbnail_asset_id = $1
       union all
       select 'Floor plan', f.id, f.name, '/admin/floor-plans/' || f.id, f.status = 'published'
         from floor_plans f where f.image_asset_id = $1 or f.original_pdf_asset_id = $1
       union all
       select case when d.type = 'brochure' then 'Brochure document' else 'Floor plan document' end, d.id,
              coalesce(nullif(d.title, ''), d.type), '/admin/documents', d.status = 'published'
         from documents d where d.asset_id = $1`,
      [assetId],
    )
  ).rows;
  return rows;
}

export async function deleteAsset(projectId: string, assetId: string) {
  const asset = await getAsset(projectId, assetId);
  const db = await getDb();
  const usage = await assetUsage(db, assetId);
  if (usage.length) {
    throw new ApiError(409, "This file is still used. Remove it from the listed content first.", usage);
  }
  await db.transaction(async (tx) => {
    await markGarbage(tx, [
      asset.storage_key,
      asset.pending_key,
      ...Object.values(asset.metadata.variants ?? {}).map((v) => v?.key),
    ]);
    await tx.query("delete from assets where id = $1", [assetId]);
  });
  await collectGarbage(db).catch(() => undefined);
}

/** Abandoned uploads (never finalised) older than a day are removed. */
export async function purgeStaleUploads(projectId: string) {
  const stale = await query<AssetRow>(
    "select * from assets where project_id = $1 and status = 'uploading' and updated_at < now() - interval '1 day'",
    [projectId],
  );
  for (const a of stale) {
    const storage = await getStorage();
    if (a.pending_key) await storage.delete(a.pending_key).catch(() => undefined);
    await query("delete from assets where id = $1", [a.id]).catch(() => undefined);
  }
}

/** Server-side import used by the seed script (bypasses the browser upload step). */
export async function importFile(
  projectId: string,
  file: { fileName: string; mimeType: string; data: Buffer; category: AssetCategory },
) {
  const { assetId } = await createUpload(projectId, {
    fileName: file.fileName,
    mimeType: file.mimeType,
    size: file.data.length,
    category: file.category,
  });
  const asset = await getAsset(projectId, assetId);
  const storage = await getStorage();
  await storage.put(asset.pending_key!, file.data, file.mimeType);
  return finalizeUpload(projectId, assetId);
}
