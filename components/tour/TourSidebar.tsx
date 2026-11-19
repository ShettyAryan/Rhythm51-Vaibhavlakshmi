"use client";

import { ChevronDown, ChevronLeft, LayoutList, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { GroupData, TourData } from "@/lib/tour/types";

interface TourSidebarProps {
  tour: TourData;
  currentGroupId: string | null;
  currentAccessPointId: string | null;
  onSelect: (accessPointId: string) => void;
  /** Desktop: panel fully hidden so the panorama fills the screen. */
  collapsed: boolean;
  onCollapsedChange: (c: boolean) => void;
  /** Mobile: bottom sheet visibility. */
  mobileOpen: boolean;
  onMobileOpenChange: (o: boolean) => void;
  heading: string;
}

/** Width of the desktop panel — the tour header uses the same values to align with it. */
export const SIDEBAR_WIDTH_CLASS = "w-[19rem] lg:w-[21rem]";

export function groupThumb(g: GroupData): string | null {
  return g.thumbnail?.variants.thumb?.url ?? g.thumbnail?.url ?? g.accessPoints[0]?.thumbnail?.variants.thumb?.url ?? g.accessPoints[0]?.panorama?.variants.thumb?.url ?? null;
}

export function TourSidebar(props: TourSidebarProps) {
  const { collapsed, onCollapsedChange, mobileOpen, onMobileOpenChange, heading } = props;

  return (
    <>
      {/* Desktop / tablet: panel that slides fully out of view when collapsed */}
      <aside
        className={`pointer-events-auto absolute bottom-0 left-0 top-0 z-20 hidden flex-col border-r border-gold-soft/40 bg-menu/95 text-ivory shadow-[8px_0_30px_rgba(0,0,0,0.25)] backdrop-blur-md transition-transform duration-300 ease-[var(--ease-lux)] md:flex ${SIDEBAR_WIDTH_CLASS} ${
          collapsed ? "-translate-x-full" : "translate-x-0"
        }`}
        aria-label={`${heading} navigation`}
        aria-hidden={collapsed}
        inert={collapsed}
        data-testid="tour-sidebar"
        data-collapsed={collapsed}
      >
        <div className="flex items-center justify-between gap-2 border-b border-gold/25 px-5 pb-3 pt-[5.25rem]">
          <h2 className="eyebrow text-xs text-ivory">{heading}</h2>
          <button
            type="button"
            onClick={() => onCollapsedChange(true)}
            className="flex items-center gap-1 rounded-full px-2 py-1 text-xs uppercase tracking-[0.16em] text-ivory hover:bg-ivory/15"
            aria-label="Hide navigation panel"
            title="Hide panel to see the full view"
            data-testid="sidebar-toggle"
          >
            <ChevronLeft className="size-4" /> Hide
          </button>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-2">
          <GroupList {...props} />
        </div>
      </aside>

      {/* Desktop: tab to bring the panel back */}
      <button
        type="button"
        onClick={() => onCollapsedChange(false)}
        className={`pointer-events-auto absolute left-0 top-1/2 z-20 hidden -translate-y-1/2 flex-col items-center gap-2 border border-l-0 border-gold/40 bg-menu/85 px-2 py-4 text-ivory shadow-lg backdrop-blur transition-[opacity,visibility] duration-300 hover:bg-menu md:flex ${
          collapsed ? "visible opacity-100" : "invisible opacity-0"
        }`}
        aria-label="Show navigation panel"
        data-testid="sidebar-open"
      >
        <LayoutList className="size-4" />
        <span className="text-[11px] uppercase tracking-[0.2em] [writing-mode:vertical-rl]">{heading}</span>
      </button>

      {/* Mobile: bottom sheet */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity md:hidden ${mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={() => onMobileOpenChange(false)}
        aria-hidden
      />
      <aside
        className={`fixed inset-x-0 bottom-0 z-50 flex max-h-[72dvh] flex-col border-t border-gold/40 bg-menu text-ivory shadow-[0_-12px_40px_rgba(0,0,0,0.4)] transition-transform duration-300 ease-[var(--ease-lux)] md:hidden ${
          mobileOpen ? "translate-y-0" : "translate-y-full"
        }`}
        aria-label={`${heading} navigation`}
        aria-hidden={!mobileOpen}
        inert={!mobileOpen}
        data-testid="tour-sheet"
      >
        <div className="flex items-center justify-between border-b border-gold/25 px-5 py-3">
          <h2 className="eyebrow text-xs text-ivory">{heading}</h2>
          <button type="button" onClick={() => onMobileOpenChange(false)} className="grid size-9 place-items-center rounded-full hover:bg-ivory/10" aria-label="Close list">
            <X className="size-5" />
          </button>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-[max(1rem,env(safe-area-inset-bottom))] pt-1">
          <GroupList {...props} onSelect={(id) => (props.onSelect(id), onMobileOpenChange(false))} />
        </div>
      </aside>
    </>
  );
}

function GroupList({ tour, currentGroupId, currentAccessPointId, onSelect }: TourSidebarProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(currentGroupId ? [currentGroupId] : []));

  // Auto-expand the active group when navigation happens elsewhere (hotspot, plan).
  useEffect(() => {
    if (currentGroupId) setExpanded((prev) => (prev.has(currentGroupId) ? prev : new Set(prev).add(currentGroupId)));
  }, [currentGroupId]);

  return (
    <ul className="space-y-0.5 px-2" role="list">
      {tour.groups.map((g) => {
        const active = g.id === currentGroupId;
        const open = expanded.has(g.id);
        const thumb = groupThumb(g);
        const multi = g.accessPoints.length > 1;
        return (
          <li key={g.id} data-testid="tour-group" data-active={active}>
            <button
              type="button"
              onClick={() => {
                if (multi)
                  setExpanded((prev) => {
                    const n = new Set(prev);
                    if (n.has(g.id) && active) n.delete(g.id);
                    else n.add(g.id);
                    return n;
                  });
                if (!active && g.defaultAccessPointId) onSelect(g.defaultAccessPointId);
              }}
              aria-current={active ? "location" : undefined}
              aria-expanded={multi ? open : undefined}
              title={g.name}
              className={`group flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left transition ${
                active ? "bg-ivory/20 text-ivory" : "text-ivory hover:bg-ivory/10"
              }`}
            >
              <span className={`relative h-12 w-16 shrink-0 overflow-hidden border ${active ? "border-gold-soft" : "border-ivory/30"}`}>
                {thumb ? (
                  <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <span className="block h-full w-full bg-ivory/10" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`line-clamp-2 block font-display text-xl leading-snug ${active ? "font-medium" : ""}`}>{g.name}</span>
                <span className="mt-0.5 block truncate text-xs uppercase tracking-[0.14em] text-ivory/85">
                  {g.accessPoints.length} {g.accessPoints.length === 1 ? "view" : "views"}
                  {g.status === "draft" && <span className="ml-2 text-gold-soft">Draft</span>}
                </span>
              </span>
              {multi && <ChevronDown className={`size-5 shrink-0 text-ivory/85 transition ${open ? "rotate-180" : ""}`} aria-hidden />}
            </button>
            {multi && open && (
              <ul className="mb-1.5 ml-[5.25rem] mr-2 min-w-0 border-l border-ivory/30" role="list">
                {g.accessPoints.map((ap) => {
                  const cur = ap.id === currentAccessPointId;
                  return (
                    <li key={ap.id} className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onSelect(ap.id)}
                        aria-current={cur ? "true" : undefined}
                        title={ap.name}
                        data-testid="tour-viewpoint"
                        data-active={cur}
                        className={`-ml-px flex w-full min-w-0 items-center gap-2 border-l py-2 pl-3 pr-2 text-left text-[15px] leading-snug transition ${
                          cur ? "border-ivory font-medium text-ivory" : "border-transparent text-ivory/90 hover:text-ivory"
                        }`}
                      >
                        <span className={`size-2 shrink-0 rounded-full ${cur ? "bg-gold-soft" : "bg-ivory/50"}`} aria-hidden />
                        <span className="min-w-0 flex-1 break-words">{ap.name}</span>
                        {ap.status === "draft" && <span className="shrink-0 text-[10px] uppercase text-gold-soft">Draft</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
