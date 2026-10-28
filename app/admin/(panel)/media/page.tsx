import { MediaLibrary } from "@/components/admin/MediaLibrary";
import { PageHeader } from "@/components/admin/ui";
import { requireAdminPage } from "@/lib/auth/session";

export default async function MediaPage() {
  await requireAdminPage();
  return (
    <>
      <PageHeader
        title="Media Library"
        description="Upload and manage panoramas, images, floor plans and PDFs. Files are private until content that uses them is published."
      />
      <MediaLibrary />
    </>
  );
}
