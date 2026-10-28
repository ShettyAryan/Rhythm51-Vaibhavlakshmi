import type { Queryable } from "../db";
import {
  DEFAULT_NAV_LABELS,
  TOUR_TYPES,
  type AccessPointData,
  type DocumentRef,
  type FloorPlanData,
  type GroupData,
  type HotspotData,
  type MediaRef,
  type ProjectData,
  type Snapshot,
  type TourData,
  type TourType,
} from "../tour/types";
import type { AssetRow } from "./rows";

/**
 * Builds the visitor-facing content tree for a project.
 *
 * mode "published": only entities whose status is "published" (and whose parents
 *   are published) are included; hotspots pointing at excluded destinations are
 *   dropped; access points without a usable panorama are dropped. Media URLs are
 *   marked `p=1` so /api/media serves the frozen file recorded in the publication.
 * mode "preview": same rules unless includeDrafts is set, in which case draft
 *   entities are included too. URLs are admin-only (current files).
 */
export async function buildSnapshot(
  db: Queryable,
  projectId: string,
  opts: { mode: "published" | "preview"; includeDrafts?: boolean },
): Promise<{ snapshot: Snapshot; assets: Map<string, AssetRow> } | null> {
  const includeDrafts = opts.mode === "preview" && !!opts.includeDrafts;
  const visible = (status: string) => includeDrafts || status === "published";

  const project = (await db.query<Record<string, any>>("select * from projects where id = $1", [projectId])).rows[0];
  if (!project) return null;

  const assetRows = (
    await db.query<AssetRow>("select * from assets where project_id = $1 and status = 'ready'", [projectId])
  ).rows;
  const assetById = new Map(assetRows.map((a) => [a.id, a]));
  const used = new Map<string, AssetRow>();
  const published = opts.mode === "published";

  const media = (id: string | null | undefined, expect?: (a: AssetRow) => boolean): MediaRef | null => {
    if (!id) return null;
    const a = assetById.get(id);
    if (!a || !a.storage_key || (expect && !expect(a))) return null;
    used.set(a.id, a);
    return toMediaRef(a, published);
  };
  const isImage = (a: AssetRow) => a.mime_type.startsWith("image/");
  const isPdf = (a: AssetRow) => a.mime_type === "application/pdf";

  // ---- Floor plans -------------------------------------------------------
  const planRows = (
    await db.query<Record<string, any>>(
      "select * from floor_plans where project_id = $1 order by display_order, created_at",
      [projectId],
    )
  ).rows;
  const plans = new Map<string, FloorPlanData>();
  for (const p of planRows) {
    if (!visible(p.status)) continue;
    const image = media(p.image_asset_id, isImage);
    if (!image) continue;
    plans.set(p.id, { id: p.id, name: p.name, image, orientationOffset: Number(p.orientation_offset) || 0 });
  }

  // ---- Tours -------------------------------------------------------------
  const tours: Record<TourType, TourData | null> = { rooms: null, amenities: null };
  const tourRows = (await db.query<Record<string, any>>("select * from tours where project_id = $1", [projectId])).rows;
  for (const type of TOUR_TYPES) {
    const t = tourRows.find((r) => r.type === type);
    if (!t || !visible(t.status)) continue;

    const groupRows = (
      await db.query<Record<string, any>>(
        "select * from tour_groups where tour_id = $1 order by display_order, created_at",
        [t.id],
      )
    ).rows.filter((g) => visible(g.status));
    const groupIds = groupRows.map((g) => g.id);
    const apRows = groupIds.length
      ? (
          await db.query<Record<string, any>>(
            "select * from access_points where group_id = any($1::uuid[]) order by display_order, created_at",
            [groupIds],
          )
        ).rows
      : [];
    const apIncluded = apRows.filter(
      (ap) => visible(ap.status) && (includeDrafts || (ap.panorama_asset_id && assetById.get(ap.panorama_asset_id)?.storage_key)),
    );
    const includedIds = new Set(apIncluded.map((a) => a.id));
    const hotspotRows = includedIds.size
      ? (
          await db.query<Record<string, any>>(
            "select * from hotspots where source_access_point_id = any($1::uuid[]) order by display_order, created_at",
            [[...includedIds]],
          )
        ).rows
      : [];

    const tourPlans: Record<string, FloorPlanData> = {};
    const groups: GroupData[] = groupRows.map((g) => {
      const accessPoints: AccessPointData[] = apIncluded
        .filter((ap) => ap.group_id === g.id)
        .map((ap) => {
          const planId = (ap.floor_plan_id ?? g.floor_plan_id) as string | null;
          const plan = planId ? plans.get(planId) : undefined;
          if (plan) tourPlans[plan.id] = plan;
          const hotspots: HotspotData[] = hotspotRows
            .filter((h) => h.source_access_point_id === ap.id && includedIds.has(h.destination_access_point_id))
            .map((h) => ({
              id: h.id,
              destinationId: h.destination_access_point_id,
              label: h.label,
              yaw: Number(h.yaw),
              pitch: Number(h.pitch),
              style: h.style,
            }));
          const data: AccessPointData = {
            id: ap.id,
            groupId: g.id,
            name: ap.name,
            panorama: media(ap.panorama_asset_id, isImage),
            thumbnail: media(ap.thumbnail_asset_id, isImage),
            initialYaw: Number(ap.initial_yaw),
            initialPitch: Number(ap.initial_pitch),
            initialFov: Number(ap.initial_fov),
            floorPlanId: plan ? plan.id : null,
            marker: plan && ap.marker_x !== null && ap.marker_y !== null ? { x: Number(ap.marker_x), y: Number(ap.marker_y) } : null,
            headingOffset: Number(ap.heading_offset) || 0,
            hotspots,
          };
          if (!published) data.status = ap.status;
          return data;
        });
      const defaultAp =
        accessPoints.find((a) => a.id === g.default_access_point_id)?.id ?? accessPoints[0]?.id ?? null;
      const group: GroupData = {
        id: g.id,
        name: g.name,
        description: g.description,
        thumbnail: media(g.thumbnail_asset_id, isImage),
        floorPlanId: g.floor_plan_id && plans.has(g.floor_plan_id) ? g.floor_plan_id : null,
        defaultAccessPointId: defaultAp,
        accessPoints,
      };
      if (group.floorPlanId) tourPlans[group.floorPlanId] = plans.get(group.floorPlanId)!;
      if (!published) group.status = g.status as never;
      return group;
    });

    const nonEmpty = groups.filter((g) => g.accessPoints.length > 0 || includeDrafts);
    const allAps = nonEmpty.flatMap((g) => g.accessPoints);
    const defaultAccessPointId =
      allAps.find((a) => a.id === t.default_access_point_id)?.id ?? nonEmpty[0]?.defaultAccessPointId ?? null;
    tours[type] = {
      id: t.id,
      type,
      name: t.name,
      description: t.description,
      defaultAccessPointId,
      groups: nonEmpty,
      floorPlans: tourPlans,
    };
  }

  // ---- Documents ----------------------------------------------------------
  const docRows = (await db.query<Record<string, any>>("select * from documents where project_id = $1", [projectId])).rows;
  const doc = (type: "floor_plan" | "brochure"): DocumentRef | null => {
    const d = docRows.find((r) => r.type === type);
    if (!d || !visible(d.status) || !d.asset_id) return null;
    const ref = media(d.asset_id, isPdf);
    if (!ref) return null;
    const a = assetById.get(d.asset_id)!;
    return {
      id: a.id,
      title: d.title,
      url: ref.url,
      fileName: a.file_name,
      fileSize: Number(a.file_size),
      allowDownload: !!d.allow_download,
      downloadUrl: d.allow_download ? `${ref.url}&download=1` : null,
    };
  };

  // ---- Project ------------------------------------------------------------
  const projectData: ProjectData = {
    id: project.id,
    slug: project.slug,
    name: project.name,
    developerName: project.developer_name,
    logo: media(project.logo_asset_id, isImage),
    hero: media(project.hero_asset_id, isImage),
    heroHeadline: project.hero_headline,
    heroSubtitle: project.hero_subtitle,
    showHeroText: !!project.show_hero_text,
    heroOverlay: Number(project.hero_overlay),
    aboutText: project.about_text,
    navLabels: { ...DEFAULT_NAV_LABELS, ...pickStrings(project.nav_labels) },
    theme: pickStrings(project.theme),
    contact: pickStrings(project.contact),
  };

  const snapshot: Snapshot = {
    version: 1,
    builtAt: new Date().toISOString(),
    mode: opts.mode,
    project: projectData,
    documents: { floorPlan: doc("floor_plan"), brochure: doc("brochure") },
    tours,
  };
  return { snapshot, assets: used };
}

