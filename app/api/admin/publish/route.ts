import { z } from "zod";
import { adminRoute, ApiError } from "@/lib/api";
import { draftSummary, publishReadyDrafts } from "@/lib/content/manage";
import { getLatestPublication, publishProject } from "@/lib/content/publish";
import { contentWarnings } from "@/lib/content/queries";

export const GET = adminRoute(async ({ project }) => {
  const latest = await getLatestPublication(project.id);
  return {
    lastPublishedAt: latest?.created_at ?? null,
    warnings: await contentWarnings(project.id),
    drafts: await draftSummary(project.id),
  };
});

const body = z.object({ includeDrafts: z.boolean().optional() }).optional();

/**
 * Freezes the current published-status content into a new public snapshot.
 * With { includeDrafts: true }, first marks every ready draft item as Published.
 */
export const POST = adminRoute(async ({ project, user, request }) => {
  const text = await request.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    throw new ApiError(400, "Request body must be JSON");
  }
  const opts = body.parse(parsed);
  const marked = opts?.includeDrafts ? await publishReadyDrafts(project.id) : null;
  const { publication } = await publishProject(project.id, user.id);
  return { publishedAt: publication.created_at, marked };
});
