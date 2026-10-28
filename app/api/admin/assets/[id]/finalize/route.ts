import { adminRoute, uuid } from "@/lib/api";
import { finalizeUpload } from "@/lib/content/assets";
import { afterContentChange } from "@/lib/content/publish";
import { toAdminAsset } from "@/lib/content/queries";

/** Step 2 of an upload: verifies the file, extracts metadata and builds variants. */
export const POST = adminRoute<{ id: string }>(async ({ project, user }, { id }) => {
  const asset = await finalizeUpload(project.id, uuid.parse(id));
  await afterContentChange(project.id, user.id);
  return { asset: toAdminAsset(asset) };
});
