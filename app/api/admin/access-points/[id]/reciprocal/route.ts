import { z } from "zod";
import { adminRoute, readJson, uuid } from "@/lib/api";
import { createReciprocalHotspot } from "@/lib/content/manage";
import { normalizeYaw } from "@/lib/tour/geometry";

const schema = z.object({
  destinationAccessPointId: z.uuid(),
  yaw: z.number().finite().transform(normalizeYaw),
  pitch: z.number().finite().min(-90).max(90),
  label: z.string().trim().max(80),
});

/** Creates the return hotspot (destination → this access point) if it doesn't exist. */
export const POST = adminRoute<{ id: string }>(async ({ project, request }, { id }) => {
  const input = await readJson(request, schema);
  return createReciprocalHotspot(project.id, uuid.parse(id), input.destinationAccessPointId, input.yaw, input.pitch, input.label);
});
