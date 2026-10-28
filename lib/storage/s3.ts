import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { contentDisposition, type StorageDriver } from "./index";

interface S3Config {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

/**
 * S3-compatible storage (Supabase Storage S3 endpoint, Cloudflare R2, AWS S3...).
 * The bucket must be private and allow CORS GET/PUT from the site origin.
 */
export function createS3Storage(cfg: S3Config): StorageDriver {
  const client = new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    forcePathStyle: cfg.forcePathStyle,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });
  const Bucket = cfg.bucket;

  return {
    kind: "s3",
    async createUploadTarget(key, contentType) {
      const url = await getSignedUrl(client, new PutObjectCommand({ Bucket, Key: key, ContentType: contentType }), {
        expiresIn: 60 * 30,
      });
      return { url, headers: { "Content-Type": contentType } };
    },
    async put(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }));
    },
    async head(key) {
      try {
        const res = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
        return { size: Number(res.ContentLength ?? 0) };
      } catch {
        return null;
      }
    },
    async read(key, start, length) {
      const Range =
        start !== undefined ? `bytes=${start}-${length !== undefined ? start + length - 1 : ""}` : undefined;
      const res = await client.send(new GetObjectCommand({ Bucket, Key: key, Range }));
      const bytes = await res.Body!.transformToByteArray();
      return Buffer.from(bytes);
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },
    async serve(key, { contentType, cacheControl, fileName, download }) {
      const url = await getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket,
          Key: key,
          ResponseContentType: contentType,
          ResponseCacheControl: cacheControl,
          ResponseContentDisposition: fileName ? contentDisposition(fileName, !!download) : undefined,
        }),
        { expiresIn: 60 * 60 },
      );
      // Keep the redirect itself short-lived so signed URLs are not reused for too long.
      return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "private, max-age=300" } });
    },
  };
}
