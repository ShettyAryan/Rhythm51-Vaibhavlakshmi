"use client";

import { Download, Maximize2, Minus, Plus, X } from "lucide-react";
import { useState } from "react";
import type { DocumentFile, DocumentRef } from "@/lib/tour/types";
import { PdfViewer } from "@/components/pdf/PdfViewer";
import { Spinner } from "@/components/ui/Spinner";

/**
 * Publications made before documents could hold several files stored a single
 * PDF directly on the document. Accept both shapes so an older publication keeps
 * working until the next publish.
 */
export function documentFiles(doc: DocumentRef | null | undefined): DocumentFile[] {
  if (!doc) return [];
  if (Array.isArray(doc.files)) return doc.files;
  const legacy = doc as unknown as { id: string; url?: string; fileName?: string; fileSize?: number; downloadUrl?: string | null };
  if (!legacy.url) return [];
  return [
    {
      id: legacy.id,
      title: "",
      kind: "pdf",
      url: legacy.url,
      fileName: legacy.fileName ?? "",
      fileSize: legacy.fileSize ?? 0,
      width: null,
      height: null,
      variants: {},
      downloadUrl: legacy.downloadUrl ?? null,
    },
  ];
}

const fileLabel = (f: DocumentFile) => f.title || f.fileName.replace(/\.[^.]+$/, "") || (f.kind === "pdf" ? "Document" : "Image");

/** Viewer for a document's files: one tab per file, PDFs and images alike. */
export function DocumentViewer({ doc, title, onClose }: { doc: DocumentRef; title: string; onClose: () => void }) {
  const files = documentFiles(doc);
  const [active, setActive] = useState(0);
  const file = files[Math.min(active, files.length - 1)];
  if (!file) return null;
  const heading = doc.title || title;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {files.length > 1 && (
        <div className="flex items-stretch border-b border-gold/25 bg-menu" data-testid="document-tabs">
          <div role="tablist" aria-label={heading} className="scroll-thin flex min-w-0 flex-1 overflow-x-auto">
            {files.map((f, i) => {
              const selected = f === file;
              return (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActive(i)}
                  data-testid={`document-tab-${i}`}
                  className={`shrink-0 border-b-2 px-4 py-2.5 text-[0.68rem] font-medium uppercase tracking-[0.18em] transition sm:px-6 sm:text-xs ${
                    selected ? "border-gold-soft text-ivory" : "border-transparent text-ivory/70 hover:bg-ivory/5 hover:text-ivory"
                  }`}
                >
                  {fileLabel(f)}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col" role={files.length > 1 ? "tabpanel" : undefined}>
        {file.kind === "pdf" ? (
          <PdfViewer
            key={file.id}
            url={file.url}
            title={files.length > 1 ? fileLabel(file) : heading}
            downloadUrl={file.downloadUrl}
            fileName={file.fileName}
            onClose={onClose}
          />
        ) : (
          <ImageViewer key={file.id} file={file} title={files.length > 1 ? fileLabel(file) : heading} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

/** Image counterpart of PdfViewer: fit-to-screen with zoom, same toolbar look. */
function ImageViewer({ file, title, onClose }: { file: DocumentFile; title: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const srcSet = [
    file.variants.md && `${file.variants.md.url} ${file.variants.md.width}w`,
    file.variants.lg && `${file.variants.lg.url} ${file.variants.lg.width}w`,
    file.width && `${file.url} ${file.width}w`,
  ]
    .filter(Boolean)
    .join(", ");
  const changeZoom = (z: number) => setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100)));
  const btn =
    "grid size-9 place-items-center rounded-full text-ivory/90 transition hover:bg-ivory/10 disabled:opacity-35 disabled:hover:bg-transparent";

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#2b2327]" data-testid="image-viewer">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-gold/25 bg-menu px-3 py-2 text-ivory sm:px-4">
        <div className="mr-auto min-w-0 pr-2">
          <p className="eyebrow text-gold-soft">{title}</p>
          {file.fileName && <p className="truncate text-xs text-ivory/60">{file.fileName}</p>}
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Zoom">
          <button type="button" className={btn} onClick={() => changeZoom(zoom - 0.25)} disabled={zoom <= MIN_ZOOM} aria-label="Zoom out">
            <Minus className="size-4" />
          </button>
          <span className="w-12 text-center text-xs tabular-nums text-ivory/80" aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
          <button type="button" className={btn} onClick={() => changeZoom(zoom + 0.25)} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in">
            <Plus className="size-4" />
          </button>
          <button type="button" className={btn} onClick={() => setZoom(1)} disabled={zoom === 1} aria-label="Fit to screen" title="Fit to screen">
            <Maximize2 className="size-4" />
          </button>
        </div>
        {file.downloadUrl && (
          <a href={file.downloadUrl} className={btn} aria-label="Download image" title="Download" download={file.fileName || true}>
            <Download className="size-4" />
          </a>
        )}
        <button type="button" className={`${btn} ml-1 border border-ivory/20`} onClick={onClose} aria-label="Close">
          <X className="size-4" />
        </button>
      </div>

      <div className="scroll-thin relative min-h-0 flex-1 overflow-auto overscroll-contain" tabIndex={0} aria-label={`${title} image`}>
        {!loaded && !failed && (
          <div className="absolute inset-0 grid place-items-center text-ivory/80" role="status">
            <Spinner className="text-gold" />
          </div>
        )}
        {failed && (
          <div className="absolute inset-0 grid place-items-center p-8 text-center font-display text-2xl text-ivory">The image could not be loaded.</div>
        )}
        {/* Fit: centred inside the visible area. Zoomed: wider than the area, scrolls. */}
        <div
          className={zoom > 1 ? "p-3 sm:p-8" : "absolute inset-0 flex items-center justify-center p-3 sm:p-8"}
          style={zoom > 1 ? { width: `${zoom * 100}%` } : undefined}
        >
          <img
            src={file.variants.lg?.url ?? file.url}
            srcSet={srcSet || undefined}
            sizes={`${Math.round(zoom * 100)}vw`}
            alt={title}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className={`bg-white shadow-[0_2px_18px_rgba(0,0,0,0.35)] transition-opacity ${loaded ? "opacity-100" : "opacity-0"} ${
              zoom > 1 ? "h-auto w-full max-w-none" : "max-h-full max-w-full object-contain"
            }`}
            data-testid="document-image"
          />
        </div>
      </div>
    </div>
  );
}
