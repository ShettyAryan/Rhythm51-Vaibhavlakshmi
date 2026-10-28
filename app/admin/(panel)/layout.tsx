import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { getAdminProject } from "@/lib/api";
import { requireAdminPage } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Tour Studio", robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdminPage();
  const project = await getAdminProject();
  return (
    <AdminShell user={{ email: user.email, name: user.name }} project={{ name: project?.name ?? "", status: project?.status ?? "draft" }}>
      {children}
    </AdminShell>
  );
}
