import { createReadStream } from "node:fs";
import { mkdir, open, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { contentDisposition, type StorageDriver } from "./index";

export function createLocalStorage(dataDir: string): StorageDriver {
  const root = path.join(dataDir, "storage");

  const resolveKey = (key: string) => {
    if (!/^[\w\-/.]+$/.test(key) || key.includes("..")) throw new Error("Invalid storage key");
    const full = path.resolve(root, key);
    if (!full.startsWith(path.resolve(root) + path.sep)) throw new Error("Invalid storage key");
    return full;
  };

  return {
    kind: "local",
    async createUploadTarget(_key, contentType, assetId) {
      // The key is never sent to the browser; the upload route looks up the
      // asset's pending key server-side after authorising the admin.
      return { url: `/api/admin/assets/${assetId}/content`, headers: { "Content-Type": contentType } };
    },
    async put(key, body) {
      const file = resolveKey(key);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, body);
    },
    async head(key) {
      try {
        const s = await stat(resolveKey(key));
        return { size: s.size };
      } catch {
        return null;
      }
    },
    async read(key, start = 0, length) {
      const fh = await open(resolveKey(key), "r");
      try {
        const size = (await fh.stat()).size;
        const len = Math.max(0, Math.min(length ?? size - start, size - start));
        const buf = Buffer.alloc(len);
        await fh.read(buf, 0, len, start);
        return buf;
      } finally {
        await fh.close();
      }
    },
    async delete(key) {
      await rm(resolveKey(key), { force: true });
    },
    async serve(key, { contentType, range, cacheControl, fileName, download }) {
      const file = resolveKey(key);
      let size: number;
      try {
        size = (await stat(file)).size;
      } catch {
        return new Response("Not found", { status: 404 });
      }
      const headers: Record<string, string> = {
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
        "Cache-Control": cacheControl,
        "X-Content-Type-Options": "nosniff",
      };
      if (fileName) headers["Content-Disposition"] = contentDisposition(fileName, !!download);

      const parsed = range ? parseRange(range, size) : null;
      if (range && !parsed) {
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
      }
      if (parsed) {
        const { start, end } = parsed;
        const stream = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
        return new Response(stream, {
          status: 206,
          headers: {
            ...headers,
            "Content-Length": String(end - start + 1),
            "Content-Range": `bytes ${start}-${end}/${size}`,
          },
        });
      }
      const stream = Readable.toWeb(createReadStream(file)) as ReadableStream;
      return new Response(stream, { status: 200, headers: { ...headers, "Content-Length": String(size) } });
    },
  };
}

export function parseRange(header: string, size: number): { start: number; end: number } | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start: number;
  let end: number;
  if (m[1] === "") {
    const suffix = Number(m[2]);
    if (suffix === 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start > end || start >= size) return null;
  return { start, end };
}
