"use client";

import { Expand, Map as MapIcon, Minimize2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { planBearing, viewConePath } from "@/lib/tour/geometry";
import type { AccessPointData, FloorPlanData } from "@/lib/tour/types";
import { Dialog } from "@/components/ui/Dialog";
import type { ViewBus } from "./viewBus";

interface FloorPlanNavigatorProps {
  plan: FloorPlanData | null;
  current: AccessPointData;
  /** All access points of the tour (those on this plan are drawn as dots). */
  accessPoints: AccessPointData[];
  groupName: string;
  viewBus: ViewBus;
  onSelect: (accessPointId: string) => void;
  defaultCollapsed?: boolean;
}

/**
 * Top-right mini map showing where the visitor stands and which way they look.
 * Marker positions are normalised (0–1) image coordinates; the cone's rotation is
 *   bearing = cameraYaw + accessPoint.headingOffset + plan.orientationOffset
 * (see lib/tour/geometry.ts). Nothing is drawn when the position is unknown.
 */
export function FloorPlanNavigator({ plan, current, accessPoints, groupName, viewBus, onSelect, defaultCollapsed }: FloorPlanNavigatorProps) {
  const [collapsed, setCollapsed] = useState(!!defaultCollapsed);
  const [enlarged, setEnlarged] = useState(false);

  useEffect(() => {
    setCollapsed(!!defaultCollapsed);
  }, [defaultCollapsed]);

  if (!plan) return null;

  const onPlan = accessPoints.filter((a) => a.floorPlanId === plan.id && a.marker);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="pointer-events-auto grid size-11 place-items-center rounded-full border border-gold/50 bg-wine/80 text-ivory shadow-lg backdrop-blur transition hover:bg-wine"
        aria-label="Show floor plan"
        aria-expanded={false}
        data-testid="floorplan-toggle"
      >
        <MapIcon className="size-5" strokeWidth={1.5} />
      </button>
    );
  }

  return (
    <>
      <section
        className="pointer-events-auto w-[min(70vw,260px)] overflow-hidden border border-gold/40 bg-ivory/92 shadow-[0_10px_30px_rgba(26,8,18,0.35)] backdrop-blur sm:w-[min(32vw,300px)]"
        aria-label="Floor plan navigator"
        data-testid="floorplan-navigator"
      >
        <header className="flex items-center justify-between gap-2 border-b border-gold/25 px-3 py-1.5">
          <div className="min-w-0">
            <p className="eyebrow truncate text-[0.6rem] text-plum/70">{plan.name}</p>
            <p className="truncate font-display text-[0.95rem] leading-tight text-plum" data-testid="floorplan-room">
              {groupName}
            </p>
          </div>
          <div className="flex shrink-0 items-center">
            <button type="button" onClick={() => setEnlarged(true)} className="grid size-8 place-items-center text-plum hover:bg-plum/10" aria-label="Enlarge floor plan">
              <Expand className="size-4" strokeWidth={1.5} />
            </button>
            <button type="button" onClick={() => setCollapsed(true)} className="grid size-8 place-items-center text-plum hover:bg-plum/10" aria-label="Hide floor plan" aria-expanded>
              <Minimize2 className="size-4" strokeWidth={1.5} />
            </button>
          </div>
        </header>
        <PlanCanvas plan={plan} current={current} onPlan={onPlan} viewBus={viewBus} onSelect={onSelect} compact />
        {!current.marker && (
          <p className="border-t border-gold/25 px-3 py-1.5 text-[11px] text-stone" data-testid="floorplan-unmapped">
            This viewpoint’s position is not mapped on the plan.
          </p>
        )}
      </section>

      <Dialog open={enlarged} onClose={() => setEnlarged(false)} title={`${plan.name} — ${groupName}`} className="w-[min(96vw,1100px)]">
        <div className="scroll-thin overflow-auto p-4">
          <PlanCanvas
            plan={plan}
            current={current}
            onPlan={onPlan}
            viewBus={viewBus}
            onSelect={(id) => {
              setEnlarged(false);
              onSelect(id);
            }}
          />
          <p className="mt-3 text-xs text-stone">Select a point on the plan to move there. The highlighted cone shows your current viewing direction.</p>
        </div>
      </Dialog>
    </>
  );
}

