import { adminRoute, ApiError, readJson } from "@/lib/api";
import { upsertDocument } from "@/lib/content/manage";
import { afterContentChange } from "@/lib/content/publish";
import { documentUpdateSchema } from "@/lib/validation";

export const PATCH = adminRoute<{ type: string }>(async ({ project, user, request }, { type }) => {
  if (type !== "floor_plan" && type !== "brochure") throw new ApiError(404, "Unknown document type");
  await upsertDocument(project.id, type, await readJson(request, documentUpdateSchema));
  await afterContentChange(project.id, user.id);
  return { ok: true };
});
