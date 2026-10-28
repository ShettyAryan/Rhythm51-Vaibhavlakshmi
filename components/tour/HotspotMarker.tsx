"use client";

import { ChevronUp, DoorOpen } from "lucide-react";
import { forwardRef } from "react";

interface HotspotMarkerProps {
  label: string;
  style: "ring" | "arrow" | "door";
  selected?: boolean;
  disabled?: boolean;
  onActivate: () => void;
}

/**
 * A navigation hotspot drawn over the panorama. Its screen position is set every
 * frame by the viewer via `style.transform`; the visual is centred on that point.
 * Labels show on hover/focus, and always on touch devices (no hover available).
 */
export const HotspotMarker = forwardRef<HTMLDivElement, HotspotMarkerProps>(function HotspotMarker(
  { label, style, selected, disabled, onActivate },
  ref,
) {
  return (
    <div ref={ref} className="absolute left-0 top-0 will-change-transform" style={{ visibility: "hidden" }} data-hotspot>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onActivate();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={disabled ? `${label} (unavailable)` : `Go to ${label}`}
        aria-disabled={disabled || undefined}
        data-testid="hotspot"
        data-label={label}
        className={`group pointer-events-auto relative -translate-x-1/2 -translate-y-1/2 rounded-full outline-none ${disabled ? "opacity-50" : ""}`}
      >
        <span
          className={`relative grid size-12 place-items-center rounded-full border-[1.5px] bg-black/30 backdrop-blur-[2px] transition duration-300 ease-out group-hover:scale-110 group-focus-visible:scale-110 sm:size-11 ${
            selected ? "border-coral shadow-[0_0_0_4px_rgba(236,108,105,0.35)]" : "border-gold-soft"
          }`}
        >
          <span className="absolute inset-0 rounded-full border border-gold-soft/60 hotspot-pulse" aria-hidden />
          {style === "arrow" ? (
            <ChevronUp className="size-6 text-ivory" strokeWidth={1.5} aria-hidden />
          ) : style === "door" ? (
            <DoorOpen className="size-5 text-ivory" strokeWidth={1.5} aria-hidden />
          ) : (
            <span className="size-3 rounded-full bg-ivory shadow-[0_0_10px_rgba(255,255,255,0.7)]" aria-hidden />
          )}
        </span>
        <span
          className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap border border-gold/40 bg-wine/90 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-ivory opacity-0 shadow-lg transition duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
          aria-hidden
        >
          {label}
        </span>
      </button>
    </div>
  );
});
