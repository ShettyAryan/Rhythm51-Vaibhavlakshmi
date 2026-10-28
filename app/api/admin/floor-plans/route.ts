import { adminRoute, readJson } from "@/lib/api";
import { createFloorPlan } from "@/lib/content/manage";
import { listFloorPlans } from "@/lib/content/queries";
import { floorPlanCreateSchema } from "@/lib/validation";

export const GET = adminRoute(async ({ project }) => ({ floorPlans: await listFloorPlans(project.id) }));

export const POST = adminRoute(async ({ project, request }) => {
  const { name } = await readJson(request, floorPlanCreateSchema);
  return { floorPlan: await createFloorPlan(project.id, name) };
});
