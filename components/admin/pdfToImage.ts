"use client";

import { runtimeConfig } from "@/lib/client/runtime";

/**
 * Renders one page of a PDF (a URL or a local File) to a PNG in the browser,
 * at up to ~3000 px on the long side — used to turn a PDF floor plan into the
 * navigator image.
 */
export async function renderPdfPageToPng(source: string | File, page = 1): Promise<{ blob: Blob; pageCount: number }> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = runtimeConfig.pdfWorkerSrc;
  const task = pdfjs.getDocument(typeof source === "string" ? { url: source } : { data: new Uint8Array(await source.arrayBuffer()) });
  try {
    const doc = await task.promise;
    if (page < 1 || page > doc.numPages) throw new Error(`The PDF has ${doc.numPages} page${doc.numPages === 1 ? "" : "s"}; choose a page between 1 and ${doc.numPages}.`);
    const p = await doc.getPage(page);
    const base = p.getViewport({ scale: 1 });
    const scale = Math.min(4, 3000 / Math.max(base.width, base.height));
    const viewport = p.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await p.render({ canvas, viewport, background: "#ffffff" }).promise;
    const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Could not render the PDF page."))), "image/png"));
    return { blob, pageCount: doc.numPages };
  } finally {
    void task.destroy();
  }
}
