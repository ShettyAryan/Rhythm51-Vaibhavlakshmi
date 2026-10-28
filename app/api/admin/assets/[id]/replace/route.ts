import { adminRoute, readJson, uuid } from "@/lib/api";
import { createReplacement } from "@/lib/content/assets";
import { uploadRequestSchema } from "@/lib/validation";

/** Starts uploading a replacement file for an existing asset (same id, new version). */
export const POST = adminRoute<{ id: string }>(async ({ project, request }, { id }) => {
  const input = await readJson(request, uploadRequestSchema.omit({ category: true }));
  return createReplacement(project.id, uuid.parse(id), input);
});
