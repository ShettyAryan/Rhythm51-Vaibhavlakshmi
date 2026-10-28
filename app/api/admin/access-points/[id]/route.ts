import { adminRoute, ApiError, readJson, uuid } from "@/lib/api";
import { deleteAccessPoint, updateAccessPoint } from "@/lib/content/manage";
import { afterContentChange } from "@/lib/content/publish";
import { getAccessPointForEditor } from "@/lib/content/queries";
import { accessPointUpdateSchema } from "@/lib/validation";

type P = { id: string };

export const GET = adminRoute<P>(async ({ project }, { id }) => {
  const ap = await getAccessPointForEditor(project.id, uuid.parse(id));
  if (!ap) throw new ApiError(404, "Access point not found");
  return { accessPoint: ap };
});

export const PATCH = adminRoute<P>(async ({ project, user, request }, { id }) => {
  const apId = uuid.parse(id);
  await updateAccessPoint(project.id, apId, await readJson(request, accessPointUpdateSchema));
  await afterContentChange(project.id, user.id);
  return { accessPoint: await getAccessPointForEditor(project.id, apId) };
});

export const DELETE = adminRoute<P>(async ({ project, user }, { id }) => {
  await deleteAccessPoint(project.id, uuid.parse(id));
  await afterContentChange(project.id, user.id);
  return { ok: true };
});
