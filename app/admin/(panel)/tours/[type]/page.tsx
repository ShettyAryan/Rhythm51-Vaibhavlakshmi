import { notFound } from "next/navigation";
import { TourManager } from "@/components/admin/TourManager";
import { requireAdminPage } from "@/lib/auth/session";

export default async function TourAdminPage({ params }: { params: Promise<{ type: string }> }) {
  await requireAdminPage();
  const { type } = await params;
  if (type !== "rooms" && type !== "amenities") notFound();
  return <TourManager type={type} />;
}
