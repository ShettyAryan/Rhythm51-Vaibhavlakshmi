import { adminRoute, readJson, uuid } from "@/lib/api";
import { assetUsage, deleteAsset, getAsset } from "@/lib/content/assets";
import { afterContentChange } from "@/lib/content/publish";
import { toAdminAsset } from "@/lib/content/queries";
import { getDb, query } from "@/lib/db";
import { assetUpdateSchema } from "@/lib/validation";

type P = { id: string };

export const GET = adminRoute<P>(async ({ project }, { id }) => {
  const asset = await getAsset(project.id, uuid.parse(id));
  return { asset: toAdminAsset(asset), usage: await assetUsage(await getDb(), asset.id) };
});

export const PATCH = adminRoute<P>(async ({ project, request }, { id }) => {
  const asset = await getAsset(project.id, uuid.parse(id));
  const input = await readJson(request, assetUpdateSchema);
  if (input.fileName) await query("update assets set file_name = $2, updated_at = now() where id = $1", [asset.id, input.fileName]);
  return { asset: toAdminAsset(await getAsset(project.id, asset.id)) };
});

export const DELETE = adminRoute<P>(async ({ project, user }, { id }) => {
  await deleteAsset(project.id, uuid.parse(id));
  await afterContentChange(project.id, user.id);
  return { ok: true };
});
