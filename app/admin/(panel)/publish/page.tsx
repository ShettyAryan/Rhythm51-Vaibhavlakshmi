import { PublishPanel } from "@/components/admin/PublishPanel";
import { PageHeader } from "@/components/admin/ui";
import { getAdminProject } from "@/lib/api";
import { requireAdminPage } from "@/lib/auth/session";
import { draftSummary } from "@/lib/content/manage";
import { contentWarnings, dashboardStats } from "@/lib/content/queries";

export default async function PublishPage() {
  await requireAdminPage();
  const project = await getAdminProject();
  if (!project) return <PageHeader title="Preview & Publish" description="Create a project first." />;
  const [stats, warnings, drafts] = await Promise.all([dashboardStats(project.id), contentWarnings(project.id), draftSummary(project.id)]);
  return (
    <>
      <PageHeader
        title="Preview & Publish"
        description="Visitors only see content marked Published, and only after you publish. Preview first to check everything works."
      />
      <PublishPanel
        lastPublishedAt={stats.lastPublishedAt}
        lastEditedAt={stats.lastEditedAt}
        siteOnline={project.status === "published"}
        warnings={warnings}
        drafts={drafts}
      />
    </>
  );
}
