import { adminRoute, readJson } from "@/lib/api";
import { updateProject } from "@/lib/content/manage";
import { afterContentChange } from "@/lib/content/publish";
import { projectSettingsSchema } from "@/lib/validation";

export const GET = adminRoute(async ({ project }) => ({ project }));

export const PATCH = adminRoute(async ({ project, user, request }) => {
  const input = await readJson(request, projectSettingsSchema);
  await updateProject(project.id, input);
  await afterContentChange(project.id, user.id);
  return { ok: true };
});
