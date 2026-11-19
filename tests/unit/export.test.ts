import { describe, expect, it } from "vitest";
import { rewriteMediaUrls } from "@/lib/export/static";
import type { Snapshot } from "@/lib/tour/types";

const id = "966908d4-26dc-45d8-9386-edbebc417ddc";
const pdf = "17605242-5fe5-432f-b656-6facbe7db633";

describe("static export URL rewriting", () => {
  it("maps published media URLs to versioned relative files", () => {
    const snapshot = {
      project: {
        hero: {
          id,
          url: `/api/media/${id}?v=3&p=1`,
          variants: { md: { url: `/api/media/${id}?v=3&p=1&variant=md`, width: 2048, height: 1024 } },
        },
      },
      documents: { brochure: { files: [{ url: `/api/media/${pdf}?v=1&p=1`, downloadUrl: `/api/media/${pdf}?v=1&p=1&download=1` }] } },
      other: "keep me",
    } as unknown as Snapshot;
    const keys = {
      [id]: { key: "p/a/orig.jpg", mime: "image/jpeg", fileName: "Hero Night (final).jpg", variants: { md: "p/a/md.webp" } },
      [pdf]: { key: "p/b/x.pdf", mime: "application/pdf", fileName: "Brochure.pdf", variants: {} },
    };
    const { snapshot: out, copies } = rewriteMediaUrls(snapshot, keys);
    const o = out as unknown as typeof snapshot & { other: string; documents: { brochure: { files: { url: string; downloadUrl: string }[] } } };
    expect(o.project.hero!.url).toBe(`media/${id}-v3/Hero-Night-final.jpg`);
    expect(o.project.hero!.variants.md!.url).toBe(`media/${id}-v3/md.webp`);
    expect(o.documents.brochure.files[0]!.url).toBe(`media/${pdf}-v1/Brochure.pdf`);
    expect(o.documents.brochure.files[0]!.downloadUrl).toBe(o.documents.brochure.files[0]!.url);
    expect(o.other).toBe("keep me");
    expect(Object.fromEntries(copies)).toEqual({
      [`media/${id}-v3/Hero-Night-final.jpg`]: "p/a/orig.jpg",
      [`media/${id}-v3/md.webp`]: "p/a/md.webp",
      [`media/${pdf}-v1/Brochure.pdf`]: "p/b/x.pdf",
    });
  });

  it("uses the optimised full-resolution copy instead of a heavy original", () => {
    const snapshot = {
      pano: { url: `/api/media/${id}?v=2&p=1`, variants: { full: { url: `/api/media/${id}?v=2&p=1&variant=full` } } },
    } as unknown as Snapshot;
    const keys = { [id]: { key: "p/a/huge.png", mime: "image/png", fileName: "render.png", variants: { full: "p/a/full.webp" } } };
    const { snapshot: out, copies } = rewriteMediaUrls(snapshot, keys);
    const o = out as unknown as { pano: { url: string; variants: { full: { url: string } } } };
    expect(o.pano.url).toBe(`media/${id}-v2/full.webp`);
    expect(o.pano.variants.full.url).toBe(`media/${id}-v2/full.webp`);
    expect([...copies.values()]).toEqual(["p/a/full.webp"]);
  });

  it("exports background music as an .mp3 file", () => {
    const snapshot = { project: { music: { url: `/api/media/${id}?v=3&p=1`, variants: {} } } } as unknown as Snapshot;
    const keys = { [id]: { key: "p/m/x.mp3", mime: "audio/mpeg", fileName: "Rhythm theme.mp3", variants: {} } };
    const { snapshot: out, copies } = rewriteMediaUrls(snapshot, keys);
    expect((out as unknown as { project: { music: { url: string } } }).project.music.url).toBe(`media/${id}-v3/Rhythm-theme.mp3`);
    expect(Object.fromEntries(copies)).toEqual({ [`media/${id}-v3/Rhythm-theme.mp3`]: "p/m/x.mp3" });
  });

  it("exports cover videos and GIFs with their own extensions", () => {
    const gifId = "22222222-2222-4222-8222-222222222222";
    const snapshot = {
      project: { hero: { url: `/api/media/${id}?v=1&p=1`, variants: {} }, heroMobile: { url: `/api/media/${gifId}?v=2&p=1`, variants: {} } },
    } as unknown as Snapshot;
    const keys = {
      [id]: { key: "p/v/x.mp4", mime: "video/mp4", fileName: "Cover film.mp4", variants: {} },
      [gifId]: { key: "p/g/x.gif", mime: "image/gif", fileName: "loop.gif", variants: {} },
    };
    const { copies } = rewriteMediaUrls(snapshot, keys);
    expect(Object.fromEntries(copies)).toEqual({
      [`media/${id}-v1/Cover-film.mp4`]: "p/v/x.mp4",
      [`media/${gifId}-v2/loop.gif`]: "p/g/x.gif",
    });
  });

  it("refuses files that are not part of the publication", () => {
    const snapshot = { project: { logo: { url: `/api/media/${id}?v=1&p=1` } } } as unknown as Snapshot;
    expect(() => rewriteMediaUrls(snapshot, {})).toThrow(/missing/);
  });
});
