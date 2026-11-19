"use client";

import { Expand, Home, LayoutList, Minimize, Minus, Plus, RotateCcw } from "lucide-react";
import { useFullscreen } from "@/components/ui/useFullscreen";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AccessPointData, GroupData, ProjectData, TourData, TourType } from "@/lib/tour/types";
import { BackgroundMusic } from "@/components/public/BackgroundMusic";
import { FloorPlanNavigator } from "./FloorPlanNavigator";
import { PanoramaViewer, prefetchPanorama, type PanoramaViewerHandle, type ViewerScene } from "./PanoramaViewer";
import { TourSidebar } from "./TourSidebar";
import { createViewBus } from "./viewBus";

const PANEL_KEY = "tour.sidePanel";

interface TourExperienceProps {
  tour: TourData;
  project: Pick<ProjectData, "name" | "logo" | "navLabels" | "music" | "musicVolume">;
  initialAccessPointId: string | null;
  /** Route prefix used for URLs, e.g. "/tour" or "/admin/preview/tour". */
  basePath: string;
  homeHref: string;
  otherTour: TourType | null;
  /** Suffix for tour-switch links: "?drafts=1" in preview, "/index.html" on the static site. */
  linkQuery?: string;
  previewBanner?: React.ReactNode;
}

/**
 * The shared tour engine used for both the apartment ("rooms") and amenities
 * tours, publicly and in admin preview. State: the current access point id (kept
 * in the URL as ?ap=…). Everything else derives from it.
 */
