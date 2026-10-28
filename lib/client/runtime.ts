/**
 * Browser-side settings that differ between the Next.js app and the exported
 * static site (which may be hosted in a sub-folder, so paths must be relative).
 */
export const runtimeConfig = {
  /** URL of the pdf.js worker (must match the installed pdfjs-dist version). */
  pdfWorkerSrc: "/vendor/pdf.worker.min.mjs",
};
