import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Database } from "./index";

/** Applies pending SQL files from db/migrations in lexical order, once each. */
export async function migrate(db: Database): Promise<string[]> {
  await db.exec(`create table if not exists schema_migrations (
    name text primary key, applied_at timestamptz not null default now())`);
  const dir = path.join(process.cwd(), "db", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const applied = new Set(
    (await db.query<{ name: string }>("select name from schema_migrations")).rows.map((r) => r.name),
  );
  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(path.join(dir, file), "utf8");
    await db.transaction(async (tx) => {
      // Statements are separated so both drivers accept them via the extended protocol.
      for (const statement of splitSql(sql)) await tx.query(statement);
      await tx.query("insert into schema_migrations(name) values ($1)", [file]);
    });
    ran.push(file);
  }
  return ran;
}

function splitSql(sql: string): string[] {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean);
}
