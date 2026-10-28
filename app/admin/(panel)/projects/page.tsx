import { ProjectsManager } from "@/components/admin/ProjectsManager";
import { PageHeader } from "@/components/admin/ui";
import { getAdminProject } from "@/lib/api";
import { requireAdminPage } from "@/lib/auth/session";
import { getPublicProject, listProjects } from "@/lib/content/publish";

export default async function ProjectsPage() {
  await requireAdminPage();
  const [projects, current, publicProject] = await Promise.all([listProjects(), getAdminProject(), getPublicProject()]);
  return (
    <>
      <PageHeader
        title="Projects"
        description="Each project is a separate property with its own tours, media and documents. The public site serves the project named in PUBLIC_PROJECT_SLUG (or the first one)."
      />
      <ProjectsManager projects={projects} currentId={current?.id ?? null} publicId={publicProject?.id ?? null} />
    </>
  );
}
