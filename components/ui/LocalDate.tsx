"use client";

import { useEffect, useState } from "react";

/**
 * Renders a timestamp in the viewer's locale and time zone. The server can't
 * know those, so it renders the ISO date and the browser replaces it after
 * hydration (avoids hydration mismatches).
 */
export function LocalDate({ iso, fallback = "Never" }: { iso: string | null; fallback?: string }) {
  const [text, setText] = useState(iso ? iso.slice(0, 10) : fallback);
  useEffect(() => {
    if (iso) setText(new Date(iso).toLocaleString());
  }, [iso]);
  return iso ? <time dateTime={iso}>{text}</time> : <>{fallback}</>;
}
