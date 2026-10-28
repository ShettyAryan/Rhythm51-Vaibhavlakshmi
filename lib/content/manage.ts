import { z } from "zod";
import { getDb, query, queryOne, type Queryable } from "../db";
import { ApiError } from "../errors";
import type { TourType } from "../tour/types";
import type {
  accessPointUpdateSchema,
  documentUpdateSchema,
  floorPlanUpdateSchema,
  groupUpdateSchema,
  projectSettingsSchema,
  tourUpdateSchema,
} from "../validation";

type Input<T extends z.ZodType> = z.infer<T>;

// ---------------------------------------------------------------------------
// Ownership guards: every id coming from the browser is checked to belong to the
// admin's active project before it is read or written.
// ---------------------------------------------------------------------------

async function assertAsset(db: Queryable, projectId: string, assetId: string | null | undefined, kind?: "image" | "pdf" | "panorama") {
  if (!assetId) return;
  const a = (
    await db.query<{ mime_type: string; category: string; status: string }>(
      "select mime_type, category, status from assets where id = $1 and project_id = $2",
      [assetId, projectId],
    )
  ).rows[0];
  if (!a || a.status !== "ready") throw new ApiError(400, "Selected file was not found in the media library.");
  if (kind === "pdf" && a.mime_type !== "application/pdf") throw new ApiError(400, "Select a PDF file.");
  if ((kind === "image" || kind === "panorama") && !a.mime_type.startsWith("image/")) throw new ApiError(400, "Select an image file.");
  if (kind === "panorama" && a.category !== "panorama") throw new ApiError(400, "Select a file uploaded as a 360° panorama.");
}

export async function getTourRow(db: Queryable, projectId: string, type: TourType) {
  const existing = (await db.query<any>("select * from tours where project_id = $1 and type = $2", [projectId, type])).rows[0];
  if (existing) return existing;
  const name = type === "rooms" ? "Apartment Tour" : "Amenities Tour";
  return (
    await db.query<any>(
      `insert into tours (project_id, type, name, display_order) values ($1, $2, $3, $4)
       on conflict (project_id, type) do update set type = excluded.type returning *`,
      [projectId, type, name, type === "rooms" ? 0 : 1],
    )
  ).rows[0];
}

async function groupInProject(db: Queryable, projectId: string, groupId: string) {
  const g = (
    await db.query<any>(
      `select g.*, t.type as tour_type, t.id as tour_id from tour_groups g join tours t on t.id = g.tour_id
        where g.id = $1 and t.project_id = $2`,
      [groupId, projectId],
    )
  ).rows[0];
  if (!g) throw new ApiError(404, "Room or amenity not found");
  return g;
}

async function accessPointInProject(db: Queryable, projectId: string, apId: string) {
  const ap = (
    await db.query<any>(
      `select ap.*, t.id as tour_id, t.type as tour_type from access_points ap
         join tour_groups g on g.id = ap.group_id join tours t on t.id = g.tour_id
        where ap.id = $1 and t.project_id = $2`,
      [apId, projectId],
    )
  ).rows[0];
  if (!ap) throw new ApiError(404, "Access point not found");
  return ap;
}

async function floorPlanInProject(db: Queryable, projectId: string, planId: string | null | undefined) {
  if (!planId) return null;
  const f = (await db.query<any>("select * from floor_plans where id = $1 and project_id = $2", [planId, projectId])).rows[0];
  if (!f) throw new ApiError(400, "Floor plan not found");
  return f;
}

