"use client";

import { ExternalLink, FileImage, MapPin, Plus, RotateCw, Save, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AdminAsset, AdminFloorPlan, AdminGroup } from "@/lib/content/queries";
import { normalizeYaw, planBearing } from "@/lib/tour/geometry";
import { Spinner } from "@/components/ui/Spinner";
import { api, uploadFile } from "./client";
import { AssetPicker } from "./MediaLibrary";
import { PlanCanvas, type PlanMarker } from "./PlanCanvas";
import { renderPdfPageToPng } from "./pdfToImage";
import { Button, Field, Input, NumberInput, PageHeader, Panel, StatusBadge, StatusSelect, useConfirm, useToast } from "./ui";

// ---------------------------------------------------------------------------
// List + create
// ---------------------------------------------------------------------------

export function FloorPlanList() {
  const toast = useToast();
  const router = useRouter();
  const [plans, setPlans] = useState<AdminFloorPlan[] | null>(null);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api<{ floorPlans: AdminFloorPlan[] }>("GET", "/api/admin/floor-plans").then((r) => setPlans(r.floorPlans), (e) => toast.error(e));
  }, [toast]);
  useEffect(load, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const planName = name.trim() || file?.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "";
    if (!planName) {
      setError("Enter a name for the plan (e.g. “2 BHK Type A”) or choose a file.");
      return;
    }
    try {
      setStatus("Creating plan…");
      const { floorPlan } = await api<{ floorPlan: { id: string } }>("POST", "/api/admin/floor-plans", { name: planName });
      if (file) {
        const patch: Record<string, unknown> = { status: "published" };
        if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
          setStatus("Uploading PDF…");
          const pdf = await uploadFile(file, { category: "pdf", onProgress: (p) => setStatus(p < 0.9 ? `Uploading PDF… ${Math.round(p * 100)}%` : "Processing PDF…") });
          setStatus("Converting page 1 to an image…");
          const { blob } = await renderPdfPageToPng(file, 1);
          const img = await uploadFile(blob, { category: "floor_plan_image", fileName: `${planName}-page-1.png` });
          Object.assign(patch, { originalPdfAssetId: pdf.id, pageNumber: 1, imageAssetId: img.id });
        } else {
          const img = await uploadFile(file, { category: "floor_plan_image", onProgress: (p) => setStatus(p < 0.9 ? `Uploading image… ${Math.round(p * 100)}%` : "Processing image…") });
          patch.imageAssetId = img.id;
        }
        setStatus("Saving…");
        await api("PATCH", `/api/admin/floor-plans/${floorPlan.id}`, patch);
      }
      router.push(`/admin/floor-plans/${floorPlan.id}`);
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : "Could not create the plan.");
    }
  };

  return (
    <div className="space-y-6">
      <Panel title="Add a floor plan" description="One plan per apartment type, floor or site plan. Upload an image (PNG/JPG/WebP) or a PDF — a PDF’s first page becomes the plan image (you can choose another page later).">
        <form className="grid items-end gap-3 md:grid-cols-[1fr_1.2fr_auto]" onSubmit={create} data-testid="new-plan-form">
          <Field label="Plan name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 2 BHK Type A, Site Plan" data-testid="new-plan-name" />
          </Field>
          <Field label="Plan file (optional)">
            <div className="flex items-center gap-2 border border-charcoal/20 bg-white px-2 py-1.5">
              <input
                ref={fileInput}
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf"
                className="sr-only"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                data-testid="new-plan-file"
                aria-label="Plan image or PDF"
              />
              <Button size="sm" onClick={() => fileInput.current?.click()}>
                <Upload className="size-4" /> Choose file
              </Button>
              <span className="truncate text-sm text-stone">{file ? file.name : "Image or PDF"}</span>
            </div>
          </Field>
          <Button type="submit" variant="primary" loading={!!status} data-testid="add-plan">
            <Plus className="size-4" /> Add plan
          </Button>
        </form>
        {status && <p className="mt-2 text-sm text-plum" role="status">{status}</p>}
        {error && <p className="mt-2 text-sm text-red-700" role="alert" data-testid="new-plan-error">{error}</p>}
      </Panel>

      <Panel title={`Plans${plans ? ` (${plans.length})` : ""}`}>
        {plans === null ? (
          <Spinner className="text-plum" />
        ) : plans.length === 0 ? (
          <p className="py-6 text-center text-sm text-stone">No floor plans yet.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" role="list">
            {plans.map((p) => (
              <li key={p.id}>
                <Link href={`/admin/floor-plans/${p.id}`} className="block border border-charcoal/10 bg-white transition hover:border-plum">
                  <div className="grid aspect-[4/3] place-items-center bg-sand/50">
                    {p.image?.thumbUrl ? (
                      <img src={p.image.thumbUrl} alt="" className="h-full w-full object-contain" />
                    ) : (
                      <span className="text-xs text-stone">No image yet</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="font-display text-lg text-plum">{p.name}</span>
                    <StatusBadge status={p.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

type Ap = AdminGroup["accessPoints"][number];
interface ApEdit {
  marker: { x: number; y: number } | null;
  headingOffset: number;
  initialYaw: number;
}
type RotateMode = "align" | "start";

export function FloorPlanEditor({ plan, tours }: { plan: AdminFloorPlan; tours: { label: string; groups: AdminGroup[] }[] }) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, element: confirmEl } = useConfirm();
  const allAps = useMemo(() => tours.flatMap((t) => t.groups.flatMap((g) => g.accessPoints)), [tours]);
  const original = useMemo(
    () => Object.fromEntries(allAps.map((a) => [a.id, { marker: a.floorPlanId === plan.id ? a.marker : null, headingOffset: a.headingOffset, initialYaw: a.initialYaw }])) as Record<string, ApEdit>,
    [allAps, plan.id],
  );

  const [name, setName] = useState(plan.name);
  const [status, setStatus] = useState(plan.status);
  const [orientation, setOrientation] = useState(plan.orientationOffset);
  const [image, setImage] = useState<AdminAsset | null>(plan.image);
  const [pdf, setPdf] = useState<AdminAsset | null>(plan.originalPdf);
  const [page, setPage] = useState(plan.pageNumber ?? 1);
  const [rendering, setRendering] = useState(false);
  const [edits, setEdits] = useState<Record<string, ApEdit>>(original);
  const [selected, setSelected] = useState<string | null>(null);
  const [rotateMode, setRotateMode] = useState<RotateMode>("align");
  const [saving, setSaving] = useState(false);

  const changed = allAps.filter((a) => JSON.stringify(edits[a.id]) !== JSON.stringify(original[a.id]));
  const planChanged =
    name !== plan.name || status !== plan.status || orientation !== plan.orientationOffset || (image?.id ?? null) !== (plan.image?.id ?? null) ||
    (pdf?.id ?? null) !== (plan.originalPdf?.id ?? null) || (pdf ? page : null) !== plan.pageNumber;
  const dirty = changed.length > 0 || planChanged;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const update = (id: string, patch: Partial<ApEdit>) => setEdits((e) => ({ ...e, [id]: { ...e[id]!, ...patch } }));
  const bearingOf = (id: string) => planBearing(edits[id]!.initialYaw, edits[id]!.headingOffset, orientation);
  const setBearing = (id: string, bearing: number) => {
    const e = edits[id]!;
    if (rotateMode === "align") update(id, { headingOffset: Math.round(normalizeYaw(bearing - e.initialYaw - orientation) * 10) / 10 });
    else update(id, { initialYaw: Math.round(normalizeYaw(bearing - e.headingOffset - orientation) * 10) / 10 });
  };

  const save = async () => {
    setSaving(true);
    try {
      await api("PATCH", `/api/admin/floor-plans/${plan.id}`, {
        name,
        status,
        orientationOffset: orientation,
        imageAssetId: image?.id ?? null,
        originalPdfAssetId: pdf?.id ?? null,
        pageNumber: pdf ? page : null,
        markers: changed.map((a) => ({
          accessPointId: a.id,
          marker: edits[a.id]!.marker,
          headingOffset: edits[a.id]!.headingOffset,
          initialYaw: edits[a.id]!.initialYaw,
        })),
      });
      toast.success("Floor plan saved. Publish to update the public site.");
      router.refresh();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const applyPdfPage = async (source: AdminAsset, pageNo: number) => {
    setRendering(true);
    try {
      const { blob } = await renderPdfPageToPng(source.url, pageNo);
      const asset = await uploadFile(blob, { category: "floor_plan_image", fileName: `${source.fileName.replace(/\.pdf$/i, "")}-page-${pageNo}.png` });
      setImage(asset);
      toast.success(`Page ${pageNo} is now the plan image. Click Save to keep it.`);
    } catch (err) {
      toast.error(err);
    } finally {
      setRendering(false);
    }
  };

  const sel = selected ? allAps.find((a) => a.id === selected) : undefined;
  const selEdit = selected ? edits[selected] : undefined;

  const planMarkers: PlanMarker[] = allAps
    .filter((a) => edits[a.id]?.marker)
    .map((a) => ({
      id: a.id,
      x: edits[a.id]!.marker!.x,
      y: edits[a.id]!.marker!.y,
      label: a.name,
      active: selected === a.id,
      muted: !!selected && selected !== a.id,
      bearing: bearingOf(a.id),
      coneWidth: 60,
      draggable: true,
      rotatable: true,
    }));

  return (
    <div className="space-y-6" data-testid="floorplan-editor">
      <PageHeader
        title={name || "Floor plan"}
        description={<Link href="/admin/floor-plans" className="hover:text-plum">← All floor plans</Link>}
        actions={
          <>
            <StatusSelect value={status} onChange={setStatus} testId="plan-status" />
            <Button variant="primary" onClick={save} loading={saving} disabled={!dirty || rendering} data-testid="plan-save">
              <Save className="size-4" /> {dirty ? "Save changes" : "Saved"}
            </Button>
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <div className="space-y-6">
          <Panel
            title="Viewpoints on this plan"
            description={
              selected
                ? "Drag the dark dot to move the viewpoint (or click elsewhere on the plan). Drag the white handle at the tip of the cone to turn its direction."
                : "Select a viewpoint (click a dot, or choose one from the list) to move it or change its direction."
            }
          >
            {image ? (
              <PlanCanvas
                src={image.media.variants.lg?.url ?? image.url}
                width={image.width}
                height={image.height}
                markers={planMarkers}
                cursor={selected ? "crosshair" : "default"}
                testId="plan-canvas"
                onPlanClick={(x, y) => {
                  if (selected) update(selected, { marker: { x, y } });
                }}
                onMarkerClick={(id) => setSelected(id)}
                onMarkerDrag={(id, x, y) => {
                  setSelected(id);
                  update(id, { marker: { x: round5(x), y: round5(y) } });
                }}
                onRotate={(id, bearing) => setBearing(id, bearing)}
              />
            ) : (
              <p className="py-10 text-center text-sm text-stone">Add a plan image (or a PDF) on the right to start placing viewpoints.</p>
            )}

            {sel && selEdit && (
              <div className="mt-4 grid gap-4 border border-plum/25 bg-plum/[0.03] p-4 md:grid-cols-2" data-testid="selected-viewpoint">
                <div className="space-y-1">
                  <p className="eyebrow text-stone">Selected viewpoint</p>
                  <p className="font-display text-2xl text-plum">{sel.groupName} — {sel.name}</p>
                  <p className="text-xs text-stone">
                    {selEdit.marker
                      ? `Position ${Math.round(selEdit.marker.x * 1000) / 10}% across, ${Math.round(selEdit.marker.y * 1000) / 10}% down`
                      : "Not on this plan yet — click the plan to place it."}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-2">
                    {selEdit.marker && (
                      <Button size="sm" variant="ghost" onClick={() => update(sel.id, { marker: null })}>
                        <Trash2 className="size-4" /> Remove from plan
                      </Button>
                    )}
                    <Link href={`/admin/access-points/${sel.id}`} target="_blank">
                      <Button size="sm" variant="ghost">
                        <ExternalLink className="size-4" /> Open in viewpoint editor
                      </Button>
                    </Link>
                  </div>
                </div>
                <div className="space-y-3">
                  <fieldset>
                    <legend className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-charcoal/70">Turning the cone changes</legend>
                    <label className="flex items-start gap-2 text-sm">
                      <input type="radio" name="rotate-mode" checked={rotateMode === "align"} onChange={() => setRotateMode("align")} className="mt-1 accent-plum" data-testid="mode-align" />
                      <span>
                        <strong className="font-medium">Alignment with the plan</strong>
                        <span className="block text-xs text-stone">Use when the cone points the wrong way compared with the panorama.</span>
                      </span>
                    </label>
                    <label className="mt-1 flex items-start gap-2 text-sm">
                      <input type="radio" name="rotate-mode" checked={rotateMode === "start"} onChange={() => setRotateMode("start")} className="mt-1 accent-plum" data-testid="mode-start" />
                      <span>
                        <strong className="font-medium">Starting direction</strong>
                        <span className="block text-xs text-stone">Where visitors face when they arrive at this viewpoint.</span>
                      </span>
                    </label>
                  </fieldset>
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="Direction °">
                      <NumberInput value={Math.round(bearingOf(sel.id))} step={5} onChange={(v) => setBearing(sel.id, v)} data-testid="direction-input" />
                    </Field>
                    <Field label="Alignment °">
                      <NumberInput value={selEdit.headingOffset} step={1} onChange={(v) => update(sel.id, { headingOffset: normalizeYaw(v) })} data-testid="alignment-input" />
                    </Field>
                    <Field label="Start yaw °">
                      <NumberInput value={selEdit.initialYaw} step={1} onChange={(v) => update(sel.id, { initialYaw: normalizeYaw(v) })} />
                    </Field>
                  </div>
                  <p className="text-xs text-stone">Direction 0° = towards the top of the plan, 90° = right.</p>
                </div>
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Plan">
            <div className="space-y-4">
              <Field label="Name">
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <AssetPicker
                label="Plan image (shown in the navigator)"
                value={image}
                onChange={setImage}
                categories={["floor_plan_image", "image"]}
                hint="PNG/JPEG/WebP. Have a PDF instead? Use the PDF option below."
                testId="plan-image-picker"
              />
              <div className="border-t border-charcoal/10 pt-4">
                <AssetPicker
                  label="Or use a PDF page"
                  value={pdf}
                  onChange={(a) => {
                    setPdf(a);
                    if (a) void applyPdfPage(a, page);
                  }}
                  categories={["pdf"]}
                  hint="The chosen page is converted into the plan image automatically. The PDF itself is kept."
                  testId="plan-pdf-picker"
                />
                {pdf && (
                  <div className="mt-2 flex items-end gap-2">
                    <Field label="Page" className="w-24">
                      <NumberInput value={page} min={1} step={1} onChange={(v) => setPage(Math.max(1, Math.round(v)))} />
                    </Field>
                    <Button onClick={() => applyPdfPage(pdf, page)} loading={rendering}>
                      <FileImage className="size-4" /> {rendering ? "Converting…" : "Use this page"}
                    </Button>
                  </div>
                )}
              </div>
              <Field label="Plan rotation °" hint="Turns every viewpoint’s direction on this plan at once — only needed if the plan image is rotated relative to your renders.">
                <NumberInput value={orientation} step={90} onChange={(v) => setOrientation(normalizeYaw(v))} />
              </Field>
            </div>
          </Panel>

          <Panel title="Viewpoints" description="Click a name to select it, then click the plan to place or move it.">
            <div className="space-y-4">
              {tours.map((t) => (
                <div key={t.label}>
                  <p className="eyebrow mb-1 text-stone">{t.label}</p>
                  {t.groups.length === 0 && <p className="text-xs text-stone">None yet</p>}
                  {t.groups.map((g) => (
                    <div key={g.id} className="mb-2">
                      <p className="text-sm font-medium text-plum">{g.name}</p>
                      <ul role="list">
                        {g.accessPoints.map((a: Ap) => {
                          const placed = !!edits[a.id]?.marker;
                          const elsewhere = !placed && a.floorPlanId && a.floorPlanId !== plan.id;
                          return (
                            <li key={a.id}>
                              <button
                                type="button"
                                onClick={() => setSelected(selected === a.id ? null : a.id)}
                                aria-pressed={selected === a.id}
                                className={`flex w-full items-center gap-2 px-2 py-1 text-left text-sm ${selected === a.id ? "bg-plum/8 text-plum" : "text-charcoal hover:bg-sand/50"}`}
                                data-testid="plan-ap"
                                data-name={a.name}
                              >
                                <MapPin className={`size-3.5 shrink-0 ${placed ? "text-plum" : "text-stone/50"}`} />
                                <span className="truncate">{a.name}</span>
                                <span className="ml-auto text-[10px] text-stone">{placed ? "placed" : elsewhere ? "on another plan" : "not placed"}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Danger zone">
            <Button
              variant="danger"
              onClick={async () => {
                if (!(await confirm("Delete floor plan", <>Delete <strong>{name}</strong>? Viewpoints on it will lose their navigator position.</>))) return;
                try {
                  await api("DELETE", `/api/admin/floor-plans/${plan.id}`);
                  router.push("/admin/floor-plans");
                } catch (err) {
                  toast.error(err);
                }
              }}
            >
              <Trash2 className="size-4" /> Delete plan
            </Button>
          </Panel>
        </div>
      </div>
      {dirty && (
        <div className="fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 border border-plum/30 bg-white px-4 py-2 text-sm shadow-lg lg:ml-32" data-testid="unsaved-bar">
          <RotateCw className="size-4 text-plum" /> You have unsaved changes
          <Button size="sm" variant="primary" onClick={save} loading={saving} disabled={rendering}>
            Save
          </Button>
        </div>
      )}
      {confirmEl}
    </div>
  );
}

function round5(n: number) {
  return Math.round(n * 100000) / 100000;
}
