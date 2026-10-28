import { adminRoute, readJson, uuid } from "@/lib/api";
import { reorderAccessPoints } from "@/lib/content/manage";
import { afterContentChange } from "@/lib/content/publish";
import { reorderSchema } from "@/lib/validation";

export const POST = adminRoute<{ id: string }>(async ({ project, user, request }, { id }) => {
  const { ids } = await readJson(request, reorderSchema);
  await reorderAccessPoints(project.id, uuid.parse(id), ids);
  await afterContentChange(project.id, user.id);
  return { ok: true };
});
