import { adminRoute, ApiError, uuid } from "@/lib/api";
import { receiveLocalUpload } from "@/lib/content/assets";
import { env } from "@/lib/env";

/** Local storage driver only: receives the raw bytes of a pending upload. */
export const PUT = adminRoute<{ id: string }>(async ({ project, request }, { id }) => {
  if (env.storageDriver !== "local") throw new ApiError(400, "Uploads go directly to object storage.");
  return receiveLocalUpload(project.id, uuid.parse(id), request);
});
