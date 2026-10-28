import { adminRoute, readJson, uuid } from "@/lib/api";
import { deleteGroup, updateGroup } from "@/lib/content/manage";
import { afterContentChange } from "@/lib/content/publish";
import { groupUpdateSchema } from "@/lib/validation";

type P = { id: string };

export const PATCH = adminRoute<P>(async ({ project, user, request }, { id }) => {
  await updateGroup(project.id, uuid.parse(id), await readJson(request, groupUpdateSchema));
  await afterContentChange(project.id, user.id);
  return { ok: true };
});

export const DELETE = adminRoute<P>(async ({ project, user }, { id }) => {
  await deleteGroup(project.id, uuid.parse(id));
  await afterContentChange(project.id, user.id);
  return { ok: true };
});
