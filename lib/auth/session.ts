import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { query, queryOne } from "../db";
import { env } from "../env";
import { hashToken, newSessionToken, verifyPassword } from "./password";

export const SESSION_COOKIE = "tour_admin_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
const MAX_FAILURES_PER_WINDOW = 8;
const FAILURE_WINDOW_MINUTES = 15;

export interface AdminUser {
  id: string;
  email: string;
  name: string;
}

export class AuthError extends Error {
  constructor(public status: 401 | 403 | 429, message: string) {
    super(message);
  }
}

/** Resolves the admin for the current request from the session cookie, or null. */
export async function getCurrentAdmin(): Promise<AdminUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 200) return null;
  return queryOne<AdminUser>(
    `select u.id, u.email, u.name
       from sessions s join admin_users u on u.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now()`,
    [hashToken(token)],
  );
}

/** For server components under /admin: redirects to the login page if not signed in. */
export async function requireAdminPage(): Promise<AdminUser> {
  const user = await getCurrentAdmin();
  if (!user) redirect("/admin/login");
  return user;
}

/**
 * For admin API route handlers. Enforces authentication on every request and, for
 * state-changing methods, a same-origin check as CSRF defence in depth (the
 * session cookie is also SameSite=Lax).
 */
export async function requireAdminApi(request: Request): Promise<AdminUser> {
  if (!["GET", "HEAD"].includes(request.method)) assertSameOrigin(request);
  const user = await getCurrentAdmin();
  if (!user) throw new AuthError(401, "Authentication required");
  return user;
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) {
    // Non-browser clients omit Origin; browsers always send it on cross-site POSTs.
    const site = request.headers.get("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "none") throw new AuthError(403, "Cross-site request rejected");
    return;
  }
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AuthError(403, "Invalid origin");
  }
  if (!host || originHost !== host) throw new AuthError(403, "Cross-site request rejected");
}

export async function login(email: string, password: string, ip: string, userAgent: string) {
  const normalized = email.trim().toLowerCase();
  const recent = await queryOne<{ failures: number }>(
    `select count(*)::int as failures from login_attempts
      where success = false and created_at > now() - ($3 || ' minutes')::interval
        and (email = $1 or ip = $2)`,
    [normalized, ip, String(FAILURE_WINDOW_MINUTES)],
  );
  if ((recent?.failures ?? 0) >= MAX_FAILURES_PER_WINDOW) {
    throw new AuthError(429, "Too many failed attempts. Please wait 15 minutes and try again.");
  }

  const user = await queryOne<AdminUser & { password_hash: string }>(
    "select id, email, name, password_hash from admin_users where email = $1",
    [normalized],
  );
  // Always run a hash comparison so response time does not reveal valid emails.
  const ok = await verifyPassword(
    password,
    user?.password_hash ?? "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
  );
  await query("insert into login_attempts (ip, email, success) values ($1, $2, $3)", [ip, normalized, ok && !!user]);
  await query("delete from login_attempts where created_at < now() - interval '1 day'");
  if (!ok || !user) throw new AuthError(401, "Invalid email or password.");

  const token = newSessionToken();
  const expires = new Date(Date.now() + SESSION_TTL_MS);
  await query("insert into sessions (user_id, token_hash, expires_at, user_agent) values ($1, $2, $3, $4)", [
    user.id,
    hashToken(token),
    expires,
    userAgent.slice(0, 300),
  ]);
  await query("update admin_users set last_login_at = now() where id = $1", [user.id]);
  await query("delete from sessions where expires_at < now()");

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.secureCookies,
    sameSite: "lax",
    path: "/",
    expires,
  });
  return { id: user.id, email: user.email, name: user.name };
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await query("delete from sessions where token_hash = $1", [hashToken(token)]);
  jar.delete(SESSION_COOKIE);
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim().slice(0, 64);
}
