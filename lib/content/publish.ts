import { getDb, query, queryOne, type Queryable } from "../db";
import { env } from "../env";
import { getStorage } from "../storage";
import type { Snapshot } from "../tour/types";
import type { ProjectRow } from "./rows";
import { assetKeyMap, buildSnapshot } from "./snapshot";

export interface PublicationKeys {
  [assetId: string]: { key: string; mime: string; fileName: string; variants: Record<string, string> };
}

/** The project served on the public routes. */
export async function getPublicProject(): Promise<ProjectRow | null> {
  const slug = env.publicProjectSlug;
  if (slug) return queryOne<ProjectRow>("select * from projects where slug = $1", [slug]);
  return queryOne<ProjectRow>("select * from projects order by created_at limit 1");
}

/**
 * The visitor-facing snapshot, or null when nothing is live (no publication yet,
 * or the project is switched offline by setting its status to draft).
 */
export async function getLiveSnapshot(): Promise<Snapshot | null> {
  const project = await getPublicProject();
  if (!project || project.status !== "published") return null;
  const row = await queryOne<{ snapshot: Snapshot }>(
    "select snapshot from publications where project_id = $1 order by created_at desc limit 1",
    [project.id],
  );
  return row?.snapshot ?? null;
}

/** Storage keys for the latest publication of the project that owns `assetId`. */
export async function getPublishedAssetKey(assetId: string) {
  const row = await queryOne<{ entry: PublicationKeys[string] | null }>(
    `select p.asset_keys -> $1::text as entry
       from publications p
       join projects pr on pr.id = p.project_id
      where pr.id = (select project_id from assets where id = $1::uuid)
        and pr.status = 'published'
      order by p.created_at desc
      limit 1`,
    [assetId],
  );
  return row?.entry ?? null;
}

export async function getLatestPublication(projectId: string) {
  return queryOne<{ id: string; created_at: string; snapshot: Snapshot }>(
    "select id, created_at, snapshot from publications where project_id = $1 order by created_at desc limit 1",
    [projectId],
  );
}

/** Freezes the current published-status content into a new publication. */
export async function publishProject(projectId: string, userId: string | null) {
  const db = await getDb();
  const result = await db.transaction(async (tx) => {
    const built = await buildSnapshot(tx, projectId, { mode: "published" });
    if (!built) throw new Error("Project not found");
    const keys = assetKeyMap(built.assets);
    const { rows } = await tx.query<{ id: string; created_at: string }>(
      `insert into publications (project_id, snapshot, asset_keys, published_by)
       values ($1, $2::jsonb, $3::jsonb, $4) returning id, created_at`,
      [projectId, JSON.stringify(built.snapshot), JSON.stringify(keys), userId],
    );
    // Only keep the five most recent publications.
    await tx.query(
      `delete from publications where project_id = $1 and id not in (
         select id from publications where project_id = $1 order by created_at desc limit 5)`,
      [projectId],
    );
    return { publication: rows[0]!, snapshot: built.snapshot };
  });
  await collectGarbage(db).catch((err) => console.error("storage garbage collection failed", err));
  return result;
}

/** Deletes replaced/removed storage objects that no retained publication references. */
export async function collectGarbage(db: Queryable) {
  const garbage = (await db.query<{ key: string }>("select key from storage_garbage")).rows;
  if (!garbage.length) return 0;
  const referenced = new Set<string>();
  const pubs = (await db.query<{ asset_keys: PublicationKeys }>("select asset_keys from publications")).rows;
  for (const p of pubs) {
    for (const entry of Object.values(p.asset_keys ?? {})) {
      referenced.add(entry.key);
      for (const k of Object.values(entry.variants ?? {})) referenced.add(k);
    }
  }
  const live = (await db.query<{ storage_key: string | null; metadata: any }>("select storage_key, metadata from assets")).rows;
  for (const a of live) {
    if (a.storage_key) referenced.add(a.storage_key);
    for (const v of Object.values<any>(a.metadata?.variants ?? {})) referenced.add(v.key);
  }
  const storage = await getStorage();
  let removed = 0;
  for (const { key } of garbage) {
    if (referenced.has(key)) continue;
    await storage.delete(key);
    await db.query("delete from storage_garbage where key = $1", [key]);
    removed++;
  }
  return removed;
}

export async function markGarbage(tx: Queryable, keys: (string | null | undefined)[]) {
  for (const key of keys) {
    if (key) await tx.query("insert into storage_garbage(key) values ($1) on conflict do nothing", [key]);
  }
}

/** Publishes automatically after a content change when the project opts in. */
export async function afterContentChange(projectId: string, userId: string | null) {
  const p = await queryOne<{ settings: ProjectRow["settings"] }>("select settings from projects where id = $1", [projectId]);
  if (p?.settings?.autoPublish) await publishProject(projectId, userId);
}

export async function listProjects() {
  return query<Pick<ProjectRow, "id" | "slug" | "name" | "status">>(
    "select id, slug, name, status from projects order by created_at",
  );
}
