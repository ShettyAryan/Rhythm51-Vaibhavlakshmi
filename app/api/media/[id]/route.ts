import { getCurrentAdmin } from "@/lib/auth/session";
import { getPublishedAssetKey } from "@/lib/content/publish";
import type { AssetRow } from "@/lib/content/rows";
import { queryOne } from "@/lib/db";
import { getStorage } from "@/lib/storage";

const VARIANTS = new Set(["thumb", "md", "lg", "full"]);

/**
 * Serves media files.
 *
 *  ?p=1  → published URL: served only if the asset is part of the latest
 *          publication of a live project, using the exact file frozen at
 *          publish time (later replacements stay private until republished).
 *  else  → draft URL: admin session required; serves the current file.
 *
 * `v` (version) only busts caches; `variant` picks a downscaled rendition;
 * `download=1` forces a download (only honoured when the publication allows it,
 * which the snapshot reflects by exposing a download URL).
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const variant = url.searchParams.get("variant");
  if (variant && !VARIANTS.has(variant)) return new Response("Bad variant", { status: 400 });
  const download = url.searchParams.get("download") === "1";
  const range = request.headers.get("range");
  const storage = await getStorage();

  if (url.searchParams.get("p") === "1") {
    const entry = await getPublishedAssetKey(id);
    if (!entry) return new Response("Not found", { status: 404 });
    const key = variant ? (entry.variants[variant] ?? entry.key) : entry.key;
    const isVariant = !!variant && !!entry.variants[variant];
    return storage.serve(key, {
      contentType: isVariant ? "image/webp" : entry.mime,
      range,
      // Published URLs are content-addressed by version, so they can be cached.
      cacheControl: "public, max-age=86400, stale-while-revalidate=604800",
      fileName: entry.mime === "application/pdf" ? entry.fileName : undefined,
      download: download && entry.mime === "application/pdf",
    });
  }

  const admin = await getCurrentAdmin();
  if (!admin) return new Response("Not found", { status: 404 });
  const asset = await queryOne<AssetRow>("select * from assets where id = $1 and status = 'ready'", [id]);
  if (!asset?.storage_key) return new Response("Not found", { status: 404 });
  const v = variant ? asset.metadata.variants?.[variant as "thumb"] : undefined;
  return storage.serve(v?.key ?? asset.storage_key, {
    contentType: v ? "image/webp" : asset.mime_type,
    range,
    cacheControl: "private, max-age=3600",
    fileName: asset.file_name,
    download,
  });
}
