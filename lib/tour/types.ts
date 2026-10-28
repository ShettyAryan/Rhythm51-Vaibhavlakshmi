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
  /**
   * Renditions keyed by name, when available: thumb ≈640w, md ≈2048w, lg ≈4096w,
   * and for heavy panoramas "full" = original resolution, web-optimised (WebP).
   */
  variants: Partial<Record<"thumb" | "md" | "lg" | "full", { url: string; width: number; height: number }>>;
}

export interface DocumentRef {
  id: string;
  title: string;
  url: string;
  fileName: string;
  fileSize: number;
  allowDownload: boolean;
  /** URL that forces a download (only when allowDownload). */
  downloadUrl: string | null;
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
  hero: MediaRef | null;
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