/** Builds `set a = $n, ...` from a column map, skipping undefined values. */
function updateSet(cols: Record<string, unknown>, startIndex = 2) {
  const entries = Object.entries(cols).filter(([, v]) => v !== undefined);
  return {
    sql: entries.map(([c], i) => `${c} = $${i + startIndex}`).join(", "),
    values: entries.map(([, v]) => v),
    empty: entries.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Project settings
// ---------------------------------------------------------------------------

export async function updateProject(projectId: string, input: Input<typeof projectSettingsSchema>) {
  const db = await getDb();
  await assertAsset(db, projectId, input.logoAssetId, "image");
  await assertAsset(db, projectId, input.heroAssetId, "image");
  const current = await queryOne<any>("select settings from projects where id = $1", [projectId]);
  const set = updateSet({
    name: input.name,
    slug: input.slug,
    developer_name: input.developerName,
    logo_asset_id: input.logoAssetId,
    hero_asset_id: input.heroAssetId,
    hero_headline: input.heroHeadline,
    hero_subtitle: input.heroSubtitle,
    show_hero_text: input.showHeroText,
    hero_overlay: input.heroOverlay,
    about_text: input.aboutText,
    nav_labels: input.navLabels ? JSON.stringify(input.navLabels) : undefined,
    theme: input.theme ? JSON.stringify(input.theme) : undefined,
    contact: input.contact ? JSON.stringify(input.contact) : undefined,
    settings:
      input.autoPublish !== undefined ? JSON.stringify({ ...(current?.settings ?? {}), autoPublish: input.autoPublish }) : undefined,
    status: input.status,
  });
  if (set.empty) return;
  await query(`update projects set ${set.sql}, updated_at = now() where id = $1`, [projectId, ...set.values]);
}

export async function createProject(name: string, slug: string) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const p = (
      await tx.query<{ id: string }>("insert into projects (name, slug) values ($1, $2) returning id", [name, slug])
    ).rows[0]!;
    await getTourRow(tx, p.id, "rooms");
    await getTourRow(tx, p.id, "amenities");
    return p;
  });
}

// ---------------------------------------------------------------------------
// Tours & groups (rooms / amenities)
// ---------------------------------------------------------------------------

export async function updateTour(projectId: string, type: TourType, input: Input<typeof tourUpdateSchema>) {
  const db = await getDb();
  const tour = await getTourRow(db, projectId, type);
  if (input.defaultAccessPointId) {
    const ap = await accessPointInProject(db, projectId, input.defaultAccessPointId);
    if (ap.tour_id !== tour.id) throw new ApiError(400, "Default access point must belong to this tour.");
  }
  const set = updateSet({
    name: input.name,
    description: input.description,
    status: input.status,
    default_access_point_id: input.defaultAccessPointId,
  });
  if (!set.empty) await query(`update tours set ${set.sql}, updated_at = now() where id = $1`, [tour.id, ...set.values]);
}

export async function createGroup(projectId: string, type: TourType, name: string) {
  const db = await getDb();
  const tour = await getTourRow(db, projectId, type);
  return queryOne<{ id: string }>(
    `insert into tour_groups (tour_id, name, display_order)
     values ($1, $2, coalesce((select max(display_order) + 1 from tour_groups where tour_id = $1), 0)) returning id`,
    [tour.id, name],
  );
}

export async function updateGroup(projectId: string, groupId: string, input: Input<typeof groupUpdateSchema>) {
  const db = await getDb();
  await groupInProject(db, projectId, groupId);
  await assertAsset(db, projectId, input.thumbnailAssetId, "image");
  await floorPlanInProject(db, projectId, input.floorPlanId);
  if (input.defaultAccessPointId) {
    const ap = await accessPointInProject(db, projectId, input.defaultAccessPointId);
    if (ap.group_id !== groupId) throw new ApiError(400, "Default viewpoint must belong to this room.");
  }
  const set = updateSet({
    name: input.name,
    description: input.description,
    thumbnail_asset_id: input.thumbnailAssetId,
    floor_plan_id: input.floorPlanId,
    default_access_point_id: input.defaultAccessPointId,
    status: input.status,
  });
  if (!set.empty) await query(`update tour_groups set ${set.sql}, updated_at = now() where id = $1`, [groupId, ...set.values]);
}

export async function deleteGroup(projectId: string, groupId: string) {
  const db = await getDb();
  await groupInProject(db, projectId, groupId);
  await query("delete from tour_groups where id = $1", [groupId]);
}

export async function reorderGroups(projectId: string, type: TourType, ids: string[]) {
  const db = await getDb();
  const tour = await getTourRow(db, projectId, type);
  await db.transaction(async (tx) => {
    for (const [i, id] of ids.entries()) {
      await tx.query("update tour_groups set display_order = $3 where id = $1 and tour_id = $2", [id, tour.id, i]);
    }
  });
}

