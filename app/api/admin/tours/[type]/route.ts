import { adminRoute, parseTourType, readJson } from "@/lib/api";
import { updateTour } from "@/lib/content/manage";
import { afterContentChange } from "@/lib/content/publish";
import { getAdminTour } from "@/lib/content/queries";
import { tourUpdateSchema } from "@/lib/validation";

type P = { type: string };

export const GET = adminRoute<P>(async ({ project }, { type }) => getAdminTour(project.id, parseTourType(type)));

export const PATCH = adminRoute<P>(async ({ project, user, request }, { type }) => {
  await updateTour(project.id, parseTourType(type), await readJson(request, tourUpdateSchema));
  await afterContentChange(project.id, user.id);
  return { ok: true };
});
