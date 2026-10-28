"use client";

import type { AdminAsset } from "@/lib/content/queries";
import { isPanoramaAspect, PANORAMA_ASPECT } from "@/lib/tour/geometry";

export class ClientApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

/** JSON fetch against the admin API with consistent error handling. */
export async function api<T = unknown>(method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    window.location.href = `/admin/login?next=${encodeURIComponent(window.location.pathname)}`;
  }
  if (!res.ok) {
    const details = (data as { details?: unknown }).details;
    let message = (data as { error?: string }).error ?? `Request failed (${res.status})`;
    if (Array.isArray(details) && details[0]?.message) {
      message += `: ${details.map((d: { path?: string; message: string }) => (d.path ? `${d.path} — ${d.message}` : d.message)).join("; ")}`;
    }
    throw new ClientApiError(res.status, message, details);
  }
  return data as T;
}

export type UploadCategory = "panorama" | "image" | "floor_plan_image" | "pdf";

/** PUT a file with progress reporting (fetch has no upload progress events). */
function putWithProgress(url: string, file: Blob, headers: Record<string, string>, onProgress?: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else {
        let msg = `Upload failed (${xhr.status})`;
        try {
          msg = JSON.parse(xhr.responseText).error ?? msg;
        } catch {}
        reject(new ClientApiError(xhr.status, msg));
      }
    };
    xhr.onerror = () => reject(new ClientApiError(0, "Network error during upload"));
    xhr.send(file);
  });
}

const ACCEPT: Record<UploadCategory, string[]> = {
  panorama: ["image/jpeg", "image/png", "image/webp"],
  image: ["image/jpeg", "image/png", "image/webp"],
  floor_plan_image: ["image/jpeg", "image/png", "image/webp"],
  pdf: ["application/pdf"],
};
export const ACCEPT_ATTR: Record<UploadCategory, string> = {
  panorama: ".jpg,.jpeg,.png,.webp",
  image: ".jpg,.jpeg,.png,.webp",
  floor_plan_image: ".jpg,.jpeg,.png,.webp",
  pdf: ".pdf,application/pdf",
};

/**
 * Full upload flow: register → PUT bytes (direct to object storage when using
 * S3, or to the app for local storage) → finalize (server verifies & processes).
 * Pass `replaceAssetId` to upload a new version of an existing asset.
 */
export async function uploadFile(
  file: File | Blob,
  opts: { category: UploadCategory; fileName?: string; replaceAssetId?: string; onProgress?: (p: number) => void },
): Promise<AdminAsset> {
  const fileName = opts.fileName ?? (file as File).name ?? "upload";
  const mimeType = file.type || (fileName.toLowerCase().endsWith(".pdf") ? "application/pdf" : "");
  if (!ACCEPT[opts.category].includes(mimeType)) {
    throw new ClientApiError(400, opts.category === "pdf" ? "Please choose a PDF file." : "Please choose a JPEG, PNG or WebP image.");
  }
  if (opts.category === "panorama" && "name" in file) {
    const dims = await imageSize(file).catch(() => null);
    if (dims && !isPanoramaAspect(dims.w, dims.h)) {
      throw new ClientApiError(400, `Panoramas must be full 360° equirectangular images, ${PANORAMA_ASPECT.label}. This image is ${dims.w}×${dims.h}.`);
    }
  }
  const body = { fileName, mimeType, size: file.size, ...(opts.replaceAssetId ? {} : { category: opts.category }) };
  const start = await api<{ assetId: string; upload: { url: string; headers: Record<string, string> } }>(
    "POST",
    opts.replaceAssetId ? `/api/admin/assets/${opts.replaceAssetId}/replace` : "/api/admin/assets",
    body,
  );
  await putWithProgress(start.upload.url, file, start.upload.headers, (p) => opts.onProgress?.(p * 0.9));
  const done = await api<{ asset: AdminAsset }>("POST", `/api/admin/assets/${start.assetId}/finalize`);
  opts.onProgress?.(1);
  return done.asset;
}

function imageSize(file: Blob): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      reject(new Error("Unreadable image"));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
