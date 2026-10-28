import { getDb, query, queryOne } from "../db";
import type { MediaRef, TourType } from "../tour/types";
import { draftSummary, getTourRow } from "./manage";
import { getLatestPublication } from "./publish";
import type { AssetRow } from "./rows";
import { toMediaRef } from "./snapshot";

export interface AdminAsset {
  id: string;
  category: AssetRow["category"];
  fileName: string;
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  version: number;
  url: string;
  thumbUrl: string | null;
  createdAt: string;
  updatedAt: string;
  usageCount: number;
  /** Same shape the viewer uses publicly (draft URLs). */
  media: MediaRef;
}

export function toAdminAsset(a: AssetRow & { usage_count?: number }): AdminAsset {
  const ref = toMediaRef(a, false);
  return {
    id: a.id,
    category: a.category,
    fileName: a.file_name,
    mimeType: a.mime_type,
    fileSize: Number(a.file_size),
    width: a.width,
    height: a.height,
    version: a.version,
    url: ref.url,
    thumbUrl: a.mime_type.startsWith("image/") ? (ref.variants.thumb?.url ?? ref.url) : null,
    createdAt: new Date(a.created_at).toISOString(),
    updatedAt: new Date(a.updated_at).toISOString(),
    usageCount: Number(a.usage_count ?? 0),
    media: ref,
  };
}

export async function listAssets(projectId: string, category?: string): Promise<AdminAsset[]> {
  const rows = await query<AssetRow & { usage_count: number }>(
    `select a.*, (
        (select count(*) from projects p where p.logo_asset_id = a.id or p.hero_asset_id = a.id) +
        (select count(*) from tour_groups g where g.thumbnail_asset_id = a.id) +
        (select count(*) from access_points ap where ap.panorama_asset_id = a.id or ap.thumbnail_asset_id = a.id) +
        (select count(*) from floor_plans f where f.image_asset_id = a.id or f.original_pdf_asset_id = a.id) +
        (select count(*) from documents d where d.asset_id = a.id)
      )::int as usage_count
       from assets a
      where a.project_id = $1 and a.status = 'ready' and ($2::text is null or a.category = $2)
      order by a.created_at desc`,
    [projectId, category ?? null],
  );
  return rows.map(toAdminAsset);
}

export async function getAdminAsset(projectId: string, id: string | null | undefined) {
  if (!id) return null;
  const a = await queryOne<AssetRow>("select * from assets where id = $1 and project_id = $2 and status = 'ready'", [id, projectId]);
  return a ? toAdminAsset(a) : null;
}

export interface AdminAccessPointSummary {
  id: string;
  name: string;
  status: "draft" | "published";
  groupId: string;
  groupName: string;
  hasPanorama: boolean;
  thumbUrl: string | null;
  hotspotCount: number;
  floorPlanId: string | null;
  marker: { x: number; y: number } | null;
  headingOffset: number;
  initialYaw: number;
}

export interface AdminGroup {
  id: string;
  name: string;
  description: string;
  status: "draft" | "published";
  thumbnailAssetId: string | null;
  thumbUrl: string | null;
  floorPlanId: string | null;
  defaultAccessPointId: string | null;
  accessPoints: AdminAccessPointSummary[];
}

export async function getAdminTour(projectId: string, type: TourType) {
  const db = await getDb();
  const tour = await getTourRow(db, projectId, type);
  const groups = await query<any>("select * from tour_groups where tour_id = $1 order by display_order, created_at", [tour.id]);
  const aps = await query<any>(
    `select ap.*, pa.metadata as pano_meta, pa.version as pano_version, pa.storage_key as pano_key,
            (select count(*)::int from hotspots h where h.source_access_point_id = ap.id) as hotspot_count
       from access_points ap
       join tour_groups g on g.id = ap.group_id
       left join assets pa on pa.id = ap.panorama_asset_id
      where g.tour_id = $1 order by ap.display_order, ap.created_at`,
    [tour.id],
  );
  const thumbs = await query<AssetRow>(
    `select * from assets where id = any($1::uuid[])`,
    [[...groups.map((g) => g.thumbnail_asset_id), ...aps.map((a) => a.thumbnail_asset_id ?? a.panorama_asset_id)].filter(Boolean)],
  );
  const thumbUrl = (id: string | null) => {
    const a = thumbs.find((t) => t.id === id);
    if (!a) return null;
    const ref = toMediaRef(a, false);
    return ref.variants.thumb?.url ?? ref.url;
  };
  const result: AdminGroup[] = groups.map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    status: g.status,
    thumbnailAssetId: g.thumbnail_asset_id,
    thumbUrl: thumbUrl(g.thumbnail_asset_id) ?? thumbUrl((() => {
      const first = aps.find((a) => a.group_id === g.id);
      return first ? (first.thumbnail_asset_id ?? first.panorama_asset_id) : null;
    })()),
    floorPlanId: g.floor_plan_id,
    defaultAccessPointId: g.default_access_point_id,
    accessPoints: aps
      .filter((a) => a.group_id === g.id)
      .map((a) => ({
        id: a.id,
        name: a.name,
        status: a.status,
        groupId: g.id,
        groupName: g.name,
        hasPanorama: !!a.pano_key,
        thumbUrl: thumbUrl(a.thumbnail_asset_id ?? a.panorama_asset_id),
        hotspotCount: a.hotspot_count,
        floorPlanId: a.floor_plan_id,
        marker: a.marker_x !== null ? { x: Number(a.marker_x), y: Number(a.marker_y) } : null,
        headingOffset: Number(a.heading_offset),
        initialYaw: Number(a.initial_yaw),
      })),
  }));
  return {
    tour: {
      id: tour.id as string,
      type,
      name: tour.name as string,
      description: tour.description as string,
      status: tour.status as "draft" | "published",
      defaultAccessPointId: tour.default_access_point_id as string | null,
    },
    groups: result,
  };
}

