import { adminRoute } from "@/lib/api";
import { exportStaticSite } from "@/lib/export/static";

/** Writes the latest published snapshot as a static website folder on this machine. */
export const POST = adminRoute(async ({ project }) => {
  const result = await exportStaticSite(project.id);
  return result;
});