export function TourExperience({ tour, project, initialAccessPointId, basePath, homeHref, otherTour, linkQuery = "", previewBanner }: TourExperienceProps) {
  const index = useMemo(() => {
    const aps = new Map<string, { ap: AccessPointData; group: GroupData }>();
    for (const g of tour.groups) for (const ap of g.accessPoints) aps.set(ap.id, { ap, group: g });
    return aps;
  }, [tour]);
  const allAps = useMemo(() => [...index.values()].map((v) => v.ap), [index]);

  const startId =
    (initialAccessPointId && index.has(initialAccessPointId) && initialAccessPointId) ||
    (tour.defaultAccessPointId && index.has(tour.defaultAccessPointId) && tour.defaultAccessPointId) ||
    allAps[0]?.id ||
    null;

  const [currentId, setCurrentId] = useState<string | null>(startId);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { supported: canFullscreen, active: fullscreen, toggle: toggleFullscreen } = useFullscreen();
  const [announce, setAnnounce] = useState("");
  const viewer = useRef<PanoramaViewerHandle>(null);
  const viewBus = useMemo(() => createViewBus(), []);

  const current = currentId ? index.get(currentId) : undefined;
  const label = tour.type === "rooms" ? project.navLabels.rooms : project.navLabels.amenities;
  const heading = tour.type === "rooms" ? "Rooms" : "Amenities";

  // Remember whether the visitor hid the side panel (per browser; storage may be unavailable).
  useEffect(() => {
    try {
      if (window.localStorage.getItem(PANEL_KEY) === "hidden") setCollapsed(true);
    } catch {
      /* private mode etc. */
    }
  }, []);
  const changeCollapsed = useCallback((c: boolean) => {
    setCollapsed(c);
    try {
      window.localStorage.setItem(PANEL_KEY, c ? "hidden" : "shown");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const navigate = useCallback(
    (id: string) => {
      const target = index.get(id);
      if (!target) return; // never navigate to unknown/unpublished destinations
      setCurrentId(id);
      setAnnounce(`${target.group.name}, ${target.ap.name}`);
      const url = new URL(window.location.href);
      url.searchParams.set("ap", id);
      window.history.replaceState(null, "", url.toString());
    },
    [index],
  );

  // Warm the cache for likely next destinations once the current view is shown.
  const onStatusChange = useCallback(
    (status: string) => {
      if (status !== "ready" || !current) return;
      for (const hs of current.ap.hotspots.slice(0, 4)) prefetchPanorama(index.get(hs.destinationId)?.ap.panorama);
    },
    [current, index],
  );

  const scene: ViewerScene | null = useMemo(() => {
    if (!current) return null;
    const { ap } = current;
    return {
      id: ap.id,
      panorama: ap.panorama,
      initialYaw: ap.initialYaw,
      initialPitch: ap.initialPitch,
      initialFov: ap.initialFov,
      hotspots: ap.hotspots
        .filter((h) => index.has(h.destinationId))
        .map((h) => {
          const dest = index.get(h.destinationId)!;
          const fallback = dest.group.id === current.group.id ? dest.ap.name : dest.group.name;
          return { ...h, displayLabel: h.label || fallback };
        }),
    };
  }, [current, index]);

  if (!current || !scene) {
    return (
      <EmptyTour homeHref={homeHref} title={label} message="This tour has no viewpoints to show yet." />
    );
  }

  const plan = current.ap.floorPlanId ? (tour.floorPlans[current.ap.floorPlanId] ?? null) : null;
  const siblings = current.group.accessPoints;

  const ctrl =
    "grid size-11 place-items-center text-ivory transition hover:bg-ivory/12 focus-visible:bg-ivory/12 disabled:opacity-40";

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#1d1418] text-ivory" data-testid="tour" data-tour-type={tour.type}>
      <PanoramaViewer
        ref={viewer}
        scene={scene}
        onNavigate={(id) => navigate(id)}
        viewBus={viewBus}
        onStatusChange={onStatusChange}
        ariaLabel={`${current.group.name}, ${current.ap.name}. Drag or use arrow keys to look around.`}
      />

      <p className="sr-only" aria-live="polite">{announce}</p>

      {/* Shade behind the title and floor plan. Drawn below the side panel, so the panel itself stays bright. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-36 bg-gradient-to-b from-black/55 to-transparent" aria-hidden />

      {/* Top bar */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 px-3 pb-10 pt-3 sm:px-5">
        {/* Kept within the side panel's width so long names never spill over the panorama. */}
        <div
          className={`pointer-events-auto flex min-w-0 items-center gap-3 ${collapsed ? "md:max-w-[min(32rem,45vw)]" : "md:max-w-[calc(19rem-1.5rem)] lg:max-w-[calc(21rem-2.5rem)]"}`}
          data-testid="tour-title"
        >
          <div className="min-w-0 flex-1 drop-shadow">
            <p className="eyebrow truncate text-gold-soft" title={project.name || label}>{project.name || label}</p>
            <h1 className="min-w-0 font-display leading-tight" data-testid="tour-location" title={`${current.group.name} · ${current.ap.name}`}>
              <span className="block truncate text-xl sm:text-2xl">{current.group.name}</span>
              <span className="sr-only"> · </span>
              <span className="block truncate font-sans text-xs uppercase tracking-[0.16em] text-ivory/80" data-testid="tour-viewpoint-name">
                {current.ap.name}
              </span>
            </h1>
          </div>
        </div>
        <div className="pointer-events-auto flex shrink-0 flex-col items-end gap-2">
          <FloorPlanNavigator
            plan={plan}
            current={current.ap}
            accessPoints={allAps}
            groupName={current.group.name}
            viewBus={viewBus}
            onSelect={navigate}
            defaultCollapsed={isMobile}
          />
        </div>
      </header>

      {previewBanner}

      <TourSidebar
        tour={tour}
        currentGroupId={current.group.id}
        currentAccessPointId={current.ap.id}
        onSelect={navigate}
        collapsed={collapsed}
        onCollapsedChange={changeCollapsed}
        mobileOpen={mobileOpen}
        onMobileOpenChange={setMobileOpen}
        heading={heading}
      />

      {/* Bottom: viewpoint strip + controls */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col items-center gap-3 bg-gradient-to-t from-black/50 to-transparent px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-10 md:items-end md:pr-5"
      >
        {siblings.length > 1 && (
          <nav aria-label="Viewpoints in this room" className="pointer-events-auto max-w-full md:absolute md:bottom-[max(0.75rem,env(safe-area-inset-bottom))] md:left-1/2 md:-translate-x-1/2">
            <ul className="scroll-thin flex max-w-[92vw] gap-2 overflow-x-auto p-1" role="list">
              {siblings.map((ap) => {
                const cur = ap.id === current.ap.id;
                const thumb = ap.thumbnail?.variants.thumb?.url ?? ap.panorama?.variants.thumb?.url;
                return (
                  <li key={ap.id}>
                    <button
                      type="button"
                      onClick={() => navigate(ap.id)}
                      aria-current={cur ? "true" : undefined}
                      data-testid="viewpoint-chip"
                      className={`group relative block h-14 w-24 overflow-hidden border text-left transition sm:h-16 sm:w-28 ${cur ? "border-gold" : "border-ivory/25 opacity-80 hover:opacity-100"}`}
                    >
                      {thumb && (
                        <img src={thumb} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                      )}
                      <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em]">{ap.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}

        <div className="pointer-events-auto flex w-full items-center justify-between gap-2 md:w-auto">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex h-12 items-center gap-2 border border-gold/50 bg-menu/90 px-4 text-xs uppercase tracking-[0.2em] backdrop-blur md:hidden"
            aria-haspopup="dialog"
            aria-expanded={mobileOpen}
            data-testid="mobile-rooms-button"
          >
            <LayoutList className="size-5" /> {heading}
          </button>
          <div className="flex items-center gap-2">
          <div className="flex items-center border border-ivory/20 bg-black/35 backdrop-blur" role="toolbar" aria-label="Viewer controls">
            <button type="button" className={`${ctrl} max-sm:hidden`} onClick={() => viewer.current?.setView({ fov: viewer.current.getView().fov - 10 })} aria-label="Zoom in">
              <Plus className="size-5" />
            </button>
            <button type="button" className={`${ctrl} max-sm:hidden`} onClick={() => viewer.current?.setView({ fov: viewer.current.getView().fov + 10 })} aria-label="Zoom out">
              <Minus className="size-5" />
            </button>
            <button type="button" className={ctrl} onClick={() => viewer.current?.resetView()} aria-label="Reset view" data-testid="reset-view">
              <RotateCcw className="size-5" />
            </button>
            <BackgroundMusic music={project.music} volume={project.musicVolume} className={ctrl} iconClassName="size-5" />
            {canFullscreen && (
              <button type="button" className={ctrl} onClick={toggleFullscreen} aria-label={fullscreen ? "Exit full screen" : "Full screen"}>
                {fullscreen ? <Minimize className="size-5" /> : <Expand className="size-5" />}
              </button>
            )}
          </div>
          {otherTour && (
            <Link
              href={`${basePath}/${otherTour}${linkQuery}`}
              className="hidden h-12 items-center border border-gold/50 bg-menu/80 px-4 text-xs uppercase tracking-[0.2em] text-ivory backdrop-blur transition hover:bg-menu md:flex"
              data-testid="switch-tour"
            >
              {otherTour === "rooms" ? project.navLabels.rooms : project.navLabels.amenities}
            </Link>
          )}
          <Link
            href={homeHref}
            className="flex h-12 items-center gap-2 border border-gold/50 bg-menu/90 px-3.5 text-xs uppercase tracking-[0.2em] text-ivory backdrop-blur transition hover:bg-menu sm:px-4"
            aria-label="Back to home"
            title="Back to home"
            data-testid="tour-home"
          >
            <Home className="size-5" />
            <span className="hidden sm:inline">Home</span>
          </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export function EmptyTour({ homeHref, title, message }: { homeHref: string; title: string; message: string }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-wine px-6 text-center text-ivory" data-testid="tour-empty">
      <div className="max-w-md">
        <p className="eyebrow text-gold">{title}</p>
        <h1 className="mt-3 font-display text-4xl">Coming soon</h1>
        <p className="mt-3 text-ivory/75">{message}</p>
        <Link href={homeHref} className="mt-8 inline-block border border-gold/60 px-6 py-3 text-xs uppercase tracking-[0.22em] text-gold hover:bg-gold/10">
          Back to home
        </Link>
      </div>
    </main>
  );
}
