import path from "node:path";

/** Centralised, validated access to server-side environment configuration. */
export const env = {
  get databaseUrl(): string | undefined {
    return process.env.DATABASE_URL?.trim() || undefined;
  },
  get dataDir(): string {
    return path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.DATA_DIR?.trim() || ".data");
  },
  get storageDriver(): "local" | "s3" {
    return process.env.STORAGE_DRIVER === "s3" ? "s3" : "local";
  },
  get publicProjectSlug(): string | undefined {
    return process.env.PUBLIC_PROJECT_SLUG?.trim() || undefined;
  },
  get secureCookies(): boolean {
    return process.env.SECURE_COOKIES === "true";
  },
  s3() {
    const required = ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const;
    for (const key of required) {
      if (!process.env[key]) throw new Error(`${key} must be set when STORAGE_DRIVER=s3`);
    }
    return {
      endpoint: process.env.S3_ENDPOINT || undefined,
      region: process.env.S3_REGION || "auto",
      bucket: process.env.S3_BUCKET!,
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
    };
  },
};
