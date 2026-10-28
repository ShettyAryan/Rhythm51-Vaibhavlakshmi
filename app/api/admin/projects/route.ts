import { z } from "zod";
import { adminRoute, readJson } from "@/lib/api";
import { createProject } from "@/lib/content/manage";
import { listProjects } from "@/lib/content/publish";

export const GET = adminRoute(async () => ({ projects: await listProjects() }));

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/, "Lowercase letters, numbers and dashes only"),
});

export const POST = adminRoute(async ({ request }) => {
  const input = await readJson(request, schema);
  const project = await createProject(input.name, input.slug);
  return { project };
});
