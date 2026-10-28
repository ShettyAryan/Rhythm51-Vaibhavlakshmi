import { FloorPlanList } from "@/components/admin/FloorPlanEditor";
import { PageHeader } from "@/components/admin/ui";
import { requireAdminPage } from "@/lib/auth/session";

export default async function FloorPlansPage() {
  await requireAdminPage();
  return (
    <>
      <PageHeader
        title="Floor Plans"
        description="Interactive plans for the tour navigator: one per floor, apartment type or site plan. Viewpoints are placed on these plans."
      />
      <FloorPlanList />
    </>
  );
}
