import { cookies } from "next/headers";
import { z } from "zod";
import { AuthError, requireAdminApi, type AdminUser } from "./auth/session";
import { queryOne } from "./db";
import type { ProjectRow } from "./content/rows";
import { getPublicProject } from "./content/publish";
import { ApiError } from "./errors";
import type { TourType } from "./tour/types";

export { ApiError };

export const PROJECT_COOKIE = "tour_admin_project";

/** Project the admin is currently editing (cookie selection, else the public one). */
export async function getAdminProject(): Promise<ProjectRow | null> {
  const id = (await cookies()).get(PROJECT_COOKIE)?.value;
  if (id && /^[0-9a-f-]{36}$/i.test(id)) {
    const p = await queryOne<ProjectRow>("select * from projects where id = $1", [id]);
    if (p) return p;
  }
  return getPublicProject();
}

export interface AdminContext {
  user: AdminUser;
  project: ProjectRow;
  request: Request;
}

type RouteCtx<P> = { params: Promise<P> };

/**
 * Wraps an admin route handler: authenticates (401), checks same-origin for
 * mutations (403), resolves the active project, and maps validation and known
 * errors to JSON responses. Every admin API goes through this wrapper.
 */
export function adminRoute<P = Record<string, never>>(
  handler: (ctx: AdminContext, params: P) => Promise<unknown>,
) {
  return async (request: Request, routeCtx: RouteCtx<P>) => {
    try {
      const user = await requireAdminApi(request);
      const project = await getAdminProject();
      if (!project) throw new ApiError(409, "No project exists yet. Run the seed or create a project.");
      const params = (await routeCtx?.params) ?? ({} as P);
      const result = await handler({ user, project, request }, params);
      if (result instanceof Response) return result;
      return Response.json(result ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown): Response {
  if (err instanceof AuthError) return Response.json({ error: err.message }, { status: err.status });
  if (err instanceof ApiError) return Response.json({ error: err.message, details: err.details }, { status: err.status });
  if (err instanceof z.ZodError) {
    return Response.json(
      { error: "Validation failed", details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 400 },
    );
  }
  const pgCode = (err as { code?: string })?.code;
  if (pgCode === "23503") return Response.json({ error: "This item is still referenced by other content." }, { status: 409 });
  if (pgCode === "23505") return Response.json({ error: "An item with these details already exists." }, { status: 409 });
  if (pgCode === "23514") return Response.json({ error: "A value is outside the allowed range." }, { status: 400 });
  console.error(err);
  return Response.json({ error: "Unexpected server error" }, { status: 500 });
}

export async function readJson<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "Request body must be JSON");
  }
  return schema.parse(body);
}

export const uuid = z.uuid();

export function parseTourType(t: string): TourType {
  if (t !== "rooms" && t !== "amenities") throw new ApiError(404, "Unknown tour");
  return t;
}
