import { notFound } from "next/navigation";
import { AccessPointEditor } from "@/components/admin/AccessPointEditor";
import { getAdminProject } from "@/lib/api";
import { requireAdminPage } from "@/lib/auth/session";
import { getAccessPointForEditor, getAdminTour, listFloorPlans } from "@/lib/content/queries";

export default async function AccessPointPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const project = await getAdminProject();
  if (!project || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ap = await getAccessPointForEditor(project.id, id);
  if (!ap) notFound();
  const [tour, plans] = await Promise.all([getAdminTour(project.id, ap.tourType), listFloorPlans(project.id)]);
  return <AccessPointEditor key={ap.id} initial={ap} groups={tour.groups} floorPlans={plans} />;
}
