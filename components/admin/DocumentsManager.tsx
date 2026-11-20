"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { AdminAsset, AdminDocument } from "@/lib/content/queries";
import type { DocumentType } from "@/lib/content/rows";
import { api } from "./client";
import { AssetPicker } from "./MediaLibrary";
import { Button, Field, Input, Panel, StatusSelect, Toggle, useToast } from "./ui";

type DocType = DocumentType;
interface FileRow {
  key: number;
  title: string;
  asset: AdminAsset | null;
}

export function DocumentsManager({ initial }: { initial: Record<DocType, AdminDocument> }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <DocumentPanel type="floor_plan" heading="Floor plan" initial={initial.floor_plan} />
      <DocumentPanel type="brochure" heading="Brochure" initial={initial.brochure} />
      <DocumentPanel type="renders" heading="Renders" initial={initial.renders} />
    </div>
  );
}

function DocumentPanel({ type, heading, initial }: { type: DocType; heading: string; initial: AdminDocument }) {
  const toast = useToast();
  const router = useRouter();
  const seq = useRef(0);
  const row = (title: string, asset: AdminAsset | null): FileRow => ({ key: ++seq.current, title, asset });
  const [v, setV] = useState({ title: initial.title, status: initial.status, allowDownload: initial.allowDownload });
  const [files, setFiles] = useState<FileRow[]>(() =>
    initial.files.length ? initial.files.map((f) => row(f.title, f.asset)) : [row("", null)],
  );
  const [saving, setSaving] = useState(false);

  const update = (key: number, patch: Partial<FileRow>) => setFiles((fs) => fs.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  const move = (index: number, by: -1 | 1) =>
    setFiles((fs) => {
      const next = fs.slice();
      const [item] = next.splice(index, 1);
      next.splice(index + by, 0, item!);
      return next;
    });

  return (
    <Panel
      title={heading}
      description={
        type === "renders"
          ? "A gallery of render images, shown in this order. The label is the caption under each picture. Use landscape images at least 2400px wide."
          : "Each file becomes a tab in the viewer, in this order. PDFs and images (JPEG, PNG, WebP) are supported."
      }
    >
      <form
        className="space-y-4"
        data-testid={`doc-${type}`}
        onSubmit={async (e) => {
          e.preventDefault();
          const chosen = files.filter((f) => f.asset);
          if (new Set(chosen.map((f) => f.asset!.id)).size !== chosen.length) {
            toast.error(new Error("The same file is added twice. Remove one of them."));
            return;
          }
          setSaving(true);
          try {
            await api("PATCH", `/api/admin/documents/${type}`, {
              files: chosen.map((f) => ({ assetId: f.asset!.id, title: f.title })),
              title: v.title,
              status: v.status,
              allowDownload: v.allowDownload,
            });
            toast.success("Saved. Publish to update the public site.");
            router.refresh();
          } catch (err) {
            toast.error(err);
          } finally {
            setSaving(false);
          }
        }}
      >
        <ol className="space-y-3">
          {files.map((f, i) => (
            <li key={f.key} className="border border-charcoal/10 bg-sand/30 p-3" data-testid={`doc-${type}-file-${i}`}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-[0.12em] text-charcoal/70">File {i + 1}</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => move(i, 1)} disabled={i === files.length - 1} aria-label="Move down">
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setFiles((fs) => fs.filter((x) => x.key !== f.key))} aria-label="Remove file">
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-3">
                <AssetPicker
                  label={type === "renders" ? "Render image" : "PDF or image"}
                  value={f.asset}
                  onChange={(asset) => update(f.key, { asset })}
                  categories={type === "renders" ? ["image"] : ["pdf", "floor_plan_image", "image"]}
                  testId={i === 0 ? `doc-${type}-picker` : `doc-${type}-picker-${i}`}
                />
                <Field
                  label={type === "renders" ? "Caption" : "Tab label"}
                  hint={type === "renders" ? "Optional, e.g. “Living room”. Shown under the picture." : "Optional. Defaults to the file name. Only shown when there is more than one file."}
                >
                  <Input value={f.title} maxLength={80} placeholder="e.g. 3 BHK — Type A" onChange={(e) => update(f.key, { title: e.target.value })} />
                </Field>
              </div>
            </li>
          ))}
        </ol>
        <Button size="sm" onClick={() => setFiles((fs) => [...fs, row("", null)])} disabled={files.length >= 20} data-testid={`doc-${type}-add`}>
          <Plus className="size-4" /> Add file
        </Button>

        <Field label="Title shown in the viewer">
          <Input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
        </Field>
        <Toggle
          checked={v.allowDownload}
          onChange={(b) => setV({ ...v, allowDownload: b })}
          label="Show a download button"
          description="Visitors can always view the files in the page; this only controls the download button."
        />
        <div className="flex items-end justify-between gap-3">
          <Field label="Visibility">
            <StatusSelect value={v.status} onChange={(s) => setV({ ...v, status: s })} testId={`doc-${type}-status`} />
          </Field>
          <Button type="submit" variant="primary" loading={saving}>
            Save
          </Button>
        </div>
      </form>
    </Panel>
  );
}