function PlanCanvas({
  plan,
  current,
  onPlan,
  viewBus,
  onSelect,
  compact,
}: {
  plan: FloorPlanData;
  current: AccessPointData;
  onPlan: AccessPointData[];
  viewBus: ViewBus;
  onSelect: (id: string) => void;
  compact?: boolean;
}) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(
    plan.image.width && plan.image.height ? { w: plan.image.width, h: plan.image.height } : null,
  );
  const cone = useRef<SVGGElement>(null);
  const conePath = useRef<SVGPathElement>(null);
  const W = natural?.w ?? 1000;
  const H = natural?.h ?? 1000;
  const unit = Math.max(W, H) / 100; // 1% of the longest side
  const radius = unit * (compact ? 13 : 9);
  const marker = current.marker;

  useEffect(() => {
    if (!marker) return;
    let lastBearing = NaN;
    let lastWidth = NaN;
    return viewBus.subscribe((view) => {
      const bearing = planBearing(view.yaw, current.headingOffset, plan.orientationOffset);
      const width = Math.round(view.hfov);
      if (Math.abs(bearing - lastBearing) < 0.2 && width === lastWidth) return;
      lastBearing = bearing;
      lastWidth = width;
      cone.current?.setAttribute("transform", `translate(${marker.x * W} ${marker.y * H}) rotate(${bearing.toFixed(2)})`);
      cone.current?.setAttribute("data-bearing", bearing.toFixed(1));
      conePath.current?.setAttribute("d", viewConePath(Math.min(width, 150), radius));
    });
  }, [viewBus, marker, current.headingOffset, plan.orientationOffset, W, H, radius]);

  const src = compact ? (plan.image.variants.md?.url ?? plan.image.url) : (plan.image.variants.lg?.url ?? plan.image.url);
  const gradientId = `cone-${compact ? "c" : "f"}`;

  return (
    <div className="relative w-full" style={{ aspectRatio: `${W} / ${H}` }}>
      <img
        src={src}
        alt={`${plan.name} floor plan`}
        className="absolute inset-0 h-full w-full object-contain"
        draggable={false}
        onLoad={(e) => {
          const img = e.currentTarget;
          if (!natural && img.naturalWidth) setNatural({ w: img.naturalWidth, h: img.naturalHeight });
        }}
      />
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" aria-hidden={compact}>
        <defs>
          <radialGradient id={gradientId} cx="0" cy="0" r={radius} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ec6c69" stopOpacity="0.75" />
            <stop offset="1" stopColor="#ec6c69" stopOpacity="0.08" />
          </radialGradient>
        </defs>
        {onPlan
          .filter((a) => a.id !== current.id)
          .map((a) => (
            <g key={a.id} transform={`translate(${a.marker!.x * W} ${a.marker!.y * H})`}>
              <circle
                r={unit * (compact ? 2.2 : 1.4)}
                className={`cursor-pointer stroke-ivory transition hover:fill-plum ${a.groupId === current.groupId ? "fill-coral" : "fill-plum/45"}`}
                strokeWidth={unit * 0.35}
                onClick={() => onSelect(a.id)}
                role="button"
                aria-label={`Go to ${a.name}`}
                tabIndex={compact ? -1 : 0}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(a.id)}
                data-testid="floorplan-point"
              >
                <title>{a.name}</title>
              </circle>
            </g>
          ))}
        {marker && (
          <>
            <g ref={cone} data-testid="floorplan-cone" transform={`translate(${marker.x * W} ${marker.y * H})`}>
              <path ref={conePath} d={viewConePath(90, radius)} fill={`url(#${gradientId})`} />
            </g>
            <g transform={`translate(${marker.x * W} ${marker.y * H})`} data-testid="floorplan-marker" data-x={marker.x} data-y={marker.y}>
              <circle r={unit * (compact ? 3.4 : 2.2)} fill="#ec6c69" fillOpacity="0.25" />
              <circle r={unit * (compact ? 2 : 1.3)} fill="#56163b" stroke="#faf7f0" strokeWidth={unit * 0.5} />
            </g>
          </>
        )}
      </svg>
    </div>
  );
}
