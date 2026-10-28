import { adminRoute, readJson, uuid } from "@/lib/api";
import { deleteFloorPlan, updateFloorPlan } from "@/lib/content/manage";
import { afterContentChange } from "@/lib/content/publish";
import { floorPlanUpdateSchema } from "@/lib/validation";

type P = { id: string };

export const PATCH = adminRoute<P>(async ({ project, user, request }, { id }) => {
  await updateFloorPlan(project.id, uuid.parse(id), await readJson(request, floorPlanUpdateSchema));
  await afterContentChange(project.id, user.id);
  return { ok: true };
});

export const DELETE = adminRoute<P>(async ({ project, user }, { id }) => {
  await deleteFloorPlan(project.id, uuid.parse(id));
  await afterContentChange(project.id, user.id);
  return { ok: true };
});
