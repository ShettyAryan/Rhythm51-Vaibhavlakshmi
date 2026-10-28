import { z } from "zod";
import { adminRoute, parseTourType, readJson } from "@/lib/api";
import { createGroup } from "@/lib/content/manage";

export const POST = adminRoute<{ type: string }>(async ({ project, request }, { type }) => {
  const { name } = await readJson(request, z.object({ name: z.string().trim().min(1).max(80) }));
  const group = await createGroup(project.id, parseTourType(type), name);
  return { group };
});
