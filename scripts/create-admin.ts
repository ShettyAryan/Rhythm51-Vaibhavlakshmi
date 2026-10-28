/**
 * Provision or reset an administrator account.
 *
 *   npm run admin:create -- --email owner@example.com
 *       (prompts for the password; or pass ADMIN_PASSWORD in the environment)
 *   npm run admin:create -- --email owner@example.com --reset
 *       (sets a new password for an existing account and signs out its sessions)
 *
 * There are no default credentials; every account is created explicitly here.
 */
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { hashPassword, validatePasswordStrength } from "../lib/auth/password";
import { getDb, query, queryOne } from "../lib/db";

export async function createAdmin(email: string, password: string, name = "", opts: { upsert?: boolean } = {}) {
  const normalized = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) throw new Error("Invalid email address");
  const weak = validatePasswordStrength(password);
  if (weak) throw new Error(weak);
  const hash = await hashPassword(password);
  const existing = await queryOne<{ id: string }>("select id from admin_users where email = $1", [normalized]);
  if (existing) {
    if (!opts.upsert) throw new Error("An admin with this email already exists (use --reset to change the password).");
    await query("update admin_users set password_hash = $2 where id = $1", [existing.id, hash]);
    await query("delete from sessions where user_id = $1", [existing.id]);
    return existing.id;
  }
  const row = await queryOne<{ id: string }>(
    "insert into admin_users (email, name, password_hash) values ($1, $2, $3) returning id",
    [normalized, name, hash],
  );
  return row!.id;
}

async function promptPassword(): Promise<string> {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const pw = await rl.question("Password (min 12 characters): ");
  rl.close();
  return pw;
}

async function main() {
  const args = process.argv.slice(2);
  const email = args[args.indexOf("--email") + 1];
  const nameIdx = args.indexOf("--name");
  if (!args.includes("--email") || !email) {
    console.error("Usage: npm run admin:create -- --email you@example.com [--name \"Full Name\"] [--reset]");
    process.exitCode = 1;
    return;
  }
  await getDb();
  const password = await promptPassword();
  await createAdmin(email, password, nameIdx >= 0 ? (args[nameIdx + 1] ?? "") : "", { upsert: args.includes("--reset") });
  console.log(`Admin account ready for ${email.toLowerCase()}. Sign in at /admin/login.`);
  await (await getDb()).close();
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
