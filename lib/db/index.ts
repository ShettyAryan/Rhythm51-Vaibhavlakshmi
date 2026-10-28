import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { env } from "../env";

/**
 * Minimal database interface shared by the embedded PGlite driver (local dev /
 * tests) and node-postgres (production Postgres such as Supabase). All queries in
 * the app are plain parameterised SQL so both drivers behave identically.
 */
export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface Database extends Queryable {
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/**
 * The embedded database can only be opened by one process at a time. A PID lock
 * file turns accidental concurrent use (e.g. running a script while `next dev`
 * is up) into a clear error instead of a corrupted data directory.
 */
function acquireLock(dir: string) {
  const lock = path.join(dir, "process.lock");
  if (existsSync(lock)) {
    const pid = Number(readFileSync(lock, "utf8"));
    let alive = false;
    if (pid && pid !== process.pid) {
      try {
        process.kill(pid, 0);
        alive = true;
      } catch {
        alive = false;
      }
    }
    if (alive) {
      throw new Error(
        `The local database in ${dir} is in use by another process (pid ${pid}). Stop the dev server before running scripts, or set DATABASE_URL to use Postgres.`,
      );
    }
  }
  writeFileSync(lock, String(process.pid));
  const release = () => {
    try {
      if (existsSync(lock) && readFileSync(lock, "utf8") === String(process.pid)) rmSync(lock);
    } catch {
      /* ignore */
    }
  };
  process.once("exit", release);
  return release;
}

async function createPglite(dataDir: string): Promise<Database> {
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = path.join(dataDir, "pglite");
  mkdirSync(dir, { recursive: true });
  const release = acquireLock(dataDir);
  const db = await PGlite.create(dir);
  // PGlite is single-connection: serialise transactions so concurrent requests
  // cannot interleave statements inside another request's transaction.
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => undefined);
    return run;
  };
  return {
    query: (sql, params) => serial(() => db.query(sql, params as unknown[])) as never,
    exec: (sql) => serial(async () => void (await db.exec(sql))),
    transaction: (fn) =>
      serial(() => db.transaction((tx) => fn({ query: (s, p) => tx.query(s, p as unknown[]) as never }))),
    close: async () => {
      await db.close();
      release();
    },
  };
}

async function createPg(url: string): Promise<Database> {
  const pg = await import("pg");
  const Pool = pg.default?.Pool ?? (pg as unknown as typeof import("pg")).Pool;
  const pool = new Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_MAX ?? 5) });
  return {
    query: (sql, params) => pool.query(sql, params as unknown[]) as never,
    exec: async (sql) => void (await pool.query(sql)),
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const result = await fn({ query: (s, p) => client.query(s, p as unknown[]) as never });
        await client.query("commit");
        return result;
      } catch (err) {
        await client.query("rollback").catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

const globalForDb = globalThis as unknown as { __tourDb?: Promise<Database> };

/** Returns the process-wide database connection (survives dev hot reloads). */
export function getDb(): Promise<Database> {
  if (!globalForDb.__tourDb) {
    const url = env.databaseUrl;
    globalForDb.__tourDb = (url ? createPg(url) : createPglite(env.dataDir)).then(async (db) => {
      const { migrate } = await import("./migrate");
      await migrate(db);
      return db;
    });
    globalForDb.__tourDb.catch(() => {
      globalForDb.__tourDb = undefined;
    });
  }
  return globalForDb.__tourDb;
}

export async function query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
  const db = await getDb();
  return (await db.query<T>(sql, params)).rows;
}

export async function queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** For tests: open an isolated database (in-memory PGlite when dataDir is undefined). */
export async function openTestDatabase(): Promise<Database> {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = await PGlite.create();
  const wrapped: Database = {
    query: (sql, params) => db.query(sql, params as unknown[]) as never,
    exec: async (sql) => void (await db.exec(sql)),
    transaction: (fn) => db.transaction((tx) => fn({ query: (s, p) => tx.query(s, p as unknown[]) as never })),
    close: () => db.close(),
  };
  const { migrate } = await import("./migrate");
  await migrate(wrapped);
  return wrapped;
}

/** For tests: install a database as the process-wide connection. */
export function setDbForTesting(db: Database | undefined) {
  globalForDb.__tourDb = db ? Promise.resolve(db) : undefined;
}