export async function getAccessPointForEditor(projectId: string, apId: string) {
  const ap = await queryOne<any>(
    `select ap.*, t.type as tour_type, g.name as group_name from access_points ap
       join tour_groups g on g.id = ap.group_id join tours t on t.id = g.tour_id
      where ap.id = $1 and t.project_id = $2`,
    [apId, projectId],
  );
  if (!ap) return null;
  const hotspots = await query<any>(
    "select * from hotspots where source_access_point_id = $1 order by display_order, created_at",
    [apId],
  );
  return {
    id: ap.id as string,
    tourType: ap.tour_type as TourType,
    name: ap.name as string,
    groupId: ap.group_id as string,
    groupName: ap.group_name as string,
    status: ap.status as "draft" | "published",
    panorama: await getAdminAsset(projectId, ap.panorama_asset_id),
    thumbnail: await getAdminAsset(projectId, ap.thumbnail_asset_id),
    initialYaw: Number(ap.initial_yaw),
    initialPitch: Number(ap.initial_pitch),
    initialFov: Number(ap.initial_fov),
    floorPlanId: ap.floor_plan_id as string | null,
    marker: ap.marker_x !== null ? { x: Number(ap.marker_x), y: Number(ap.marker_y) } : null,
    headingOffset: Number(ap.heading_offset),
    hotspots: hotspots.map((h) => ({
      id: h.id as string,
      destinationAccessPointId: h.destination_access_point_id as string,
      label: h.label as string,
      yaw: Number(h.yaw),
      pitch: Number(h.pitch),
      style: h.style as "ring" | "arrow" | "door",
    })),
  };
}
export type EditorAccessPoint = NonNullable<Awaited<ReturnType<typeof getAccessPointForEditor>>>;

export interface AdminFloorPlan {
  id: string;
  name: string;
  status: "draft" | "published";
  orientationOffset: number;
  pageNumber: number | null;
  image: AdminAsset | null;
  originalPdf: AdminAsset | null;
}

export async function listFloorPlans(projectId: string): Promise<AdminFloorPlan[]> {
  const rows = await query<any>("select * from floor_plans where project_id = $1 order by display_order, created_at", [projectId]);
  return Promise.all(
    rows.map(async (f) => ({
      id: f.id,
      name: f.name,
      status: f.status,
      orientationOffset: Number(f.orientation_offset),
      pageNumber: f.page_number,
      image: await getAdminAsset(projectId, f.image_asset_id),
      originalPdf: await getAdminAsset(projectId, f.original_pdf_asset_id),
    })),
  );
}

export async function listDocuments(projectId: string) {
  const rows = await query<any>("select * from documents where project_id = $1", [projectId]);
  const out: Record<"floor_plan" | "brochure", { title: string; status: "draft" | "published"; allowDownload: boolean; asset: AdminAsset | null }> = {
    floor_plan: { title: "Floor Plan", status: "draft", allowDownload: false, asset: null },
    brochure: { title: "Brochure", status: "draft", allowDownload: false, asset: null },
  };
  for (const d of rows) {
    out[d.type as "floor_plan" | "brochure"] = {
      title: d.title,
      status: d.status,
      allowDownload: d.allow_download,
      asset: await getAdminAsset(projectId, d.asset_id),
    };
  }
  return out;
}

export interface ContentWarning {
  severity: "error" | "warning";
  message: string;
  href: string;
}