// ---------------------------------------------------------------------------
// Access points & hotspots
// ---------------------------------------------------------------------------

export async function createAccessPoint(projectId: string, groupId: string, name: string) {
  const db = await getDb();
  const g = await groupInProject(db, projectId, groupId);
  const row = await queryOne<{ id: string }>(
    `insert into access_points (group_id, name, floor_plan_id, display_order)
     values ($1, $2, $3, coalesce((select max(display_order) + 1 from access_points where group_id = $1), 0)) returning id`,
    [groupId, name, g.floor_plan_id],
  );
  if (!g.default_access_point_id) await query("update tour_groups set default_access_point_id = $2 where id = $1", [groupId, row!.id]);
  return row!;
}

export async function updateAccessPoint(projectId: string, apId: string, input: Input<typeof accessPointUpdateSchema>) {
  const db = await getDb();
  const ap = await accessPointInProject(db, projectId, apId);
  if (input.groupId && input.groupId !== ap.group_id) {
    const g = await groupInProject(db, projectId, input.groupId);
    if (g.tour_id !== ap.tour_id) throw new ApiError(400, "An access point can only move between groups of the same tour.");
  }
  await assertAsset(db, projectId, input.panoramaAssetId, "panorama");
  await assertAsset(db, projectId, input.thumbnailAssetId, "image");
  await floorPlanInProject(db, projectId, input.floorPlanId);

  if (input.hotspots) {
    const destIds = [...new Set(input.hotspots.map((h) => h.destinationAccessPointId))];
    if (destIds.includes(apId)) throw new ApiError(400, "A hotspot cannot link an access point to itself.");
    if (destIds.length) {
      const found = (
        await db.query<{ id: string }>(
          `select ap.id from access_points ap join tour_groups g on g.id = ap.group_id
            where ap.id = any($1::uuid[]) and g.tour_id = $2`,
          [destIds, ap.tour_id],
        )
      ).rows.map((r) => r.id);
      const missing = destIds.filter((d) => !found.includes(d));
      if (missing.length) throw new ApiError(400, "Hotspot destinations must be existing access points in the same tour.", missing);
    }
  }

  await db.transaction(async (tx) => {
    const set = updateSet({
      name: input.name,
      group_id: input.groupId,
      panorama_asset_id: input.panoramaAssetId,
      thumbnail_asset_id: input.thumbnailAssetId,
      initial_yaw: input.initialYaw,
      initial_pitch: input.initialPitch,
      initial_fov: input.initialFov,
      floor_plan_id: input.floorPlanId,
      marker_x: input.marker === undefined ? undefined : (input.marker?.x ?? null),
      marker_y: input.marker === undefined ? undefined : (input.marker?.y ?? null),
      heading_offset: input.headingOffset,
      status: input.status,
    });
    if (!set.empty) await tx.query(`update access_points set ${set.sql}, updated_at = now() where id = $1`, [apId, ...set.values]);

    if (input.hotspots) {
      const keep = input.hotspots.map((h) => h.id).filter(Boolean) as string[];
      await tx.query(
        "delete from hotspots where source_access_point_id = $1 and not (id = any($2::uuid[]))",
        [apId, keep],
      );
      for (const [i, h] of input.hotspots.entries()) {
        const values = [apId, h.destinationAccessPointId, h.label, h.yaw, h.pitch, h.style, i];
        if (h.id) {
          const res = await tx.query(
            `update hotspots set destination_access_point_id = $2, label = $3, yaw = $4, pitch = $5, style = $6,
                    display_order = $7, updated_at = now()
              where source_access_point_id = $1 and id = $8 returning id`,
            [...values, h.id],
          );
          if (res.rows.length) continue;
        }
        await tx.query(
          `insert into hotspots (source_access_point_id, destination_access_point_id, label, yaw, pitch, style, display_order)
           values ($1, $2, $3, $4, $5, $6, $7)`,
          values,
        );
      }
    }
  });
}

