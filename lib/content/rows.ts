/** Database row shapes (snake_case, as returned by the drivers). */

export interface AssetRow {
  id: string;
  project_id: string;
  category: AssetCategory;
  status: "uploading" | "ready";
  storage_key: string | null;
  pending_key: string | null;
  file_name: string;
  mime_type: string;
  file_size: string | number;
  width: number | null;
  height: number | null;
  version: number;
  metadata: AssetMetadata;
  created_at: string | Date;
  updated_at: string | Date;
}

export type AssetCategory = "panorama" | "image" | "floor_plan_image" | "pdf";
export const ASSET_CATEGORIES: AssetCategory[] = ["panorama", "image", "floor_plan_image", "pdf"];

export interface AssetMetadata {
  variants?: Partial<Record<"thumb" | "md" | "lg" | "full", { key: string; width: number; height: number }>>;
  pageCount?: number;
  /** Pending upload declared by the browser, verified on finalize. */
  pendingMime?: string;
  pendingFileName?: string;
  pendingSize?: number;
}

export interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  developer_name: string;
  logo_asset_id: string | null;
  hero_asset_id: string | null;
  hero_headline: string;
  hero_subtitle: string;
  show_hero_text: boolean;
  hero_overlay: number;
  about_text: string;
  nav_labels: Record<string, string>;
  theme: Record<string, string>;
  contact: Record<string, string>;
  settings: { autoPublish?: boolean };
  status: "draft" | "published";
  created_at: string | Date;
  updated_at: string | Date;
}
