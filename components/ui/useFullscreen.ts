"use client";

import { useCallback, useEffect, useState } from "react";

type WebkitDocument = Document & { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> };
type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };

/**
 * Full-screen for the whole page (so it stays on when moving between the landing
 * page and the tours inside the app). `supported` is false where the browser has
 * no page full-screen at all (e.g. iPhone Safari); hide the control there.
 */
export function useFullscreen() {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const doc = document as WebkitDocument;
    setSupported(!!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled));
    const update = () => setActive(!!(doc.fullscreenElement || doc.webkitFullscreenElement));
    update();
    document.addEventListener("fullscreenchange", update);
    document.addEventListener("webkitfullscreenchange", update);
    return () => {
      document.removeEventListener("fullscreenchange", update);
      document.removeEventListener("webkitfullscreenchange", update);
    };
  }, []);

  const toggle = useCallback(async () => {
    const doc = document as WebkitDocument;
    const root = document.documentElement as WebkitElement;
    try {
      if (doc.fullscreenElement || doc.webkitFullscreenElement) await (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
      else await (root.requestFullscreen?.() ?? root.webkitRequestFullscreen?.());
    } catch {
      /* The browser refused; the page already fills the window. */
    }
  }, []);

  return { supported, active, toggle };
}
