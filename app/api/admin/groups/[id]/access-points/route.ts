import { z } from "zod";
import { adminRoute, readJson, uuid } from "@/lib/api";
import { createAccessPoint } from "@/lib/content/manage";

export const POST = adminRoute<{ id: string }>(async ({ project, request }, { id }) => {
  const { name } = await readJson(request, z.object({ name: z.string().trim().min(1).max(80) }));
  const accessPoint = await createAccessPoint(project.id, uuid.parse(id), name);
  return { accessPoint };
});