function pickStrings(obj: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

export function mediaUrl(a: Pick<AssetRow, "id" | "version">, published: boolean, variant?: string) {
  const params = new URLSearchParams({ v: String(a.version) });
  if (published) params.set("p", "1");
  if (variant) params.set("variant", variant);
  return `/api/media/${a.id}?${params.toString()}`;
}

export function toMediaRef(a: AssetRow, published: boolean): MediaRef {
  const variants: MediaRef["variants"] = {};
  const meta = (a.metadata ?? {}) as { variants?: Record<string, { key: string; width: number; height: number }> };
  for (const name of ["thumb", "md", "lg", "full"] as const) {
    const v = meta.variants?.[name];
    if (v) variants[name] = { url: mediaUrl(a, published, name), width: v.width, height: v.height };
  }
  return { id: a.id, url: mediaUrl(a, published), width: a.width, height: a.height, variants };
}

/** Storage keys a publication needs, so /api/media can serve frozen files. */
export function assetKeyMap(assets: Map<string, AssetRow>) {
  const map: Record<string, { key: string; mime: string; fileName: string; variants: Record<string, string> }> = {};
  for (const a of assets.values()) {
    const meta = (a.metadata ?? {}) as { variants?: Record<string, { key: string }> };
    const variants: Record<string, string> = {};
    for (const [name, v] of Object.entries(meta.variants ?? {})) variants[name] = v.key;
    map[a.id] = { key: a.storage_key!, mime: a.mime_type, fileName: a.file_name, variants };
  }
  return map;
}
