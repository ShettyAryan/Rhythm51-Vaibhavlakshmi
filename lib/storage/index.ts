import { env } from "../env";

export interface StoredObjectInfo {
  size: number;
}

export interface UploadTarget {
  /** URL the browser should PUT the raw file body to. */
  url: string;
  headers: Record<string, string>;
}

export interface ServeOptions {
  contentType: string;
  range: string | null;
  cacheControl: string;
  fileName?: string;
  download?: boolean;
}

/**
 * Object storage abstraction. Keys look like `<projectId>/<assetId>/<random>.<ext>`.
 * Nothing in the bucket is public: visitors get files through /api/media, which
 * authorises each request against the published snapshot.
 */
export interface StorageDriver {
  readonly kind: "local" | "s3";
  /** Where the browser uploads a new object for `key`. */
  createUploadTarget(key: string, contentType: string, assetId: string): Promise<UploadTarget>;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  head(key: string): Promise<StoredObjectInfo | null>;
  /** Reads `length` bytes starting at `start` (whole object when omitted). */
  read(key: string, start?: number, length?: number): Promise<Buffer>;
  delete(key: string): Promise<void>;
  /**
   * Responds to a media request. Local storage streams the bytes (with HTTP Range
   * support); S3 redirects to a short-lived signed URL.
   */
  serve(key: string, opts: ServeOptions): Promise<Response>;
}

let driver: StorageDriver | undefined;

export async function getStorage(): Promise<StorageDriver> {
  if (!driver) {
    if (env.storageDriver === "s3") {
      const { createS3Storage } = await import("./s3");
      driver = createS3Storage(env.s3());
    } else {
      const { createLocalStorage } = await import("./local");
      driver = createLocalStorage(env.dataDir);
    }
  }
  return driver;
}

export function setStorageForTesting(d: StorageDriver | undefined) {
  driver = d;
}

export function contentDisposition(fileName: string, download: boolean) {
  const safe = fileName.replace(/[^\w.\- ]+/g, "_");
  const encoded = encodeURIComponent(fileName);
  return `${download ? "attachment" : "inline"}; filename="${safe}"; filename*=UTF-8''${encoded}`;
}
