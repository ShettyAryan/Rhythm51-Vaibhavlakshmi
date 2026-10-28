"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AdminAsset } from "@/lib/content/queries";
import { api } from "./client";
import { AssetPicker } from "./MediaLibrary";
import { Button, Field, Input, Panel, StatusSelect, Toggle, useToast } from "./ui";

type DocType = "floor_plan" | "brochure";
interface DocState {
  title: string;
  status: "draft" | "published";
  allowDownload: boolean;
  asset: AdminAsset | null;
}

export function DocumentsManager({ initial }: { initial: Record<DocType, DocState> }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <DocumentPanel type="floor_plan" heading="Floor plan PDF" initial={initial.floor_plan} />
      <DocumentPanel type="brochure" heading="Brochure PDF" initial={initial.brochure} />
    </div>
  );
}

function DocumentPanel({ type, heading, initial }: { type: DocType; heading: string; initial: DocState }) {
  const toast = useToast();
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState(false);

  return (
    <Panel title={heading}>
      <form
        className="space-y-4"
        data-testid={`doc-${type}`}
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          try {
            await api("PATCH", `/api/admin/documents/${type}`, { assetId: v.asset?.id ?? null, title: v.title, status: v.status, allowDownload: v.allowDownload });
            toast.success("Saved. Publish to update the public site.");
            router.refresh();
          } catch (err) {
            toast.error(err);
          } finally {
            setSaving(false);
          }
        }}
      >
        <AssetPicker label="PDF file" value={v.asset} onChange={(asset) => setV({ ...v, asset })} categories={["pdf"]} testId={`doc-${type}-picker`} />
        <Field label="Title shown in the viewer">
          <Input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
        </Field>
        <Toggle checked={v.allowDownload} onChange={(b) => setV({ ...v, allowDownload: b })} label="Show a download button" description="Visitors can always view the PDF in the page; this only controls the download button." />
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
