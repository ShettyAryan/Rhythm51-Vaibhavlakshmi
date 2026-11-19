/**
 * Shapes of the content delivered to the public site. A "snapshot" is built from
 * the editable tables and frozen on publish; the admin preview builds the same
 * shape on the fly from draft data, so both render through identical code.
 */

export type TourType = "rooms" | "amenities";
export const TOUR_TYPES: TourType[] = ["rooms", "amenities"];

export type PublicationStatus = "draft" | "published";

export interface MediaRef {
  id: string;
  /** URL of the original file. */
  url: string;
  width: number | null;
  height: number | null;
  /** e.g. "image/webp", "image/gif", "video/mp4" (absent in older publications = image). */
  mimeType?: string;
  /**
   * Renditions keyed by name, when available: thumb ≈640w, md ≈2048w, lg ≈4096w,
   * and for heavy panoramas "full" = original resolution, web-optimised (WebP).
   */
  variants: Partial<Record<"thumb" | "md" | "lg" | "full", { url: string; width: number; height: number }>>;
}

/** One file inside a document (a PDF, or an image such as a floor plan drawing). */
export interface DocumentFile {
  /** Asset id. */
  id: string;
  /** Tab label; falls back to the file name when empty. */
  title: string;
  kind: "pdf" | "image";
  url: string;
  fileName: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  /** Downscaled renditions (images only). */
  variants: MediaRef["variants"];
  /** URL that forces a download (only when the document allows downloads). */
  downloadUrl: string | null;
}

export interface DocumentRef {
  id: string;
  title: string;
  allowDownload: boolean;
  /** Shown as tabs in the viewer, in this order. Never empty. */
  files: DocumentFile[];
}

export interface HotspotData {
  id: string;
  destinationId: string;
  label: string;
  yaw: number;
  pitch: number;
  style: "ring" | "arrow" | "door";
}

export interface AccessPointData {
  id: string;
  groupId: string;
  name: string;
  panorama: MediaRef | null;
  thumbnail: MediaRef | null;
  initialYaw: number;
  initialPitch: number;
  initialFov: number;
  /** Effective plan (access point's own, else its group's). */
  floorPlanId: string | null;
  marker: { x: number; y: number } | null;
  headingOffset: number;
  hotspots: HotspotData[];
  /** Only present in admin preview builds. */
  status?: PublicationStatus;
}

export interface GroupData {
  id: string;
  name: string;
  description: string;
  thumbnail: MediaRef | null;
  floorPlanId: string | null;
  defaultAccessPointId: string | null;
  accessPoints: AccessPointData[];
  status?: PublicationStatus;
}

export interface FloorPlanData {
  id: string;
  name: string;
  image: MediaRef;
  orientationOffset: number;
}

export interface TourData {
  id: string;
  type: TourType;
  name: string;
  description: string;
  defaultAccessPointId: string | null;
  groups: GroupData[];
  floorPlans: Record<string, FloorPlanData>;
}

export interface ProjectData {
  id: string;
  slug: string;
  name: string;
  developerName: string;
  logo: MediaRef | null;
  /** Desktop cover image (also the fallback when no tablet/mobile image is set). */
  hero: MediaRef | null;
  /** Tablet held sideways (landscape). */
  heroTablet?: MediaRef | null;
  /** Tablet held upright (portrait). */
  heroTabletPortrait?: MediaRef | null;
  heroMobile?: MediaRef | null;
  /** Background music (MP3), looped; visitors can mute it. */
  music?: MediaRef | null;
  /** 0–1 playback volume for the music. */
  musicVolume?: number;
  heroHeadline: string;
  heroSubtitle: string;
  showHeroText: boolean;
  heroOverlay: number;
  aboutText: string;
  navLabels: NavLabels;
  theme: ThemeConfig;
  contact: ContactInfo;
}

export interface NavLabels {
  rooms: string;
  amenities: string;
  floorPlan: string;
  brochure: string;
}

export interface ThemeConfig {
  primary?: string;
  primaryDark?: string;
  accent?: string;
  ivory?: string;
  rose?: string;
  /** Landing page menu buttons. */
  menu?: string;
}

export interface ContactInfo {
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
}

export interface Snapshot {
  version: 1;
  builtAt: string;
  mode: "published" | "preview";
  project: ProjectData;
  documents: { floorPlan: DocumentRef | null; brochure: DocumentRef | null };
  tours: Record<TourType, TourData | null>;
}

export const DEFAULT_NAV_LABELS: NavLabels = {
  rooms: "Explore Room",
  amenities: "Explore Amenities",
  floorPlan: "Floor Plan",
  brochure: "Brochure",
};