/** Adds a hotspot on `destination` that leads back to `source` (if none exists yet). */
export async function createReciprocalHotspot(
  projectId: string,
  sourceId: string,
  destinationId: string,
  yaw: number,
  pitch: number,
  label: string,
) {
  const db = await getDb();
  const src = await accessPointInProject(db, projectId, sourceId);
  const dest = await accessPointInProject(db, projectId, destinationId);
  if (src.tour_id !== dest.tour_id) throw new ApiError(400, "Access points must be in the same tour.");
  const exists = await queryOne(
    "select 1 from hotspots where source_access_point_id = $1 and destination_access_point_id = $2",
    [destinationId, sourceId],
  );
  if (exists) return { created: false };
  await query(
    `insert into hotspots (source_access_point_id, destination_access_point_id, label, yaw, pitch, display_order)
     values ($1, $2, $3, $4, $5, coalesce((select max(display_order) + 1 from hotspots where source_access_point_id = $1), 0))`,
    [destinationId, sourceId, label, yaw, pitch],
  );
  return { created: true };
}

export async function deleteAccessPoint(projectId: string, apId: string) {
  const db = await getDb();
  await accessPointInProject(db, projectId, apId);
  await query("delete from access_points where id = $1", [apId]);
}

export async function reorderAccessPoints(projectId: string, groupId: string, ids: string[]) {
  const db = await getDb();
  await groupInProject(db, projectId, groupId);
  await db.transaction(async (tx) => {
    for (const [i, id] of ids.entries()) {
      await tx.query("update access_points set display_order = $3 where id = $1 and group_id = $2", [id, groupId, i]);
    }
  });
}

// ---------------------------------------------------------------------------
// Floor plans
// ---------------------------------------------------------------------------

export async function createFloorPlan(projectId: string, name: string) {
  return queryOne<{ id: string }>(
    `insert into floor_plans (project_id, name, display_order)
     values ($1, $2, coalesce((select max(display_order) + 1 from floor_plans where project_id = $1), 0)) returning id`,
    [projectId, name],
  );
}

export async function updateFloorPlan(projectId: string, planId: string, input: Input<typeof floorPlanUpdateSchema>) {
  const db = await getDb();
  await floorPlanInProject(db, projectId, planId);
  await assertAsset(db, projectId, input.imageAssetId, "image");
  await assertAsset(db, projectId, input.originalPdfAssetId, "pdf");
  if (input.markers?.length) {
    for (const m of input.markers) await accessPointInProject(db, projectId, m.accessPointId);
  }
  await db.transaction(async (tx) => {
    const set = updateSet({
      name: input.name,
      image_asset_id: input.imageAssetId,
      original_pdf_asset_id: input.originalPdfAssetId,
      page_number: input.pageNumber,
      orientation_offset: input.orientationOffset,
      status: input.status,
    });
    if (!set.empty) await tx.query(`update floor_plans set ${set.sql}, updated_at = now() where id = $1`, [planId, ...set.values]);
    for (const m of input.markers ?? []) {
      // Placing a marker assigns the access point to this plan; clearing it keeps the assignment.
      await tx.query(
        `update access_points set marker_x = $2, marker_y = $3,
                floor_plan_id = case when $2::real is null then floor_plan_id else $4::uuid end, updated_at = now()
          where id = $1`,
        [m.accessPointId, m.marker?.x ?? null, m.marker?.y ?? null, planId],
      );
      if (m.headingOffset !== undefined || m.initialYaw !== undefined) {
        await tx.query(
          `update access_points set heading_offset = coalesce($2, heading_offset), initial_yaw = coalesce($3, initial_yaw), updated_at = now()
            where id = $1`,
          [m.accessPointId, m.headingOffset ?? null, m.initialYaw ?? null],
        );
      }
    }
  });
}

