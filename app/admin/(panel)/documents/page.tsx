import { DocumentsManager } from "@/components/admin/DocumentsManager";
import { PageHeader } from "@/components/admin/ui";
import { getAdminProject } from "@/lib/api";
import { requireAdminPage } from "@/lib/auth/session";
import { listDocuments } from "@/lib/content/queries";

export default async function DocumentsPage() {
  await requireAdminPage();
  const project = await getAdminProject();
  if (!project) return <PageHeader title="Documents" description="Create a project first." />;
  return (
    <>
      <PageHeader title="Documents" description="PDFs opened by the Floor Plan and Brochure buttons on the landing page." />
      <DocumentsManager initial={await listDocuments(project.id)} />
    </>
  );
}
