import { notFound } from "next/navigation";
import { PreviewBanner } from "@/components/admin/PreviewBanner";
import { Landing } from "@/components/public/Landing";
import { ThemeStyle } from "@/components/public/ThemeStyle";
import { getAdminProject } from "@/lib/api";
import { requireAdminPage } from "@/lib/auth/session";
import { buildSnapshot } from "@/lib/content/snapshot";
import { getDb } from "@/lib/db";

export const metadata = { title: "Preview", robots: { index: false, follow: false } };

/** Admin-only preview of the landing page built from current (unpublished) content. */
export default async function PreviewLanding({ searchParams }: { searchParams: Promise<{ drafts?: string }> }) {
  await requireAdminPage();
  const project = await getAdminProject();
  if (!project) notFound();
  const drafts = (await searchParams).drafts === "1";
  const built = await buildSnapshot(await getDb(), project.id, { mode: "preview", includeDrafts: drafts });
  if (!built) notFound();
  return (
    <>
      <ThemeStyle theme={built.snapshot.project.theme} />
      <Landing snapshot={built.snapshot} tourBase="/admin/preview/tour" tourQuery={drafts ? "?drafts=1" : ""} banner={<PreviewBanner drafts={drafts} />} />
    </>
  );
}