export async function deleteFloorPlan(projectId: string, planId: string) {
  const db = await getDb();
  await floorPlanInProject(db, projectId, planId);
  await query("delete from floor_plans where id = $1", [planId]);
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export async function upsertDocument(projectId: string, type: "floor_plan" | "brochure", input: Input<typeof documentUpdateSchema>) {
  const db = await getDb();
  await assertAsset(db, projectId, input.assetId, "pdf");
  await query(
    `insert into documents (project_id, type, title) values ($1, $2, $3) on conflict (project_id, type) do nothing`,
    [projectId, type, type === "brochure" ? "Brochure" : "Floor Plan"],
  );
  const set = updateSet(
    { asset_id: input.assetId, title: input.title, status: input.status, allow_download: input.allowDownload },
    3,
  );
  if (!set.empty) {
    await query(`update documents set ${set.sql}, updated_at = now() where project_id = $1 and type = $2`, [
      projectId,
      type,
      ...set.values,
    ]);
  }
}

// ---------------------------------------------------------------------------
// Bulk publishing helpers
// ---------------------------------------------------------------------------

export interface DraftSummary {
  tours: number;
  rooms: number;
  viewpoints: number;
  floorPlans: number;
  documents: number;
  /** Draft viewpoints that can't be published yet (no panorama). */
  viewpointsMissingPanorama: number;
}

/** What is still marked Draft (and therefore excluded when publishing). */
export async function draftSummary(projectId: string): Promise<DraftSummary> {
  const row = await queryOne<Record<keyof DraftSummary, number>>(
    `select
       (select count(*)::int from tours where project_id = $1 and status = 'draft'
          and exists (select 1 from tour_groups g where g.tour_id = tours.id)) as tours,
       (select count(*)::int from tour_groups g join tours t on t.id = g.tour_id where t.project_id = $1 and g.status = 'draft') as rooms,
       (select count(*)::int from access_points ap join tour_groups g on g.id = ap.group_id join tours t on t.id = g.tour_id
          where t.project_id = $1 and ap.status = 'draft' and ap.panorama_asset_id is not null) as viewpoints,
       (select count(*)::int from floor_plans where project_id = $1 and status = 'draft' and image_asset_id is not null) as "floorPlans",
       (select count(*)::int from documents where project_id = $1 and status = 'draft' and asset_id is not null) as documents,
       (select count(*)::int from access_points ap join tour_groups g on g.id = ap.group_id join tours t on t.id = g.tour_id
          where t.project_id = $1 and ap.status = 'draft' and ap.panorama_asset_id is null) as "viewpointsMissingPanorama"`,
    [projectId],
  );
  return row as DraftSummary;
}

/**
 * Marks every draft item that is ready to show as Published: viewpoints with a
 * panorama, rooms containing such a viewpoint, tours containing such a room,
 * floor plans with an image and documents with a file. Incomplete items stay Draft.
 */
export async function publishReadyDrafts(projectId: string): Promise<DraftSummary> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const n = async (sql: string) => (await tx.query<{ id: string }>(sql, [projectId])).rows.length;
    const viewpoints = await n(
      `update access_points ap set status = 'published', updated_at = now()
         from tour_groups g, tours t
        where g.id = ap.group_id and t.id = g.tour_id and t.project_id = $1
          and ap.status = 'draft' and ap.panorama_asset_id is not null
        returning ap.id`,
    );
    const rooms = await n(
      `update tour_groups g set status = 'published', updated_at = now()
         from tours t
        where t.id = g.tour_id and t.project_id = $1 and g.status = 'draft'
          and exists (select 1 from access_points ap where ap.group_id = g.id and ap.status = 'published' and ap.panorama_asset_id is not null)
        returning g.id`,
    );
    const tours = await n(
      `update tours t set status = 'published', updated_at = now()
        where t.project_id = $1 and t.status = 'draft'
          and exists (select 1 from tour_groups g where g.tour_id = t.id and g.status = 'published')
        returning t.id`,
    );
    const floorPlans = await n(
      `update floor_plans set status = 'published', updated_at = now()
        where project_id = $1 and status = 'draft' and image_asset_id is not null returning id`,
    );
    const documents = await n(
      `update documents set status = 'published', updated_at = now()
        where project_id = $1 and status = 'draft' and asset_id is not null returning id`,
    );
    return { tours, rooms, viewpoints, floorPlans, documents, viewpointsMissingPanorama: 0 };
  });
}
