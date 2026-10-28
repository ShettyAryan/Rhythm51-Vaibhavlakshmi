import { adminRoute, readJson } from "@/lib/api";
import { createUpload, purgeStaleUploads } from "@/lib/content/assets";
import { listAssets } from "@/lib/content/queries";
import { ASSET_CATEGORIES } from "@/lib/content/rows";
import { uploadRequestSchema } from "@/lib/validation";

export const GET = adminRoute(async ({ project, request }) => {
  const category = new URL(request.url).searchParams.get("category");
  const valid = category && (ASSET_CATEGORIES as string[]).includes(category) ? category : undefined;
  await purgeStaleUploads(project.id);
  return { assets: await listAssets(project.id, valid) };
});

/** Step 1 of an upload: validates the declared file and returns where to PUT it. */
export const POST = adminRoute(async ({ project, request }) => {
  const input = await readJson(request, uploadRequestSchema);
  return createUpload(project.id, input);
});
