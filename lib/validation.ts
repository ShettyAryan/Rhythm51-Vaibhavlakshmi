import { z } from "zod";
import { MAX_FOV, MIN_FOV, normalizeYaw } from "./tour/geometry";

/** Strips control characters and trims. Text is always rendered escaped by React. */
const text = (max: number) =>
  z
    .string()
    .max(max * 2)
    .transform((s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim())
    .pipe(z.string().max(max));

const requiredText = (max: number) => text(max).pipe(z.string().min(1, "Required"));

const id = z.uuid();
const nullableId = id.nullable();
const status = z.enum(["draft", "published"]);
const yaw = z.number().finite().transform(normalizeYaw);
const pitch = z.number().finite().min(-90).max(90);
const fov = z.number().finite().min(MIN_FOV).max(MAX_FOV);
const offset = z.number().finite().gt(-360).lt(360);
const unit = z.number().finite().min(0).max(1);
const color = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #51152F")
  .or(z.literal(""));
const url = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === "" || /^https?:\/\//i.test(v), "Must start with http:// or https://");

export const projectSettingsSchema = z
  .object({
    name: text(120),
    developerName: text(120),
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/, "Lowercase letters, numbers and dashes only"),
    logoAssetId: nullableId,
    heroAssetId: nullableId,
    heroHeadline: text(160),
    heroSubtitle: text(300),
    showHeroText: z.boolean(),
    heroOverlay: z.number().min(0).max(0.9),
    aboutText: text(3000),
    navLabels: z.object({
      rooms: text(40),
      amenities: text(40),
      floorPlan: text(40),
      brochure: text(40),
    }),
    theme: z.object({ primary: color, primaryDark: color, accent: color, ivory: color, rose: color }),
    contact: z.object({ phone: text(40), email: text(120), website: url, address: text(300) }),
    autoPublish: z.boolean(),
    status,
  })
  .partial();

export const tourUpdateSchema = z
  .object({
    name: requiredText(80),
    description: text(1000),
    status,
    defaultAccessPointId: nullableId,
  })
  .partial();

export const groupUpdateSchema = z
  .object({
    name: requiredText(80),
    description: text(1000),
    thumbnailAssetId: nullableId,
    floorPlanId: nullableId,
    defaultAccessPointId: nullableId,
    status,
  })
  .partial();

export const reorderSchema = z.object({ ids: z.array(id).min(1).max(500) });

export const hotspotInputSchema = z.object({
  id: id.optional(),
  destinationAccessPointId: id,
  label: text(80),
  yaw,
  pitch,
  style: z.enum(["ring", "arrow", "door"]).default("ring"),
});

export const accessPointUpdateSchema = z
  .object({
    name: requiredText(80),
    groupId: id,
    panoramaAssetId: nullableId,
    thumbnailAssetId: nullableId,
    initialYaw: yaw,
    initialPitch: pitch,
    initialFov: fov,
    floorPlanId: nullableId,
    marker: z.object({ x: unit, y: unit }).nullable(),
    headingOffset: offset,
    status,
    /** When present, replaces the access point's full hotspot list. */
    hotspots: z.array(hotspotInputSchema).max(50),
  })
  .partial();

export const floorPlanCreateSchema = z.object({ name: requiredText(80) });

export const floorPlanUpdateSchema = z
  .object({
    name: requiredText(80),
    imageAssetId: nullableId,
    originalPdfAssetId: nullableId,
    pageNumber: z.number().int().min(1).max(2000).nullable(),
    orientationOffset: offset,
    status,
    /** Bulk marker placement from the plan editor. */
    markers: z
      .array(
        z.object({
          accessPointId: id,
          marker: z.object({ x: unit, y: unit }).nullable(),
          /** Alignment of the panorama with the plan (see docs/COORDINATES.md). */
          headingOffset: offset.optional(),
          /** Direction visitors face when they arrive. */
          initialYaw: yaw.optional(),
        }),
      )
      .max(500),
  })
  .partial();

export const documentUpdateSchema = z
  .object({
    assetId: nullableId,
    title: text(120),
    status,
    allowDownload: z.boolean(),
  })
  .partial();

export const IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export const PDF_MIME = ["application/pdf"] as const;
export const MAX_IMAGE_BYTES = 80 * 1024 * 1024;
export const MAX_PDF_BYTES = 200 * 1024 * 1024;

export const uploadRequestSchema = z.object({
  fileName: requiredText(200),
  mimeType: z.enum([...IMAGE_MIME, ...PDF_MIME]),
  size: z.number().int().positive(),
  category: z.enum(["panorama", "image", "floor_plan_image", "pdf"]),
});

export const assetUpdateSchema = z.object({ fileName: requiredText(200) }).partial();

export const loginSchema = z.object({
  email: z.string().trim().max(200).email(),
  password: z.string().min(1).max(200),
});
