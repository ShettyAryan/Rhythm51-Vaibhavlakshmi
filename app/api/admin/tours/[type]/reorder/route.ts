import { adminRoute, parseTourType, readJson } from "@/lib/api";
import { reorderGroups } from "@/lib/content/manage";
import { afterContentChange } from "@/lib/content/publish";
import { reorderSchema } from "@/lib/validation";

export const POST = adminRoute<{ type: string }>(async ({ project, user, request }, { type }) => {
  const { ids } = await readJson(request, reorderSchema);
  await reorderGroups(project.id, parseTourType(type), ids);
  await afterContentChange(project.id, user.id);
  return { ok: true };
});
