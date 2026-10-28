"use client";

import { ArrowLeftRight, Compass, Crosshair, Eye, LocateFixed, MousePointerClick, Plus, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AdminAsset, AdminFloorPlan, AdminGroup, EditorAccessPoint } from "@/lib/content/queries";
import { calibrateHeadingOffset, estimateReturnYaw, normalizeYaw, planBearing } from "@/lib/tour/geometry";
import { PanoramaViewer, type PanoramaViewerHandle, type ViewerScene } from "@/components/tour/PanoramaViewer";
import { createViewBus } from "@/components/tour/viewBus";
import { api } from "./client";
import { AssetPicker } from "./MediaLibrary";
import { PlanCanvas, type PlanMarker } from "./PlanCanvas";
import { Button, Field, Input, NumberInput, Panel, Select, StatusSelect, useConfirm, useToast } from "./ui";

type Hotspot = EditorAccessPoint["hotspots"][number] & { key: string };
type Mode = "view" | "add" | "move" | "calibrate" | "marker";

let keySeq = 0;
const withKeys = (hs: EditorAccessPoint["hotspots"]): Hotspot[] => hs.map((h) => ({ ...h, key: h.id ?? `new-${++keySeq}` }));

export function AccessPointEditor({ initial, groups, floorPlans }: { initial: EditorAccessPoint; groups: AdminGroup[]; floorPlans: AdminFloorPlan[] }) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, element: confirmEl } = useConfirm();
  const viewer = useRef<PanoramaViewerHandle>(null);
  const viewBus = useMemo(() => createViewBus(), []);

  const [saved, setSaved] = useState(initial);
  const [name, setName] = useState(initial.name);
  const [groupId, setGroupId] = useState(initial.groupId);
  const [status, setStatus] = useState(initial.status);
  const [panorama, setPanorama] = useState<AdminAsset | null>(initial.panorama);
  const [thumbnail, setThumbnail] = useState<AdminAsset | null>(initial.thumbnail);
  const [initialView, setInitialView] = useState({ yaw: initial.initialYaw, pitch: initial.initialPitch, fov: initial.initialFov });
  const [floorPlanId, setFloorPlanId] = useState<string | null>(initial.floorPlanId);
  const [marker, setMarker] = useState(initial.marker);
  const [headingOffset, setHeadingOffset] = useState(initial.headingOffset);
  const [hotspots, setHotspots] = useState<Hotspot[]>(withKeys(initial.hotspots));
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("view");
  const [pendingDest, setPendingDest] = useState("");
  const [live, setLive] = useState({ yaw: 0, pitch: 0, fov: 75, hfov: 90 });
  const [saving, setSaving] = useState(false);

  // Throttled live camera readout for the editor UI.
  useEffect(() => {
    let raf = 0;
    return viewBus.subscribe((v) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setLive(v));
    });
  }, [viewBus]);

  const allAps = useMemo(() => groups.flatMap((g) => g.accessPoints), [groups]);
  const destinations = allAps.filter((a) => a.id !== initial.id);
  const apName = (id: string) => {
    const a = allAps.find((x) => x.id === id);
    return a ? (a.groupId === groupId ? a.name : a.groupName) : "Unknown";
  };
  const plan = floorPlans.find((p) => p.id === floorPlanId) ?? null;
  const group = groups.find((g) => g.id === groupId);

  const dirty =
    name !== saved.name ||
    groupId !== saved.groupId ||
    status !== saved.status ||
    (panorama?.id ?? null) !== (saved.panorama?.id ?? null) ||
    (thumbnail?.id ?? null) !== (saved.thumbnail?.id ?? null) ||
    initialView.yaw !== saved.initialYaw ||
    initialView.pitch !== saved.initialPitch ||
    initialView.fov !== saved.initialFov ||
    floorPlanId !== saved.floorPlanId ||
    JSON.stringify(marker) !== JSON.stringify(saved.marker) ||
    headingOffset !== saved.headingOffset ||
    JSON.stringify(hotspots.map(({ key, ...h }) => (void key, h))) !== JSON.stringify(saved.hotspots);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const scene: ViewerScene = useMemo(
    () => ({
      id: `${initial.id}:${panorama?.id ?? "none"}:${panorama?.version ?? 0}`,
      panorama: panorama?.media ?? null,
      initialYaw: initialView.yaw,
      initialPitch: initialView.pitch,
      initialFov: initialView.fov,
      hotspots: hotspots.map((h) => ({
        id: h.key,
        destinationId: h.destinationAccessPointId,
        label: h.label,
        displayLabel: h.label || apName(h.destinationAccessPointId),
        yaw: h.yaw,
        pitch: h.pitch,
        style: h.style,
      })),
    }),
    [initial.id, panorama, hotspots, initialView, groupId],
  );

  const updateHotspot = (key: string, patch: Partial<Hotspot>) => setHotspots((hs) => hs.map((h) => (h.key === key ? { ...h, ...patch } : h)));

  const addHotspotAt = (yaw: number, pitch: number, dest = pendingDest) => {
    if (!dest) {
      toast.error("Choose a destination first.");
      return;
    }
    const key = `new-${++keySeq}`;
    setHotspots((hs) => [...hs, { key, destinationAccessPointId: dest, label: "", yaw: round(yaw), pitch: round(pitch), style: "ring" } as Hotspot]);
    setSelected(key);
    setMode("view");
  };

  const onPick = (yaw: number, pitch: number) => {
    if (mode === "add") addHotspotAt(yaw, pitch);
    else if (mode === "move" && selected) {
      updateHotspot(selected, { yaw: round(yaw), pitch: round(pitch) });
      setMode("view");
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const { accessPoint } = await api<{ accessPoint: EditorAccessPoint }>("PATCH", `/api/admin/access-points/${initial.id}`, {
        name,
        groupId,
        status,
        panoramaAssetId: panorama?.id ?? null,
        thumbnailAssetId: thumbnail?.id ?? null,
        initialYaw: initialView.yaw,
        initialPitch: initialView.pitch,
        initialFov: initialView.fov,
        floorPlanId,
        marker,
        headingOffset,
        hotspots: hotspots.map((h) => ({
          id: h.id,
          destinationAccessPointId: h.destinationAccessPointId,
          label: h.label,
          yaw: h.yaw,
          pitch: h.pitch,
          style: h.style,
        })),
      });
      setSaved(accessPoint);
      setHotspots(withKeys(accessPoint.hotspots));
      setSelected(null);
      toast.success("Viewpoint saved");
      router.refresh();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const createReturn = async (h: Hotspot) => {
    const dest = allAps.find((a) => a.id === h.destinationAccessPointId);
    let yaw: number | null = null;
    const destPlan = floorPlans.find((p) => p.id === dest?.floorPlanId);
    if (dest?.marker && marker && destPlan && dest.floorPlanId === floorPlanId && destPlan.image?.width && destPlan.image.height) {
      yaw = estimateReturnYaw({
        from: marker,
        to: dest.marker,
        toHeadingOffset: dest.headingOffset,
        orientationOffset: destPlan.orientationOffset,
        imageWidth: destPlan.image.width,
        imageHeight: destPlan.image.height,
      });
    }
    try {
      const res = await api<{ created: boolean }>("POST", `/api/admin/access-points/${initial.id}/reciprocal`, {
        destinationAccessPointId: h.destinationAccessPointId,
        yaw: yaw ?? 0,
        pitch: h.pitch,
        label: "",
      });
      toast.success(
        res.created
          ? yaw !== null
            ? `Return hotspot added in “${dest?.name}” (position estimated from the floor plan — check it there).`
            : `Return hotspot added in “${dest?.name}” facing yaw 0°. Open that viewpoint to position it.`
          : "A hotspot back to this viewpoint already exists there.",
      );
    } catch (err) {
      toast.error(err);
    }
  };

  const liveBearing = plan && marker ? planBearing(live.yaw, headingOffset, plan.orientationOffset) : null;
  const planMarkers: PlanMarker[] = plan
    ? [
        ...allAps
          .filter((a) => a.id !== initial.id && a.floorPlanId === plan.id && a.marker)
          .map((a) => ({ id: a.id, x: a.marker!.x, y: a.marker!.y, label: a.name, muted: true })),
        ...(marker
          ? [{ id: initial.id, x: marker.x, y: marker.y, label: name, active: true, bearing: liveBearing, coneWidth: Math.min(150, live.hfov), draggable: true, rotatable: true }]
          : []),
      ]
    : [];

  const modeHint: Record<Mode, string | null> = {
    view: null,
    add: "Click in the panorama where the new hotspot should go (or use “Add at centre”).",
    move: "Click in the panorama to move the selected hotspot there.",
    calibrate: "Look at a recognisable feature in the panorama (centre crosshair), then click the same feature on the plan.",
    marker: "Click on the plan where this panorama was captured.",
  };

  return (
    <div className="space-y-6" data-testid="ap-editor">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs text-stone">
            <Link className="hover:text-plum" href={`/admin/tours/${initial.tourType}`}>{initial.tourType === "rooms" ? "Rooms" : "Amenities"}</Link>
            {" / "}
            {group?.name}
          </p>
          <h1 className="font-display text-3xl text-plum sm:text-4xl">{name || "Untitled viewpoint"}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusSelect value={status} onChange={setStatus} testId="ap-status" />
          <Link href={`/admin/preview/tour/${initial.tourType}?drafts=1&ap=${initial.id}`} target="_blank">
            <Button>
              <Eye className="size-4" /> Preview
            </Button>
          </Link>
          <Button variant="primary" onClick={save} loading={saving} disabled={!dirty} data-testid="ap-save">
            <Save className="size-4" /> {dirty ? "Save changes" : "Saved"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        {/* Viewer + hotspots */}
        <div className="space-y-4">
          <div className="relative aspect-[16/10] w-full overflow-hidden border border-charcoal/15 bg-black">
            <PanoramaViewer
              ref={viewer}
              scene={scene}
              viewBus={viewBus}
              onPick={onPick}
              showCrosshair
              selectedHotspotId={selected}
              onHotspotSelect={(id) => setSelected(id)}
              ariaLabel="Panorama editor. Drag to look around; the crosshair marks the view centre."
            >
              <div className="pointer-events-none absolute left-2 top-2 bg-black/60 px-2 py-1 font-mono text-[11px] text-white" data-testid="editor-readout">
                yaw {live.yaw.toFixed(1)}° · pitch {live.pitch.toFixed(1)}° · fov {live.fov.toFixed(0)}°
              </div>
              {modeHint[mode] && (
                <div className="pointer-events-none absolute inset-x-0 bottom-2 mx-auto w-fit max-w-[90%] bg-plum/90 px-3 py-1.5 text-center text-xs text-ivory">{modeHint[mode]}</div>
              )}
            </PanoramaViewer>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => {
                const v = viewer.current?.getView();
                if (v) setInitialView({ yaw: round(v.yaw), pitch: round(v.pitch), fov: Math.round(v.fov) });
                toast.success("Initial view set to the current view");
              }}
              disabled={!panorama}
              data-testid="set-initial-view"
            >
              <LocateFixed className="size-4" /> Set initial view here
            </Button>
            <Button size="sm" variant="ghost" onClick={() => viewer.current?.resetView()} disabled={!panorama}>
              Go to initial view
            </Button>
          </div>

          <Panel
            title={`Navigation hotspots (${hotspots.length})`}
            description="Hotspots are stored in panorama coordinates (yaw/pitch), so they stay attached to the scene."
          >
            <div className="mb-4 flex flex-wrap items-end gap-2 border-b border-charcoal/10 pb-4">
              <Field label="Destination" className="min-w-56 flex-1">
                <Select value={pendingDest} onChange={(e) => setPendingDest(e.target.value)} data-testid="hotspot-destination">
                  <option value="">Choose a viewpoint…</option>
                  {groups.map((g) => (
                    <optgroup key={g.id} label={g.name}>
                      {g.accessPoints
                        .filter((a) => a.id !== initial.id)
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                            {a.status === "draft" ? " (draft)" : ""}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </Select>
              </Field>
              <Button
                variant="primary"
                onClick={() => {
                  const v = viewer.current?.getView();
                  if (v) addHotspotAt(v.yaw, v.pitch);
                }}
                disabled={!panorama || !pendingDest}
                data-testid="add-hotspot-here"
              >
                <Crosshair className="size-4" /> Add hotspot here
              </Button>
              <Button onClick={() => setMode(mode === "add" ? "view" : "add")} disabled={!panorama || !pendingDest} aria-pressed={mode === "add"}>
                <MousePointerClick className="size-4" /> {mode === "add" ? "Cancel" : "Click to place"}
              </Button>
            </div>

            {hotspots.length === 0 ? (
              <p className="text-sm text-stone">No hotspots yet. Rotate the view to a doorway or another camera position, pick a destination and add a hotspot.</p>
            ) : (
              <ul className="space-y-2" role="list">
                {hotspots.map((h) => (
                  <li
                    key={h.key}
                    className={`grid grid-cols-2 gap-2 border p-3 sm:grid-cols-6 sm:items-end ${selected === h.key ? "border-plum bg-plum/[0.03]" : "border-charcoal/10"}`}
                    onClick={() => setSelected(h.key)}
                    data-testid="hotspot-row"
                  >
                    <Field label="Goes to" className="col-span-2 sm:col-span-3">
                      <Select value={h.destinationAccessPointId} onChange={(e) => updateHotspot(h.key, { destinationAccessPointId: e.target.value })}>
                        {destinations.map((a) => (
                          <option key={a.id} value={a.id}>{a.groupName} — {a.name}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Label" className="col-span-2 sm:col-span-2">
                      <Input value={h.label} placeholder={apName(h.destinationAccessPointId)} onChange={(e) => updateHotspot(h.key, { label: e.target.value })} maxLength={80} />
                    </Field>
                    <Field label="Style">
                      <Select value={h.style} onChange={(e) => updateHotspot(h.key, { style: e.target.value as Hotspot["style"] })}>
                        <option value="ring">Ring</option>
                        <option value="arrow">Arrow</option>
                        <option value="door">Door</option>
                      </Select>
                    </Field>
                    <Field label="Yaw °">
                      <NumberInput value={h.yaw} step={0.5} onChange={(v) => updateHotspot(h.key, { yaw: normalizeYaw(v) })} />
                    </Field>
                    <Field label="Pitch °">
                      <NumberInput value={h.pitch} step={0.5} min={-90} max={90} onChange={(v) => updateHotspot(h.key, { pitch: Math.max(-90, Math.min(90, v)) })} />
                    </Field>
                    <div className="col-span-2 flex flex-wrap justify-end gap-1 sm:col-span-4">
                      <Button size="sm" variant="ghost" title="Look at this hotspot" aria-label="Look at hotspot" onClick={() => viewer.current?.setView({ yaw: h.yaw, pitch: h.pitch })}>
                        <Eye className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Move to the view centre"
                        aria-label="Move hotspot to view centre"
                        onClick={() => {
                          const v = viewer.current?.getView();
                          if (v) updateHotspot(h.key, { yaw: round(v.yaw), pitch: round(v.pitch) });
                        }}
                      >
                        <Crosshair className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Click in the panorama to reposition"
                        aria-label="Reposition by clicking"
                        aria-pressed={mode === "move" && selected === h.key}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(h.key);
                          setMode(mode === "move" && selected === h.key ? "view" : "move");
                        }}
                      >
                        <MousePointerClick className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        title={h.id ? "Create the return hotspot in the destination" : "Save first to create a return hotspot"}
                        aria-label="Create return hotspot"
                        disabled={!h.id || dirty}
                        onClick={() => createReturn(h)}
                      >
                        <ArrowLeftRight className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Delete hotspot"
                        onClick={(e) => {
                          e.stopPropagation();
                          setHotspots((hs) => hs.filter((x) => x.key !== h.key));
                        }}
                      >
                        <Trash2 className="size-4 text-red-800" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {/* Details */}
        <div className="space-y-6">
          <Panel title="Details">
            <div className="space-y-4">
              <Field label="Viewpoint name">
                <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="ap-name" />
              </Field>
              <Field label={initial.tourType === "rooms" ? "Room" : "Amenity"}>
                <Select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </Select>
              </Field>
              <AssetPicker
                label="360° panorama"
                value={panorama}
                onChange={setPanorama}
                categories={["panorama"]}
                hint="Full 360° equirectangular image (2:1 or 16:9 frame). Hotspots and the initial view are relative to this image."
                testId="panorama-picker"
              />
              <AssetPicker label="Thumbnail (optional)" value={thumbnail} onChange={setThumbnail} categories={["image"]} hint="Defaults to a crop of the panorama." />
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-charcoal/70">Initial view</p>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Yaw °">
                    <NumberInput value={initialView.yaw} step={1} onChange={(v) => setInitialView({ ...initialView, yaw: normalizeYaw(v) })} data-testid="initial-yaw" />
                  </Field>
                  <Field label="Pitch °">
                    <NumberInput value={initialView.pitch} step={1} min={-85} max={85} onChange={(v) => setInitialView({ ...initialView, pitch: v })} />
                  </Field>
                  <Field label="FOV °">
                    <NumberInput value={initialView.fov} step={1} min={30} max={110} onChange={(v) => setInitialView({ ...initialView, fov: v })} />
                  </Field>
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="Floor plan position" description="Places this viewpoint on the navigator and calibrates its viewing direction.">
            <div className="space-y-4">
              <Field label="Plan">
                <Select
                  value={floorPlanId ?? ""}
                  onChange={(e) => {
                    setFloorPlanId(e.target.value || null);
                    setMarker(null);
                  }}
                  data-testid="ap-plan"
                >
                  <option value="">No floor plan (navigator hidden)</option>
                  {floorPlans.map((p) => (
                    <option key={p.id} value={p.id} disabled={!p.image}>
                      {p.name}
                      {!p.image ? " (no image)" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              {plan?.image ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant={mode === "marker" ? "primary" : "secondary"} onClick={() => setMode(mode === "marker" ? "view" : "marker")} aria-pressed={mode === "marker"} data-testid="place-marker">
                      <LocateFixed className="size-4" /> {marker ? "Move position" : "Place position"}
                    </Button>
                    <Button size="sm" variant={mode === "calibrate" ? "primary" : "secondary"} onClick={() => setMode(mode === "calibrate" ? "view" : "calibrate")} disabled={!marker || !panorama} aria-pressed={mode === "calibrate"} data-testid="calibrate">
                      <Compass className="size-4" /> Calibrate direction
                    </Button>
                    {marker && (
                      <Button size="sm" variant="ghost" onClick={() => setMarker(null)}>
                        Clear position
                      </Button>
                    )}
                  </div>
                  <PlanCanvas
                    src={plan.image.media.variants.lg?.url ?? plan.image.url}
                    width={plan.image.width}
                    height={plan.image.height}
                    markers={planMarkers}
                    cursor={mode === "marker" || mode === "calibrate" ? "crosshair" : "default"}
                    testId="ap-plan-canvas"
                    onMarkerDrag={(id, x, y) => {
                      if (id === initial.id) setMarker({ x: Math.round(x * 100000) / 100000, y: Math.round(y * 100000) / 100000 });
                    }}
                    onRotate={(id, bearing) => {
                      // Align: make the cone for the CURRENT panorama view point at the handle.
                      if (id === initial.id) setHeadingOffset(round(normalizeYaw(bearing - live.yaw - plan.orientationOffset)));
                    }}
                    onPlanClick={(x, y) => {
                      if (mode === "marker") {
                        setMarker({ x, y });
                        setMode("view");
                      } else if (mode === "calibrate" && marker && plan.image?.width && plan.image.height) {
                        const off = calibrateHeadingOffset({
                          yaw: live.yaw,
                          marker,
                          target: { x, y },
                          imageWidth: plan.image.width,
                          imageHeight: plan.image.height,
                          orientationOffset: plan.orientationOffset,
                        });
                        if (off === null) toast.error("Click a point away from the marker.");
                        else {
                          setHeadingOffset(round(off));
                          setMode("view");
                          toast.success(`Direction calibrated (heading offset ${off.toFixed(1)}°).`);
                        }
                      }
                    }}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Heading offset °" hint="Plan bearing of panorama yaw 0.">
                      <NumberInput value={headingOffset} step={1} onChange={(v) => setHeadingOffset(normalizeYaw(v))} data-testid="heading-offset" />
                    </Field>
                    <div className="text-xs text-stone">
                      <p className="mb-1 font-medium uppercase tracking-[0.12em] text-charcoal/70">Live bearing</p>
                      <p className="font-mono text-sm text-charcoal">{liveBearing === null ? "—" : `${liveBearing.toFixed(1)}°`}</p>
                      <p className="mt-1">Drag the dot to move this viewpoint. If the cone doesn’t match what you see, drag its white handle to point where the panorama is looking.</p>
                    </div>
                  </div>
                </>
              ) : (
                floorPlanId && <p className="text-sm text-stone">This plan has no image yet. Add one under Floor Plans.</p>
              )}
            </div>
          </Panel>

          <Panel title="Danger zone">
            <Button
              variant="danger"
              onClick={async () => {
                if (!(await confirm("Delete viewpoint", <>Delete <strong>{name}</strong> and all hotspots leading to or from it?</>))) return;
                try {
                  await api("DELETE", `/api/admin/access-points/${initial.id}`);
                  router.push(`/admin/tours/${initial.tourType}`);
                } catch (err) {
                  toast.error(err);
                }
              }}
            >
              <Trash2 className="size-4" /> Delete viewpoint
            </Button>
          </Panel>
        </div>
      </div>
      {confirmEl}
      {!panorama && (
        <div className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2 border border-amber-700/30 bg-amber-50 px-4 py-2 text-sm text-amber-900 shadow lg:ml-32">
          <Plus className="mr-1 inline size-4" /> Assign a 360° panorama to start placing hotspots.
        </div>
      )}
    </div>
  );
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
