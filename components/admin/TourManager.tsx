"use client";

import { ArrowDown, ArrowUp, ChevronDown, Eye, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { AdminAsset, AdminFloorPlan, AdminGroup } from "@/lib/content/queries";
import type { TourType } from "@/lib/tour/types";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "./client";
import { AssetPicker } from "./MediaLibrary";
import { Button, Field, Input, PageHeader, Panel, Select, StatusBadge, StatusSelect, Textarea, useConfirm, useToast } from "./ui";

interface TourInfo {
  id: string;
  type: TourType;
  name: string;
  description: string;
  status: "draft" | "published";
  defaultAccessPointId: string | null;
}

const COPY: Record<TourType, { title: string; group: string; groups: string; example: string }> = {
  rooms: { title: "Rooms", group: "room", groups: "rooms", example: "e.g. Living Room" },
  amenities: { title: "Amenities", group: "amenity", groups: "amenities", example: "e.g. Swimming Pool" },
};

export function TourManager({ type }: { type: TourType }) {
  const toast = useToast();
  const router = useRouter();
  const { confirm, element: confirmEl } = useConfirm();
  const copy = COPY[type];
  const [tour, setTour] = useState<TourInfo | null>(null);
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [plans, setPlans] = useState<AdminFloorPlan[]>([]);
  const [newGroup, setNewGroup] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [t, p] = await Promise.all([
        api<{ tour: TourInfo; groups: AdminGroup[] }>("GET", `/api/admin/tours/${type}`),
        api<{ floorPlans: AdminFloorPlan[] }>("GET", "/api/admin/floor-plans"),
      ]);
      setTour(t.tour);
      setGroups(t.groups);
      setPlans(p.floorPlans);
    } catch (err) {
      toast.error(err);
    }
  }, [type, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!tour) {
    return (
      <div className="grid place-items-center py-24 text-plum">
        <Spinner />
      </div>
    );
  }

  const allAps = groups.flatMap((g) => g.accessPoints);

  const run = async (fn: () => Promise<unknown>, success?: string) => {
    try {
      await fn();
      if (success) toast.success(success);
      await load();
      router.refresh();
    } catch (err) {
      toast.error(err);
    }
  };

  const move = (list: string[], index: number, delta: number) => {
    const next = list.slice();
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item!);
    return next;
  };

  return (
    <>
      <PageHeader
        title={copy.title}
        description={`Create ${copy.groups}, add viewpoints (access points) to each, then place hotspots in the viewpoint editor.`}
        actions={
          <Link href={`/admin/preview/tour/${type}?drafts=1`} target="_blank">
            <Button>
              <Eye className="size-4" /> Preview with drafts
            </Button>
          </Link>
        }
      />

      <Panel title="Tour settings" className="mb-6">
        <TourSettings tour={tour} aps={allAps} onSave={(patch) => run(() => api("PATCH", `/api/admin/tours/${type}`, patch), "Tour updated")} />
      </Panel>

      <Panel
        title={`${copy.title} (${groups.length})`}
        actions={
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newGroup.trim()) return;
              void run(async () => {
                await api("POST", `/api/admin/tours/${type}/groups`, { name: newGroup.trim() });
                setNewGroup("");
              }, `Added ${newGroup.trim()}`);
            }}
          >
            <Input value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder={copy.example} aria-label={`New ${copy.group} name`} className="w-56" data-testid="new-group-name" />
            <Button type="submit" variant="primary" data-testid="add-group">
              <Plus className="size-4" /> Add {copy.group}
            </Button>
          </form>
        }
      >
        {groups.length === 0 ? (
          <p className="py-8 text-center text-sm text-stone">No {copy.groups} yet.</p>
        ) : (
          <ul className="space-y-3" role="list">
            {groups.map((g, gi) => (
              <li key={g.id} className="border border-charcoal/10" data-testid="admin-group" data-name={g.name}>
                <div className="flex flex-wrap items-center gap-3 bg-ivory/60 px-3 py-2.5">
                  <div className="h-12 w-16 shrink-0 overflow-hidden bg-sand">
                    {g.thumbUrl && (
                      <img src={g.thumbUrl} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-xl text-plum">{g.name}</p>
                    <p className="text-xs text-stone">
                      {g.accessPoints.length} viewpoint{g.accessPoints.length === 1 ? "" : "s"}
                      {g.floorPlanId ? ` · ${plans.find((p) => p.id === g.floorPlanId)?.name ?? "plan"}` : " · no floor plan"}
                    </p>
                  </div>
                  <StatusBadge status={g.status} />
                  <div className="flex items-center">
                    <Button size="sm" variant="ghost" aria-label="Move up" disabled={gi === 0} onClick={() => run(() => api("POST", `/api/admin/tours/${type}/reorder`, { ids: move(groups.map((x) => x.id), gi, -1) }))}>
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button size="sm" variant="ghost" aria-label="Move down" disabled={gi === groups.length - 1} onClick={() => run(() => api("POST", `/api/admin/tours/${type}/reorder`, { ids: move(groups.map((x) => x.id), gi, 1) }))}>
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(editing === g.id ? null : g.id)} aria-expanded={editing === g.id} data-testid="edit-group">
                      <Pencil className="size-4" /> Edit <ChevronDown className={`size-3 transition ${editing === g.id ? "rotate-180" : ""}`} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Delete ${g.name}`}
                      onClick={async () => {
                        const ok = await confirm(
                          `Delete ${copy.group}`,
                          <>Delete <strong>{g.name}</strong> and its {g.accessPoints.length} viewpoint(s) and their hotspots? This cannot be undone. Uploaded files stay in the media library.</>,
                        );
                        if (ok) void run(() => api("DELETE", `/api/admin/groups/${g.id}`), "Deleted");
                      }}
                    >
                      <Trash2 className="size-4 text-red-800" />
                    </Button>
                  </div>
                </div>

                {editing === g.id && (
                  <GroupEditor group={g} plans={plans} onSave={(patch) => run(() => api("PATCH", `/api/admin/groups/${g.id}`, patch), "Saved")} />
                )}

                <ul className="divide-y divide-charcoal/8" role="list">
                  {g.accessPoints.map((ap, ai) => (
                    <li key={ap.id} className="flex flex-wrap items-center gap-3 px-3 py-2 pl-6" data-testid="admin-ap" data-name={ap.name}>
                      <div className="h-9 w-16 shrink-0 overflow-hidden bg-sand">
                        {ap.thumbUrl && (
                          <img src={ap.thumbUrl} alt="" className="h-full w-full object-cover" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <Link href={`/admin/access-points/${ap.id}`} className="text-sm font-medium text-charcoal hover:text-plum">
                          {ap.name}
                        </Link>
                        <p className="flex flex-wrap gap-x-3 text-[11px] text-stone">
                          <span className={ap.hasPanorama ? "" : "text-red-700"}>{ap.hasPanorama ? "Panorama ✓" : "No panorama"}</span>
                          <span>{ap.hotspotCount} hotspot{ap.hotspotCount === 1 ? "" : "s"}</span>
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="size-3" /> {ap.marker ? "On plan" : "Not placed"}
                          </span>
                          {g.defaultAccessPointId === ap.id && <span className="text-plum">Room start</span>}
                          {tour.defaultAccessPointId === ap.id && <span className="text-plum">Tour start</span>}
                        </p>
                      </div>
                      <StatusBadge status={ap.status} />
                      <div className="flex items-center">
                        <Button size="sm" variant="ghost" aria-label="Move up" disabled={ai === 0} onClick={() => run(() => api("POST", `/api/admin/groups/${g.id}/reorder`, { ids: move(g.accessPoints.map((x) => x.id), ai, -1) }))}>
                          <ArrowUp className="size-4" />
                        </Button>
                        <Button size="sm" variant="ghost" aria-label="Move down" disabled={ai === g.accessPoints.length - 1} onClick={() => run(() => api("POST", `/api/admin/groups/${g.id}/reorder`, { ids: move(g.accessPoints.map((x) => x.id), ai, 1) }))}>
                          <ArrowDown className="size-4" />
                        </Button>
                        <Link href={`/admin/access-points/${ap.id}`}>
                          <Button size="sm">
                            <Pencil className="size-4" /> Editor
                          </Button>
                        </Link>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Delete ${ap.name}`}
                          onClick={async () => {
                            if (await confirm("Delete viewpoint", <>Delete <strong>{ap.name}</strong> and all hotspots leading to or from it?</>)) {
                              void run(() => api("DELETE", `/api/admin/access-points/${ap.id}`), "Viewpoint deleted");
                            }
                          }}
                        >
                          <Trash2 className="size-4 text-red-800" />
                        </Button>
                      </div>
                    </li>
                  ))}
                  <li className="px-3 py-2 pl-6">
                    <NewAccessPoint
                      onCreate={async (name) => {
                        try {
                          const { accessPoint } = await api<{ accessPoint: { id: string } }>("POST", `/api/admin/groups/${g.id}/access-points`, { name });
                          router.push(`/admin/access-points/${accessPoint.id}`);
                        } catch (err) {
                          toast.error(err);
                        }
                      }}
                    />
                  </li>
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {confirmEl}
    </>
  );
}

