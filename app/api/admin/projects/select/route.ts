import { cookies } from "next/headers";
import { z } from "zod";
import { adminRoute, ApiError, PROJECT_COOKIE, readJson } from "@/lib/api";
import { queryOne } from "@/lib/db";
import { env } from "@/lib/env";

export const POST = adminRoute(async ({ request }) => {
  const { projectId } = await readJson(request, z.object({ projectId: z.uuid() }));
  const exists = await queryOne("select 1 from projects where id = $1", [projectId]);
  if (!exists) throw new ApiError(404, "Project not found");
  (await cookies()).set(PROJECT_COOKIE, projectId, { httpOnly: true, sameSite: "lax", secure: env.secureCookies, path: "/" });
  return { ok: true };
});
