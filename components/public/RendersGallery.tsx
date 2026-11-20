"use client";

import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DocumentFile, DocumentRef } from "@/lib/tour/types";
import { documentFiles } from "./DocumentViewer";

const srcSet = (f: DocumentFile) =>
  [
    f.variants.md && `${f.variants.md.url} ${f.variants.md.width}w`,
    f.variants.lg && `${f.variants.lg.url} ${f.variants.lg.width}w`,
    f.width && `${f.url} ${f.width}w`,
  ]
    .filter(Boolean)
    .join(", ") || undefined;

/**
 * Render gallery: one large picture at a time with arrows, swipe and arrow keys,
 * a caption, a counter and a thumbnail strip.
 */
export function RendersGallery({ doc, title, onClose }: { doc: DocumentRef; title: string; onClose: () => void }) {
  const files = documentFiles(doc).filter((f) => f.kind === "image");
  const [index, setIndex] = useState(0);
  const count = files.length;
  const file = files[index]!;
  const go = (to: number) => setIndex(((to % count) + count) % count);
  const strip = useRef<HTMLUListElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);

  // Arrow keys (Escape is handled by the dialog).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setIndex((i) => (i + 1) % count);
      if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + count) % count);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count]);

  // Keep the current thumbnail in view, and warm up the neighbours.
  useEffect(() => {
    strip.current?.children[index]?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    for (const n of [files[(index + 1) % count], files[(index - 1 + count) % count]]) {
      if (!n) continue;
      const img = new Image();
      img.sizes = "100vw";
      img.srcset = srcSet(n) ?? "";
      img.src = n.variants.lg?.url ?? n.url;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, count]);

  const ctrl = "grid size-10 place-items-center rounded-full text-ivory transition hover:bg-ivory/15";
  const arrow =
    "absolute top-1/2 z-10 grid size-12 -translate-y-1/2 place-items-center rounded-full border border-ivory/25 bg-black/40 text-ivory backdrop-blur transition hover:bg-menu/90 sm:size-14";

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#1d1418]" data-testid="renders-gallery">
      <div className="flex items-center gap-3 border-b border-gold/25 bg-menu px-3 py-2 text-ivory sm:px-4">
        <div className="min-w-0 flex-1">
          <p className="eyebrow text-gold-soft">{doc.title || title}</p>
          <p className="truncate text-sm text-ivory/90" data-testid="render-caption">
            {file.title || " "}
          </p>
        </div>
        <span className="text-sm tabular-nums text-ivory/90" data-testid="render-counter">
          {index + 1} / {count}
        </span>
        {doc.allowDownload && file.downloadUrl && (
          <a href={file.downloadUrl} download={file.fileName} className={ctrl} aria-label="Download image" title="Download image">
            <Download className="size-5" />
          </a>
        )}
        <button type="button" onClick={onClose} className={`${ctrl} border border-ivory/30`} aria-label="Close">
          <X className="size-5" />
        </button>
      </div>

      <div
        className="relative min-h-0 flex-1 touch-pan-y select-none"
        onPointerDown={(e) => (swipe.current = { x: e.clientX, y: e.clientY })}
        onPointerUp={(e) => {
          const s = swipe.current;
          swipe.current = null;
          if (!s || count < 2) return;
          const dx = e.clientX - s.x;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - s.y)) go(index + (dx < 0 ? 1 : -1));
        }}
      >
        <img
          key={file.id}
          src={file.variants.lg?.url ?? file.url}
          srcSet={srcSet(file)}
          sizes="100vw"
          alt={file.title || `${title} ${index + 1}`}
          className="absolute inset-0 h-full w-full animate-[render-in_220ms_ease-out] object-contain p-2 sm:p-4"
          draggable={false}
          data-testid="render-image"
        />
        {count > 1 && (
          <>
            <button type="button" onClick={() => go(index - 1)} className={`${arrow} left-2 sm:left-4`} aria-label="Previous render" data-testid="render-prev">
              <ChevronLeft className="size-6" />
            </button>
            <button type="button" onClick={() => go(index + 1)} className={`${arrow} right-2 sm:right-4`} aria-label="Next render" data-testid="render-next">
              <ChevronRight className="size-6" />
            </button>
          </>
        )}
      </div>

      {count > 1 && (
        <ul ref={strip} className="scroll-thin flex shrink-0 gap-2 overflow-x-auto border-t border-ivory/10 bg-black/30 p-2 sm:justify-center sm:p-3" role="list" aria-label="All renders">
          {files.map((f, i) => (
            <li key={f.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={f.title || `Render ${i + 1}`}
                aria-current={i === index ? "true" : undefined}
                className={`block h-14 w-20 overflow-hidden border-2 transition sm:h-16 sm:w-24 ${i === index ? "border-gold-soft" : "border-transparent opacity-60 hover:opacity-100"}`}
                data-testid="render-thumb"
              >
                <img src={f.variants.thumb?.url ?? f.url} alt="" loading="lazy" className="h-full w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
