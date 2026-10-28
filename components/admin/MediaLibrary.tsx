"use client";

import { FileText, ImageIcon, Orbit, RefreshCw, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AdminAsset } from "@/lib/content/queries";
import { Dialog } from "@/components/ui/Dialog";
import { Spinner } from "@/components/ui/Spinner";
import { ACCEPT_ATTR, api, formatBytes, uploadFile, type UploadCategory } from "./client";
import { Button, Field, Input, Select, useConfirm, useToast } from "./ui";

export const CATEGORY_LABEL: Record<UploadCategory, string> = {
  panorama: "360° panoramas",
  image: "Images (hero, logo, thumbnails)",
  floor_plan_image: "Floor plan images",
  pdf: "PDF documents",
};

interface UploadJob {
  id: number;
  name: string;
  progress: number;
  error?: string;
}

interface MediaLibraryProps {
  /** Restrict the library to these categories (first one is the upload default). */
  categories?: UploadCategory[];
  mode?: "manage" | "pick";
  onPick?: (asset: AdminAsset) => void;
  selectedId?: string | null;
}

export function MediaLibrary({ categories, mode = "manage", onPick, selectedId }: MediaLibraryProps) {
  const toast = useToast();
  const allowed = categories ?? (["panorama", "image", "floor_plan_image", "pdf"] as UploadCategory[]);
  const [filter, setFilter] = useState<UploadCategory | "all">(categories?.length === 1 ? categories[0]! : "all");
  const [uploadCategory, setUploadCategory] = useState<UploadCategory>(allowed[0]!);
  const [assets, setAssets] = useState<AdminAsset[] | null>(null);
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [detail, setDetail] = useState<AdminAsset | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    try {
      const q = filter === "all" ? "" : `?category=${filter}`;
      const { assets } = await api<{ assets: AdminAsset[] }>("GET", `/api/admin/assets${q}`);
      setAssets(assets.filter((a) => allowed.includes(a.category as UploadCategory)));
    } catch (err) {
      toast.error(err);
      setAssets([]);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const startUploads = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      const id = ++seq.current;
      setJobs((j) => [...j, { id, name: file.name, progress: 0 }]);
      try {
        const asset = await uploadFile(file, {
          category: uploadCategory,
          onProgress: (p) => setJobs((j) => j.map((x) => (x.id === id ? { ...x, progress: p } : x))),
        });
        setJobs((j) => j.filter((x) => x.id !== id));
        setAssets((a) => [asset, ...(a ?? [])]);
        toast.success(`Uploaded ${asset.fileName}`);
        if (mode === "pick" && files.length === 1) onPick?.(asset);
      } catch (err) {
        setJobs((j) => j.map((x) => (x.id === id ? { ...x, error: err instanceof Error ? err.message : "Upload failed" } : x)));
      }
    }
    if (fileInput.current) fileInput.current.value = "";
  };

  return (
    <div className="flex min-h-0 flex-col gap-4" data-testid="media-library">
      <div className="flex flex-wrap items-end gap-3">
        {allowed.length > 1 && (
          <Field label="Show" className="w-56">
            <Select value={filter} onChange={(e) => setFilter(e.target.value as UploadCategory | "all")}>
              <option value="all">All files</option>
              {allowed.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
              ))}
            </Select>
          </Field>
        )}
        <div className="ml-auto flex flex-wrap items-end gap-2">
          {allowed.length > 1 && (
            <Field label="Upload as" className="w-56">
              <Select value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value as UploadCategory)} data-testid="upload-category">
                {allowed.map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                ))}
              </Select>
            </Field>
          )}
          <input
            ref={fileInput}
            type="file"
            multiple={mode === "manage"}
            accept={ACCEPT_ATTR[uploadCategory]}
            className="sr-only"
            onChange={(e) => startUploads(e.target.files)}
            data-testid="upload-input"
            aria-label="Choose files to upload"
          />
          <Button variant="primary" onClick={() => fileInput.current?.click()}>
            <Upload className="size-4" /> Upload
          </Button>
        </div>
      </div>
      {uploadCategory === "panorama" && (
        <p className="-mt-2 text-xs text-stone">
          Panoramas must be full 360° equirectangular images in a 2:1 (e.g. 8192×4096) or 16:9 (e.g. 7680×4320) frame, as JPEG at quality 90–95. Keep the width at or below 8192 px so desktops show it at full resolution; lighter versions for phones are generated automatically.
        </p>
      )}

      {jobs.length > 0 && (
        <ul className="space-y-2" role="list" aria-label="Uploads in progress">
          {jobs.map((j) => (
            <li key={j.id} className="border border-charcoal/10 bg-white px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate">{j.name}</span>
                {j.error ? (
                  <button type="button" className="text-xs text-stone underline" onClick={() => setJobs((x) => x.filter((y) => y.id !== j.id))}>
                    Dismiss
                  </button>
                ) : (
                  <span className="text-xs tabular-nums text-stone">{j.progress >= 0.9 ? "Processing…" : `${Math.round(j.progress * 100)}%`}</span>
                )}
              </div>
              {j.error ? (
                <p className="mt-1 text-xs text-red-700" role="alert">{j.error}</p>
              ) : (
                <div className="mt-2 h-1 bg-charcoal/10">
                  <div className="h-full bg-plum transition-[width]" style={{ width: `${j.progress * 100}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {assets === null ? (
        <div className="grid place-items-center py-16 text-plum">
          <Spinner />
        </div>
      ) : assets.length === 0 ? (
        <div className="border border-dashed border-charcoal/20 bg-white px-6 py-14 text-center text-sm text-stone">No files yet. Upload one to get started.</div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" role="list">
          {assets.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => (mode === "pick" ? onPick?.(a) : setDetail(a))}
                data-testid="asset-card"
                data-name={a.fileName}
                className={`group block w-full border bg-white text-left transition hover:border-plum ${selectedId === a.id ? "border-plum ring-2 ring-plum/25" : "border-charcoal/10"}`}
              >
                <AssetThumb asset={a} />
                <div className="space-y-0.5 px-2.5 py-2">
                  <p className="truncate text-xs font-medium text-charcoal" title={a.fileName}>{a.fileName}</p>
                  <p className="text-[11px] text-stone">
                    {formatBytes(a.fileSize)}
                    {a.width ? ` · ${a.width}×${a.height}` : ""}
                  </p>
                  <p className="text-[11px] text-stone">{a.usageCount ? `Used ${a.usageCount}×` : "Unused"}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {mode === "manage" && (
        <AssetDetail
          asset={detail}
          onClose={() => setDetail(null)}
          onChanged={(updated) => {
            setAssets((list) => list?.map((x) => (x.id === updated.id ? updated : x)) ?? null);
            setDetail(updated);
          }}
          onDeleted={(id) => {
            setAssets((list) => list?.filter((x) => x.id !== id) ?? null);
            setDetail(null);
          }}
        />
      )}
    </div>
  );
}

export function AssetThumb({ asset, className = "aspect-[4/3]" }: { asset: AdminAsset; className?: string }) {
  const Icon = asset.category === "pdf" ? FileText : asset.category === "panorama" ? Orbit : ImageIcon;
  return (
    <div className={`relative overflow-hidden bg-sand/60 ${className}`}>
      {asset.thumbUrl ? (
        <img src={asset.thumbUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-plum/60">
          <Icon className="size-10" strokeWidth={1} />
        </div>
      )}
      <span className="absolute left-1.5 top-1.5 bg-black/55 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-white">
        {asset.category === "floor_plan_image" ? "plan" : asset.category}
      </span>
    </div>
  );
}

interface Usage {
  kind: string;
  id: string;
  name: string;
  href: string;
  published: boolean;
}

function AssetDetail({ asset, onClose, onChanged, onDeleted }: { asset: AdminAsset | null; onClose: () => void; onChanged: (a: AdminAsset) => void; onDeleted: (id: string) => void }) {
  const toast = useToast();
  const { confirm, element } = useConfirm();
  const [usage, setUsage] = useState<Usage[] | null>(null);
  const [name, setName] = useState("");
  const [replacing, setReplacing] = useState<number | null>(null);
  const replaceInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!asset) return;
    setName(asset.fileName);
    setUsage(null);
    api<{ usage: Usage[] }>("GET", `/api/admin/assets/${asset.id}`).then((r) => setUsage(r.usage), (e) => toast.error(e));
  }, [asset, toast]);

  if (!asset) return null;
  const cat = asset.category as UploadCategory;

  return (
    <Dialog open={!!asset} onClose={onClose} title={asset.fileName} className="w-[min(96vw,820px)]">
      <div className="scroll-thin grid max-h-[80dvh] gap-5 overflow-y-auto p-5 md:grid-cols-[1.3fr_1fr]">
        <div>
          {asset.mimeType.startsWith("image/") ? (
            <img src={asset.url} alt={asset.fileName} className="max-h-[50dvh] w-full border border-charcoal/10 bg-sand/40 object-contain" />
          ) : (
            <div className="grid aspect-[4/3] place-items-center border border-charcoal/10 bg-sand/40">
              <a href={asset.url} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-2 text-plum underline-offset-4 hover:underline">
                <FileText className="size-12" strokeWidth={1} /> Open PDF in a new tab
              </a>
            </div>
          )}
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-stone">
            <dt>Type</dt>
            <dd>{asset.mimeType}</dd>
            <dt>Size</dt>
            <dd>{formatBytes(asset.fileSize)}</dd>
            {asset.width && (
              <>
                <dt>Dimensions</dt>
                <dd>{asset.width}×{asset.height}px</dd>
              </>
            )}
            <dt>Version</dt>
            <dd>{asset.version}</dd>
            <dt>Uploaded</dt>
            <dd>{new Date(asset.createdAt).toLocaleString()}</dd>
            <dt>Updated</dt>
            <dd>{new Date(asset.updatedAt).toLocaleString()}</dd>
          </dl>
        </div>
        <div className="space-y-5">
          <form
            className="space-y-2"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const { asset: updated } = await api<{ asset: AdminAsset }>("PATCH", `/api/admin/assets/${asset.id}`, { fileName: name });
                onChanged(updated);
                toast.success("Renamed");
              } catch (err) {
                toast.error(err);
              }
            }}
          >
            <Field label="Display name">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Button type="submit" size="sm" disabled={name === asset.fileName || !name.trim()}>
              Save name
            </Button>
          </form>

          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-charcoal/70">Used by</p>
            {usage === null ? (
              <Spinner className="size-5 text-plum" />
            ) : usage.length === 0 ? (
              <p className="text-sm text-stone">Not used anywhere.</p>
            ) : (
              <ul className="space-y-1 text-sm" role="list" data-testid="asset-usage">
                {usage.map((u) => (
                  <li key={`${u.kind}-${u.id}`}>
                    <Link href={u.href} className="text-plum underline-offset-4 hover:underline">{u.name}</Link>
                    <span className="text-xs text-stone"> · {u.kind}{u.published ? " · published" : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2 border-t border-charcoal/10 pt-4">
            <input
              ref={replaceInput}
              type="file"
              accept={ACCEPT_ATTR[cat]}
              className="sr-only"
              aria-label="Choose replacement file"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setReplacing(0);
                try {
                  const updated = await uploadFile(file, { category: cat, replaceAssetId: asset.id, onProgress: setReplacing });
                  onChanged(updated);
                  toast.success("File replaced. Publish to show it on the public site.");
                } catch (err) {
                  toast.error(err);
                } finally {
                  setReplacing(null);
                  e.target.value = "";
                }
              }}
            />
            <Button onClick={() => replaceInput.current?.click()} loading={replacing !== null} className="w-full">
              <RefreshCw className="size-4" /> {replacing !== null ? `Replacing… ${Math.round(replacing * 100)}%` : "Replace file"}
            </Button>
            <p className="text-xs text-stone">Replacing keeps every link to this file. Visitors keep seeing the old version until you publish.</p>
            <Button
              variant="danger"
              className="w-full"
              disabled={!usage || usage.length > 0}
              title={usage?.length ? "Remove it from the content listed above first" : undefined}
              onClick={async () => {
                if (!(await confirm("Delete file", `Permanently delete “${asset.fileName}”?`))) return;
                try {
                  await api("DELETE", `/api/admin/assets/${asset.id}`);
                  onDeleted(asset.id);
                  toast.success("File deleted");
                } catch (err) {
                  toast.error(err);
                }
              }}
            >
              <Trash2 className="size-4" /> Delete file
            </Button>
            {usage && usage.length > 0 && <p className="text-xs text-stone">Files in use can’t be deleted.</p>}
          </div>
        </div>
      </div>
      {element}
    </Dialog>
  );
}

/** Field control that shows the selected asset and opens the library to change it. */
export function AssetPicker({
  label,
  value,
  onChange,
  categories,
  hint,
  testId,
}: {
  label: string;
  value: AdminAsset | null;
  onChange: (asset: AdminAsset | null) => void;
  categories: UploadCategory[];
  hint?: React.ReactNode;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div data-testid={testId}>
      <span className="mb-1 block text-xs font-medium uppercase tracking-[0.12em] text-charcoal/70">{label}</span>
      <div className="flex items-stretch gap-3 border border-charcoal/15 bg-white p-2">
        {value ? <AssetThumb asset={value} className="aspect-[4/3] w-28 shrink-0" /> : <div className="grid aspect-[4/3] w-28 shrink-0 place-items-center bg-sand/50 text-xs text-stone">None</div>}
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
          <p className="truncate text-sm" title={value?.fileName}>{value?.fileName ?? "No file selected"}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setOpen(true)} data-testid={testId ? `${testId}-choose` : undefined}>
              {value ? "Change" : "Choose / upload"}
            </Button>
            {value && (
              <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
                Remove
              </Button>
            )}
          </div>
        </div>
      </div>
      {hint && <p className="mt-1 text-xs text-stone">{hint}</p>}
      <Dialog open={open} onClose={() => setOpen(false)} title={`Select — ${label}`} className="w-[min(96vw,1100px)]">
        <div className="scroll-thin max-h-[78dvh] overflow-y-auto p-5">
          <MediaLibrary
            categories={categories}
            mode="pick"
            selectedId={value?.id}
            onPick={(a) => {
              onChange(a);
              setOpen(false);
            }}
          />
        </div>
      </Dialog>
    </div>
  );
}
