import { notFound } from "next/navigation";
import { FloorPlanEditor } from "@/components/admin/FloorPlanEditor";
import { getAdminProject } from "@/lib/api";
import { requireAdminPage } from "@/lib/auth/session";
import { getAdminTour, listFloorPlans } from "@/lib/content/queries";

export default async function FloorPlanPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const project = await getAdminProject();
  if (!project) notFound();
  const plans = await listFloorPlans(project.id);
  const plan = plans.find((p) => p.id === id);
  if (!plan) notFound();
  const [rooms, amenities] = await Promise.all([getAdminTour(project.id, "rooms"), getAdminTour(project.id, "amenities")]);
  return (
    <FloorPlanEditor
      key={plan.id}
      plan={plan}
      tours={[
        { label: "Rooms", groups: rooms.groups },
        { label: "Amenities", groups: amenities.groups },
      ]}
    />
  );
}