function TourSettings({ tour, aps, onSave }: { tour: TourInfo; aps: AdminGroup["accessPoints"]; onSave: (patch: Partial<TourInfo>) => void }) {
  const [v, setV] = useState(tour);
  useEffect(() => setV(tour), [tour]);
  return (
    <form
      className="grid items-end gap-4 md:grid-cols-[1fr_1fr_auto_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ name: v.name, description: v.description, status: v.status, defaultAccessPointId: v.defaultAccessPointId });
      }}
    >
      <Field label="Tour name">
        <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      </Field>
      <Field label="Starting viewpoint" hint="Where “Explore” opens.">
        <Select value={v.defaultAccessPointId ?? ""} onChange={(e) => setV({ ...v, defaultAccessPointId: e.target.value || null })}>
          <option value="">First available</option>
          {aps.map((a) => (
            <option key={a.id} value={a.id}>{a.groupName} — {a.name}</option>
          ))}
        </Select>
      </Field>
      <Field label="Status">
        <StatusSelect value={v.status} onChange={(s) => setV({ ...v, status: s })} testId="tour-status" />
      </Field>
      <Button type="submit" variant="primary">Save</Button>
    </form>
  );
}

function GroupEditor({ group, plans, onSave }: { group: AdminGroup; plans: AdminFloorPlan[]; onSave: (patch: Record<string, unknown>) => void }) {
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description);
  const [status, setStatus] = useState(group.status);
  const [floorPlanId, setFloorPlanId] = useState(group.floorPlanId ?? "");
  const [defaultAp, setDefaultAp] = useState(group.defaultAccessPointId ?? "");
  const [thumb, setThumb] = useState<AdminAsset | null>(null);
  const [thumbTouched, setThumbTouched] = useState(false);

  useEffect(() => {
    if (!group.thumbnailAssetId) return;
    api<{ asset: AdminAsset }>("GET", `/api/admin/assets/${group.thumbnailAssetId}`).then((r) => setThumb(r.asset), () => undefined);
  }, [group.thumbnailAssetId]);

  return (
    <form
      className="grid gap-4 border-t border-charcoal/10 bg-white p-4 md:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          name,
          description,
          status,
          floorPlanId: floorPlanId || null,
          defaultAccessPointId: defaultAp || null,
          ...(thumbTouched ? { thumbnailAssetId: thumb?.id ?? null } : {}),
        });
      }}
      data-testid="group-editor"
    >
      <div className="space-y-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Description (optional)">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Floor / site plan" hint="Default plan for new viewpoints.">
            <Select value={floorPlanId} onChange={(e) => setFloorPlanId(e.target.value)}>
              <option value="">None</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Starting viewpoint">
            <Select value={defaultAp} onChange={(e) => setDefaultAp(e.target.value)}>
              <option value="">First</option>
              {group.accessPoints.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Visibility">
          <StatusSelect value={status} onChange={setStatus} testId="group-status" />
        </Field>
      </div>
      <div className="space-y-4">
        <AssetPicker
          label="Thumbnail (optional)"
          value={thumb}
          onChange={(a) => {
            setThumb(a);
            setThumbTouched(true);
          }}
          categories={["image"]}
          hint="If empty, the first viewpoint’s panorama is used."
        />
        <div className="flex justify-end">
          <Button type="submit" variant="primary" data-testid="save-group">Save</Button>
        </div>
      </div>
    </form>
  );
}

function NewAccessPoint({ onCreate }: { onCreate: (name: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        setBusy(true);
        await onCreate(name.trim());
        setBusy(false);
      }}
    >
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New viewpoint, e.g. Entrance View" className="max-w-xs" aria-label="New viewpoint name" data-testid="new-ap-name" />
      <Button type="submit" size="md" loading={busy} data-testid="add-ap">
        <Plus className="size-4" /> Add viewpoint
      </Button>
    </form>
  );
}