/** Checks that surface on the dashboard and the publish page. */
export async function contentWarnings(projectId: string): Promise<ContentWarning[]> {
  const w: ContentWarning[] = [];
  const drafts = await draftSummary(projectId);
  const draftCount = drafts.viewpoints + drafts.rooms + drafts.tours;
  if (draftCount > 0) {
    w.push({
      severity: "warning",
      message: `${drafts.viewpoints} viewpoint(s), ${drafts.rooms} room(s)/amenit(ies) and ${drafts.tours} tour(s) are still marked Draft and won't be published. Use “Mark all as Published & publish”.`,
      href: "/admin/publish",
    });
  }
  const project = await queryOne<any>("select * from projects where id = $1", [projectId]);
  if (!project?.hero_asset_id) w.push({ severity: "warning", message: "No hero image is set for the landing page.", href: "/admin/settings" });

  const aps = await query<any>(
    `select ap.id, ap.name, ap.status, ap.panorama_asset_id, ap.marker_x, g.name as group_name, g.status as group_status,
            t.type, t.status as tour_status, coalesce(ap.floor_plan_id, g.floor_plan_id) as plan_id,
            (select count(*)::int from hotspots h where h.source_access_point_id = ap.id) as hotspots
       from access_points ap join tour_groups g on g.id = ap.group_id join tours t on t.id = g.tour_id
      where t.project_id = $1`,
    [projectId],
  );
  for (const ap of aps) {
    const href = `/admin/access-points/${ap.id}`;
    const label = `${ap.group_name} — ${ap.name}`;
    if (!ap.panorama_asset_id) w.push({ severity: ap.status === "published" ? "error" : "warning", message: `${label} has no panorama.`, href });
    if (ap.plan_id && ap.marker_x === null) w.push({ severity: "warning", message: `${label} is not placed on its floor plan.`, href });
    if (!ap.plan_id) w.push({ severity: "warning", message: `${label} has no floor plan (the navigator will be hidden).`, href });
    if (ap.hotspots === 0 && aps.filter((x) => x.type === ap.type).length > 1) {
      w.push({ severity: "warning", message: `${label} has no navigation hotspots.`, href });
    }
  }
  const broken = await query<any>(
    `select h.id, src.id as src_id, src.name as src_name, dst.name as dst_name
       from hotspots h
       join access_points src on src.id = h.source_access_point_id
       join access_points dst on dst.id = h.destination_access_point_id
       join tour_groups dg on dg.id = dst.group_id
       join tour_groups sg on sg.id = src.group_id
       join tours t on t.id = sg.tour_id
      where t.project_id = $1 and src.status = 'published' and sg.status = 'published'
        and (dst.status <> 'published' or dg.status <> 'published')`,
    [projectId],
  );
  for (const b of broken) {
    w.push({
      severity: "warning",
      message: `Hotspot from “${b.src_name}” leads to unpublished “${b.dst_name}” and will be hidden publicly.`,
      href: `/admin/access-points/${b.src_id}`,
    });
  }
  const docs = await query<any>("select type, status, asset_id from documents where project_id = $1", [projectId]);
  for (const type of ["floor_plan", "brochure"]) {
    const d = docs.find((x) => x.type === type);
    if (!d?.asset_id) w.push({ severity: "warning", message: `No ${type === "brochure" ? "brochure" : "floor plan"} PDF is configured.`, href: "/admin/documents" });
  }
  return w;
}

export async function dashboardStats(projectId: string) {
  const counts = await queryOne<any>(
    `select
       (select count(*)::int from tour_groups g join tours t on t.id = g.tour_id where t.project_id = $1 and t.type = 'rooms') as rooms,
       (select count(*)::int from tour_groups g join tours t on t.id = g.tour_id where t.project_id = $1 and t.type = 'amenities') as amenities,
       (select count(*)::int from access_points ap join tour_groups g on g.id = ap.group_id join tours t on t.id = g.tour_id where t.project_id = $1) as access_points,
       (select count(*)::int from access_points ap join tour_groups g on g.id = ap.group_id join tours t on t.id = g.tour_id where t.project_id = $1 and ap.status = 'published') as published_access_points,
       (select count(*)::int from hotspots h join access_points ap on ap.id = h.source_access_point_id join tour_groups g on g.id = ap.group_id join tours t on t.id = g.tour_id where t.project_id = $1) as hotspots,
       (select count(*)::int from assets where project_id = $1 and status = 'ready') as assets,
       (select coalesce(sum(file_size), 0)::bigint from assets where project_id = $1 and status = 'ready') as asset_bytes,
       (select count(*)::int from floor_plans where project_id = $1) as floor_plans`,
    [projectId],
  );
  const latest = await getLatestPublication(projectId);
  const lastEdit = await queryOne<{ at: string | null }>(
    `select greatest(
        (select max(updated_at) from projects where id = $1),
        (select max(updated_at) from assets where project_id = $1),
        (select max(updated_at) from floor_plans where project_id = $1),
        (select max(updated_at) from documents where project_id = $1),
        (select max(t.updated_at) from tours t where t.project_id = $1),
        (select max(g.updated_at) from tour_groups g join tours t on t.id = g.tour_id where t.project_id = $1),
        (select max(ap.updated_at) from access_points ap join tour_groups g on g.id = ap.group_id join tours t on t.id = g.tour_id where t.project_id = $1),
        (select max(h.updated_at) from hotspots h join access_points ap on ap.id = h.source_access_point_id join tour_groups g on g.id = ap.group_id join tours t on t.id = g.tour_id where t.project_id = $1)
      ) as at`,
    [projectId],
  );
  return {
    ...counts,
    asset_bytes: Number(counts?.asset_bytes ?? 0),
    lastPublishedAt: latest?.created_at ? new Date(latest.created_at).toISOString() : null,
    lastEditedAt: lastEdit?.at ? new Date(lastEdit.at).toISOString() : null,
  };
}
