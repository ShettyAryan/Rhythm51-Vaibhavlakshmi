"use client";

import { useRef, useState } from "react";
import { bearingBetween, viewConePath } from "@/lib/tour/geometry";

export interface PlanMarker {
  id: string;
  x: number;
  y: number;
  label: string;
  active?: boolean;
  muted?: boolean;
  /** Bearing (deg clockwise from image-up) to draw a view cone, if known. */
  bearing?: number | null;
  coneWidth?: number;
  /** Can be dragged to a new position (requires onMarkerDrag). */
  draggable?: boolean;
  /** Shows a handle at the cone tip that rotates the direction (requires onRotate). */
  rotatable?: boolean;
}

interface PlanCanvasProps {
  src: string;
  width: number | null;
  height: number | null;
  markers: PlanMarker[];
  /** Click on empty plan area, in normalised coordinates. */
  onPlanClick?: (x: number, y: number) => void;
  onMarkerClick?: (id: string) => void;
  onMarkerDrag?: (id: string, x: number, y: number) => void;
  /** Direction handle dragged: new bearing in degrees (clockwise from image-up). */
  onRotate?: (id: string, bearing: number) => void;
  cursor?: "crosshair" | "default";
  target?: { x: number; y: number } | null;
  className?: string;
  testId?: string;
}

/**
 * Floor-plan image with SVG markers; all coordinates are normalised (0–1).
 * Markers can be dragged to move them; the active marker's cone has a round
 * handle at its tip that can be dragged around to change the viewing direction.
 */
export function PlanCanvas({ src, width, height, markers, onPlanClick, onMarkerClick, onMarkerDrag, onRotate, cursor = "default", target, className = "", testId }: PlanCanvasProps) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(width && height ? { w: width, h: height } : null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; mode: "move" | "rotate"; moved: boolean } | null>(null);
  const W = natural?.w ?? 1000;
  const H = natural?.h ?? 1000;
  const unit = Math.max(W, H) / 100;

  const toNorm = (clientX: number, clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (clientY - r.top) / r.height)),
    };
  };

  const start = (e: React.PointerEvent, id: string, mode: "move" | "rotate") => {
    e.stopPropagation();
    (e.currentTarget as SVGElement).ownerSVGElement?.setPointerCapture(e.pointerId);
    drag.current = { id, mode, moved: false };
  };

  return (
    <div className={`relative w-full select-none bg-white ${className}`} style={{ aspectRatio: `${W} / ${H}` }} data-testid={testId}>
      <img
        src={src}
        alt="Floor plan"
        className="absolute inset-0 h-full w-full object-contain"
        draggable={false}
        onLoad={(e) => !natural && setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
      />
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className={`absolute inset-0 h-full w-full touch-none ${cursor === "crosshair" ? "cursor-crosshair" : ""}`}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const p = toNorm(e.clientX, e.clientY);
          if (d.mode === "move" && onMarkerDrag) {
            d.moved = true;
            onMarkerDrag(d.id, p.x, p.y);
          } else if (d.mode === "rotate" && onRotate) {
            const m = markers.find((x) => x.id === d.id);
            const b = m ? bearingBetween(m, p, W, H) : null;
            if (b !== null) {
              d.moved = true;
              onRotate(d.id, Math.round(b));
            }
          }
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (d && !d.moved && d.mode === "move") onMarkerClick?.(d.id);
          else if (!d && onPlanClick) {
            const p = toNorm(e.clientX, e.clientY);
            onPlanClick(Math.round(p.x * 100000) / 100000, Math.round(p.y * 100000) / 100000);
          }
        }}
        data-testid={testId ? `${testId}-svg` : undefined}
      >
        {/* Inactive markers first so the active one is drawn on top. */}
        {[...markers].sort((a, b) => Number(!!a.active) - Number(!!b.active)).map((m) => {
          const r = unit * (m.active ? 12 : 7);
          const handle = m.active && m.rotatable && m.bearing != null && onRotate;
          const rad = ((m.bearing ?? 0) * Math.PI) / 180;
          const hx = Math.sin(rad) * (r + unit * 1.5);
          const hy = -Math.cos(rad) * (r + unit * 1.5);
          return (
            <g key={m.id} transform={`translate(${m.x * W} ${m.y * H})`} opacity={m.muted ? 0.45 : 1} data-testid={m.active ? "plan-active-marker" : undefined}>
              {m.bearing != null && (
                <path
                  d={viewConePath(m.coneWidth ?? 70, r)}
                  transform={`rotate(${m.bearing})`}
                  fill="#ec6c69"
                  fillOpacity={m.active ? 0.4 : 0.22}
                  className="pointer-events-none"
                  data-testid={m.active ? "editor-cone" : undefined}
                  data-bearing={m.bearing.toFixed(1)}
                />
              )}
              {handle && (
                <>
                  <line x1={0} y1={0} x2={hx} y2={hy} stroke="#ec6c69" strokeWidth={unit * 0.3} strokeDasharray={`${unit * 0.8} ${unit * 0.6}`} className="pointer-events-none" />
                  <circle
                    cx={hx}
                    cy={hy}
                    r={unit * 1.6}
                    fill="#fff"
                    stroke="#ec6c69"
                    strokeWidth={unit * 0.5}
                    className="cursor-grab active:cursor-grabbing"
                    onPointerDown={(e) => start(e, m.id, "rotate")}
                    data-testid="rotate-handle"
                  >
                    <title>Drag to change the viewing direction</title>
                  </circle>
                </>
              )}
              <circle
                r={unit * (m.active ? 1.9 : 1.4)}
                fill={m.active ? "#56163b" : "#a42d66"}
                stroke="#fff"
                strokeWidth={unit * 0.45}
                className={m.draggable && onMarkerDrag ? "cursor-move" : onMarkerClick ? "cursor-pointer" : ""}
                onPointerDown={(e) => {
                  if (m.draggable && onMarkerDrag) start(e, m.id, "move");
                  else if (onMarkerClick) {
                    e.stopPropagation();
                    onMarkerClick(m.id);
                  }
                }}
                data-testid="plan-marker"
                data-id={m.id}
              >
                <title>{m.label}</title>
              </circle>
              <text y={-unit * 2.6} textAnchor="middle" fontSize={unit * 2.1} fill="#262124" stroke="#fff" strokeWidth={unit * 0.5} paintOrder="stroke" className="pointer-events-none font-sans">
                {m.label}
              </text>
            </g>
          );
        })}
        {target && (
          <g transform={`translate(${target.x * W} ${target.y * H})`} className="pointer-events-none">
            <circle r={unit * 1.6} fill="none" stroke="#c7a56a" strokeWidth={unit * 0.5} />
            <line x1={-unit * 2.5} x2={unit * 2.5} stroke="#c7a56a" strokeWidth={unit * 0.35} />
            <line y1={-unit * 2.5} y2={unit * 2.5} stroke="#c7a56a" strokeWidth={unit * 0.35} />
          </g>
        )}
      </svg>
    </div>
  );
}
