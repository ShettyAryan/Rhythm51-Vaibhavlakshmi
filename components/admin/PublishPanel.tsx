"use client";

import { AlertTriangle, CircleAlert, Eye, FolderDown, Rocket } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DraftSummary } from "@/lib/content/manage";
import type { ContentWarning } from "@/lib/content/queries";
import { LocalDate } from "@/components/ui/LocalDate";
import { api } from "./client";
import { Button, Panel, useToast } from "./ui";

export function PublishPanel({
  lastPublishedAt,
  lastEditedAt,
  siteOnline,
  warnings,
  drafts,
}: {
  lastPublishedAt: string | null;
  lastEditedAt: string | null;
  siteOnline: boolean;
  warnings: ContentWarning[];
  drafts: DraftSummary;
}) {
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<{ outDir: string; files: number; bytes: number; publishedAt: string } | null>(null);
  const pending = !!lastEditedAt && (!lastPublishedAt || lastEditedAt > lastPublishedAt);
  const errors = warnings.filter((w) => w.severity === "error");
  const draftParts = [
    [drafts.viewpoints, "viewpoint"],
    [drafts.rooms, "room / amenity"],
    [drafts.tours, "tour"],
    [drafts.floorPlans, "floor plan"],
    [drafts.documents, "document"],
  ]
    .filter(([n]) => (n as number) > 0)
    .map(([n, label]) => `${n} ${label}${n === 1 || String(label).includes("/") ? "" : "s"}`);
  const hasDrafts = draftParts.length > 0;

  const publish = async (includeDrafts: boolean) => {
    setBusy(true);
    try {
      const res = await api<{ marked: DraftSummary | null }>("POST", "/api/admin/publish", { includeDrafts });
      const m = res.marked;
      const n = m ? m.viewpoints + m.rooms + m.tours + m.floorPlans + m.documents : 0;
      toast.success(m ? `Marked ${n} item${n === 1 ? "" : "s"} as Published and published the site.` : "Published. Visitors now see the latest content.");
      router.refresh();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <Panel title="1 · Preview">
        <p className="mb-4 text-sm text-stone">Preview runs the real tour from your current (unpublished) content. Use “with drafts” to include items still marked Draft.</p>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/preview" target="_blank"><Button><Eye className="size-4" /> Landing page</Button></Link>
          <Link href="/admin/preview/tour/rooms" target="_blank"><Button><Eye className="size-4" /> Rooms tour</Button></Link>
          <Link href="/admin/preview/tour/amenities" target="_blank"><Button><Eye className="size-4" /> Amenities tour</Button></Link>
          <Link href="/admin/preview/tour/rooms?drafts=1" target="_blank"><Button variant="ghost">Rooms with drafts</Button></Link>
          <Link href="/admin/preview/tour/amenities?drafts=1" target="_blank"><Button variant="ghost">Amenities with drafts</Button></Link>
        </div>
      </Panel>

      <Panel title="2 · Publish">
        <dl className="mb-4 grid grid-cols-2 gap-2 text-sm">
          <dt className="text-stone">Last published</dt>
          <dd data-testid="last-published"><LocalDate iso={lastPublishedAt} /></dd>
          <dt className="text-stone">Unpublished changes</dt>
          <dd>{pending ? "Yes" : "No"}</dd>
          <dt className="text-stone">Public site</dt>
          <dd>
            {siteOnline ? "Online" : (
              <>
                Offline — <Link href="/admin/settings" className="text-plum underline">turn on in settings</Link>
              </>
            )}
          </dd>
        </dl>
        {hasDrafts && (
          <div className="mb-4 border border-amber-700/30 bg-amber-50 p-3 text-sm text-amber-900" data-testid="draft-summary">
            <p className="font-medium">Still marked Draft — these will not appear on the public site:</p>
            <p className="mt-1">{draftParts.join(", ")}.</p>
            {drafts.viewpointsMissingPanorama > 0 && (
              <p className="mt-1 text-xs">
                {drafts.viewpointsMissingPanorama} more viewpoint{drafts.viewpointsMissingPanorama === 1 ? " has" : "s have"} no panorama yet and will stay Draft.
              </p>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {hasDrafts && (
            <Button variant="primary" loading={busy} onClick={() => publish(true)} data-testid="publish-all-button">
              <Rocket className="size-4" /> Mark all as Published &amp; publish
            </Button>
          )}
          <Button variant={hasDrafts ? "secondary" : "primary"} loading={busy} onClick={() => publish(false)} data-testid="publish-button">
            <Rocket className="size-4" /> {hasDrafts ? "Publish only items marked Published" : "Publish now"}
          </Button>
        </div>
        {errors.length > 0 && <p className="mt-2 text-xs text-red-800">{errors.length} published item(s) have problems and will be skipped.</p>}
      </Panel>

      <Panel title="3 · Export static site (optional)" className="lg:col-span-2">
        <p className="mb-4 max-w-3xl text-sm text-stone">
          Writes the <strong>published</strong> tour as plain files (HTML, images, PDFs) into a folder on this computer. Upload that folder to
          any static host — Netlify, Cloudflare Pages, GitHub Pages or ordinary web hosting — no server or database needed. Drafts are never
          included. Export again after every publish.
        </p>
        <Button
          loading={exporting}
          disabled={!lastPublishedAt}
          data-testid="export-button"
          onClick={async () => {
            setExporting(true);
            try {
              const res = await api<{ outDir: string; files: number; bytes: number; publishedAt: string }>("POST", "/api/admin/export");
              setExported(res);
              toast.success("Static site exported");
            } catch (err) {
              toast.error(err);
            } finally {
              setExporting(false);
            }
          }}
        >
          <FolderDown className="size-4" /> {exporting ? "Exporting…" : "Export static site"}
        </Button>
        {exported && (
          <div className="mt-4 border border-emerald-700/25 bg-emerald-50 p-3 text-sm text-emerald-900" data-testid="export-result">
            <p>
              Exported to <code className="break-all font-mono text-xs">{exported.outDir}</code>
            </p>
            <p className="text-xs">
              {exported.files} media files · {(exported.bytes / 1024 / 1024).toFixed(1)} MB · content published{" "}
              {new Date(exported.publishedAt).toLocaleString()}
            </p>
          </div>
        )}
      </Panel>

      <Panel title={`Checks (${warnings.length})`} className="lg:col-span-2">
        {warnings.length === 0 ? (
          <p className="text-sm text-stone">Everything looks good.</p>
        ) : (
          <ul className="divide-y divide-charcoal/8" role="list">
            {warnings.map((w, i) => (
              <li key={i}>
                <Link href={w.href} className="flex items-start gap-3 py-2 text-sm hover:text-plum">
                  {w.severity === "error" ? <CircleAlert className="mt-0.5 size-4 shrink-0 text-red-700" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" />}
                  {w.message}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
