"use client";

import { ChevronLeft, ChevronRight, Download, Maximize2, Minus, Plus, RotateCw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { runtimeConfig } from "@/lib/client/runtime";
import { Spinner } from "@/components/ui/Spinner";

interface PdfViewerProps {
  url: string;
  title: string;
  downloadUrl?: string | null;
  fileName?: string;
  onClose?: () => void;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const MAX_CANVAS_PIXELS = 16_000_000;
const PAGE_GAP = 16;

/**
 * Continuous-scroll PDF viewer built directly on pdf.js. Pages render lazily as
 * they approach the viewport and are released when far away, so large brochures
 * (tens of MB) stay responsive. HTTP range requests fetch only what is needed.
 */
export function PdfViewer({ url, title, downloadUrl, fileName, onClose }: PdfViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState<number | null>(null);
  const [pageSizes, setPageSizes] = useState<{ w: number; h: number }[]>([]);
  const [containerWidth, setContainerWidth] = useState(0);
  const [zoom, setZoom] = useState(1); // multiplier on fit-to-width
  const [current, setCurrent] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [reloadKey, setReloadKey] = useState(0);

  // ---- Load document -------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;
    setDoc(null);
    setError(null);
    setPageSizes([]);
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = runtimeConfig.pdfWorkerSrc;
        task = pdfjs.getDocument({
          url,
          rangeChunkSize: 512 * 1024,
          disableAutoFetch: true,
          disableStream: true,
        });
        task.onProgress = ({ loaded: l, total }: { loaded: number; total: number }) => {
          if (total) setLoadProgress(Math.min(1, l / total));
        };
        const loaded = await task.promise;
        if (cancelled) return;
        // Page sizes are needed for placeholders; fetch the first, assume it for
        // the rest until each page is actually loaded.
        const first = await loaded.getPage(1);
        const vp = first.getViewport({ scale: 1 });
        setPageSizes(Array.from({ length: loaded.numPages }, () => ({ w: vp.width, h: vp.height })));
        setDoc(loaded);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error && /Missing PDF|404/.test(err.message) ? "The document could not be found." : "The document could not be loaded.");
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [url, reloadKey]);

  // ---- Track container width for fit-to-width ------------------------------
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerWidth(el.clientWidth));
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const baseWidth = pageSizes[0]?.w ?? 600;
  const padding = containerWidth < 640 ? 12 : 32;
  const fitScale = containerWidth ? Math.max(0.1, (containerWidth - padding * 2) / baseWidth) : 1;
  const scale = fitScale * zoom;

  const setPageSize = useCallback((index: number, w: number, h: number) => {
    setPageSizes((prev) => {
      const cur = prev[index];
      if (!cur || (Math.abs(cur.w - w) < 0.5 && Math.abs(cur.h - h) < 0.5)) return prev;
      const next = prev.slice();
      next[index] = { w, h };
      return next;
    });
  }, []);

  // ---- Current page from scroll position -----------------------------------
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !pageSizes.length) return;
    const mid = el.scrollTop + el.clientHeight / 3;
    let y = PAGE_GAP;
    for (let i = 0; i < pageSizes.length; i++) {
      const h = pageSizes[i]!.h * scale;
      if (mid < y + h + PAGE_GAP / 2) {
        setCurrent(i + 1);
        return;
      }
      y += h + PAGE_GAP;
    }
    setCurrent(pageSizes.length);
  }, [pageSizes, scale]);

  useEffect(() => setPageInput(String(current)), [current]);

  const goTo = useCallback(
    (page: number) => {
      const el = scrollRef.current;
      if (!el || !pageSizes.length) return;
      const p = Math.min(Math.max(1, page), pageSizes.length);
      let y = PAGE_GAP;
      for (let i = 0; i < p - 1; i++) y += pageSizes[i]!.h * scale + PAGE_GAP;
      el.scrollTo({ top: y - PAGE_GAP / 2, behavior: "auto" });
      setCurrent(p);
    },
    [pageSizes, scale],
  );

  // Keep the reading position when zoom changes.
  const anchor = useRef<{ page: number; offset: number } | null>(null);
  const changeZoom = (z: number) => {
    anchor.current = { page: current, offset: 0 };
    setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100)));
  };
  useEffect(() => {
    if (anchor.current) {
      goTo(anchor.current.page);
      anchor.current = null;
    }
  }, [scale]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    if (e.key === "ArrowRight") goTo(current + 1);
    else if (e.key === "ArrowLeft") goTo(current - 1);
    else if (e.key === "+" || e.key === "=") changeZoom(zoom + 0.25);
    else if (e.key === "-") changeZoom(zoom - 0.25);
    else if (e.key === "Home") goTo(1);
    else if (e.key === "End") goTo(pageSizes.length);
    else return;
    e.preventDefault();
  };

  const total = pageSizes.length;
  const btn =
    "grid size-9 place-items-center rounded-full text-ivory/90 transition hover:bg-ivory/10 disabled:opacity-35 disabled:hover:bg-transparent";

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#2b2327]" onKeyDown={onKeyDown}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-gold/25 bg-wine px-3 py-2 text-ivory sm:px-4">
        <div className="mr-auto min-w-0 pr-2">
          <p className="eyebrow text-gold">{title}</p>
          {fileName && <p className="truncate text-xs text-ivory/60">{fileName}</p>}
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Page navigation">
          <button type="button" className={btn} onClick={() => goTo(current - 1)} disabled={!doc || current <= 1} aria-label="Previous page">
            <ChevronLeft className="size-4" />
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const n = parseInt(pageInput, 10);
              if (Number.isFinite(n)) goTo(n);
            }}
            className="flex items-center gap-1 text-sm tabular-nums"
          >
            <label className="sr-only" htmlFor="pdf-page">Page number</label>
            <input
              id="pdf-page"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ""))}
              onBlur={() => setPageInput(String(current))}
              inputMode="numeric"
              disabled={!doc}
              className="w-10 rounded border border-ivory/25 bg-transparent px-1 py-0.5 text-center text-ivory"
            />
            <span className="text-ivory/60" data-testid="pdf-page-count">/ {total || "–"}</span>
          </form>
          <button type="button" className={btn} onClick={() => goTo(current + 1)} disabled={!doc || current >= total} aria-label="Next page">
            <ChevronRight className="size-4" />
          </button>
        </div>
        <span className="mx-1 hidden h-5 w-px bg-ivory/20 sm:block" aria-hidden />
        <div className="flex items-center gap-1" role="group" aria-label="Zoom">
          <button type="button" className={btn} onClick={() => changeZoom(zoom - 0.25)} disabled={!doc || zoom <= MIN_ZOOM} aria-label="Zoom out">
            <Minus className="size-4" />
          </button>
          <span className="w-12 text-center text-xs tabular-nums text-ivory/80" aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
          <button type="button" className={btn} onClick={() => changeZoom(zoom + 0.25)} disabled={!doc || zoom >= MAX_ZOOM} aria-label="Zoom in">
            <Plus className="size-4" />
          </button>
          <button type="button" className={btn} onClick={() => changeZoom(1)} disabled={!doc || zoom === 1} aria-label="Fit to width" title="Fit to width">
            <Maximize2 className="size-4" />
          </button>
        </div>
        {downloadUrl && (
          <a href={downloadUrl} className={btn} aria-label="Download PDF" title="Download" download>
            <Download className="size-4" />
          </a>
        )}
        {onClose && (
          <button type="button" className={`${btn} ml-1 border border-ivory/20`} onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* Pages */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        tabIndex={0}
        aria-label={`${title} pages`}
        className="scroll-thin relative min-h-0 flex-1 overflow-auto overscroll-contain outline-none"
        data-testid="pdf-scroll"
      >
        {error ? (
          <div className="grid h-full min-h-64 place-items-center p-8 text-center text-ivory/80">
            <div>
              <p className="font-display text-2xl text-ivory">{error}</p>
              <p className="mt-2 text-sm">Please check your connection and try again.</p>
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="mt-5 inline-flex items-center gap-2 border border-gold/60 px-4 py-2 text-sm text-gold hover:bg-gold/10"
              >
                <RotateCw className="size-4" /> Retry
              </button>
            </div>
          </div>
        ) : !doc ? (
          <div className="grid h-full min-h-64 place-items-center text-ivory/80" role="status">
            <div className="flex flex-col items-center gap-3">
              <Spinner className="text-gold" />
              <p className="eyebrow">Loading document{loadProgress ? ` · ${Math.round(loadProgress * 100)}%` : "…"}</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center" style={{ padding: `${PAGE_GAP}px ${padding}px`, gap: PAGE_GAP }}>
            {pageSizes.map((size, i) => (
              <PdfPage
                key={i}
                doc={doc}
                index={i}
                width={size.w * scale}
                height={size.h * scale}
                scale={scale}
                root={scrollRef}
                onSize={setPageSize}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PdfPage({
  doc,
  index,
  width,
  height,
  scale,
  root,
  onSize,
}: {
  doc: PDFDocumentProxy;
  index: number;
  width: number;
  height: number;
  scale: number;
  root: React.RefObject<HTMLDivElement | null>;
  onSize: (i: number, w: number, h: number) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(index < 2);
  const [rendered, setRendered] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => setNear(entries.some((e) => e.isIntersecting)), {
      root: root.current,
      rootMargin: "150% 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [root]);

  // Debounce scale so pinch/zoom clicks don't trigger many renders.
  const [renderScale, setRenderScale] = useState(scale);
  useEffect(() => {
    const t = setTimeout(() => setRenderScale(scale), 120);
    return () => clearTimeout(t);
  }, [scale]);

  useEffect(() => {
    if (!near) {
      // Release memory for far-away pages.
      const c = canvasRef.current;
      if (c) {
        c.width = 0;
        c.height = 0;
      }
      setRendered(null);
      return;
    }
    let task: RenderTask | null = null;
    let page: PDFPageProxy | null = null;
    let cancelled = false;
    (async () => {
      try {
        page = await doc.getPage(index + 1);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        onSize(index, base.width, base.height);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        let outputScale = renderScale * dpr;
        const px = base.width * base.height * outputScale * outputScale;
        if (px > MAX_CANVAS_PIXELS) outputScale *= Math.sqrt(MAX_CANVAS_PIXELS / px);
        const viewport = page.getViewport({ scale: outputScale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        task = page.render({ canvas, viewport });
        await task.promise;
        if (!cancelled) {
          setRendered(renderScale);
          setFailed(false);
        }
      } catch (err) {
        if (!cancelled && (err as { name?: string })?.name !== "RenderingCancelledException") setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
      page?.cleanup();
    };
  }, [near, renderScale, doc, index, onSize]);

  return (
    <div
      ref={holder}
      className="relative shrink-0 bg-white shadow-[0_2px_18px_rgba(0,0,0,0.35)]"
      style={{ width, height }}
      data-testid="pdf-page"
      aria-label={`Page ${index + 1}`}
      role="img"
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {rendered === null && !failed && (
        <div className="absolute inset-0 grid place-items-center text-stone">
          <Spinner className="size-6" />
        </div>
      )}
      {failed && <div className="absolute inset-0 grid place-items-center text-sm text-stone">Page {index + 1} could not be displayed.</div>}
    </div>
  );
}
