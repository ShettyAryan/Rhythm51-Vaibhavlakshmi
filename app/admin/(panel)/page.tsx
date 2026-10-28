import { AlertTriangle, CircleAlert } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/admin/ui";
import { getAdminProject } from "@/lib/api";
import { requireAdminPage } from "@/lib/auth/session";
import { contentWarnings, dashboardStats } from "@/lib/content/queries";

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "Never";
}

export default async function DashboardPage() {
  await requireAdminPage();
  const project = await getAdminProject();
  if (!project) {
    return (
      <PageHeader title="Welcome" description="No project exists yet. Create one on the Projects page, or run `npm run db:seed` for demo content." />
    );
  }
  const [stats, warnings] = await Promise.all([dashboardStats(project.id), contentWarnings(project.id)]);
  const unpublished = stats.lastEditedAt && (!stats.lastPublishedAt || stats.lastEditedAt > stats.lastPublishedAt);
  const tiles = [
    { label: "Rooms", value: stats.rooms, href: "/admin/tours/rooms" },
    { label: "Amenities", value: stats.amenities, href: "/admin/tours/amenities" },
    { label: "Access points", value: `${stats.published_access_points}/${stats.access_points}`, sub: "published / total", href: "/admin/tours/rooms" },
    { label: "Hotspots", value: stats.hotspots, href: "/admin/tours/rooms" },
    { label: "Floor plans", value: stats.floor_plans, href: "/admin/floor-plans" },
    { label: "Media files", value: stats.assets, sub: `${(stats.asset_bytes / 1024 / 1024).toFixed(1)} MB`, href: "/admin/media" },
  ];

  return (
    <>
      <PageHeader title="Dashboard" description="Overview of your tour content and what still needs attention." />

      <section className="mb-6 grid gap-4 border border-charcoal/10 bg-white p-5 sm:grid-cols-3" data-testid="publish-status">
        <div>
          <p className="eyebrow text-stone">Public site</p>
          <p className={`mt-1 font-display text-2xl ${project.status === "published" ? "text-emerald-800" : "text-amber-800"}`}>
            {project.status === "published" ? "Online" : "Offline"}
          </p>
        </div>
        <div>
          <p className="eyebrow text-stone">Last published</p>
          <p className="mt-1 font-display text-2xl text-plum">{fmt(stats.lastPublishedAt)}</p>
        </div>
        <div className="flex flex-col justify-between gap-2">
          <p className="eyebrow text-stone">Changes</p>
          {unpublished ? (
            <Link href="/admin/publish" className="font-display text-xl text-coral underline-offset-4 hover:underline">
              Unpublished changes — review &amp; publish
            </Link>
          ) : (
            <p className="font-display text-xl text-plum">Everything is published</p>
          )}
        </div>
      </section>

      <div className="mb-8 grid grid-cols-2 gap-px border border-charcoal/10 bg-charcoal/10 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="bg-white px-5 py-4 transition hover:bg-ivory">
            <p className="eyebrow text-stone">{t.label}</p>
            <p className="mt-1 font-display text-4xl text-plum">{t.value}</p>
            {t.sub && <p className="text-xs text-stone">{t.sub}</p>}
          </Link>
        ))}
      </div>

      <section className="border border-charcoal/10 bg-white">
        <header className="border-b border-charcoal/10 px-5 py-3">
          <h2 className="font-display text-xl text-plum">Needs attention</h2>
        </header>
        {warnings.length === 0 ? (
          <p className="px-5 py-6 text-sm text-stone">No issues found.</p>
        ) : (
          <ul className="divide-y divide-charcoal/8" role="list">
            {warnings.slice(0, 40).map((w, i) => (
              <li key={i}>
                <Link href={w.href} className="flex items-start gap-3 px-5 py-3 text-sm hover:bg-ivory">
                  {w.severity === "error" ? (
                    <CircleAlert className="mt-0.5 size-4 shrink-0 text-red-700" />
                  ) : (
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" />
                  )}
                  <span>{w.message}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {warnings.length > 40 && <p className="px-5 py-3 text-xs text-stone">…and {warnings.length - 40} more.</p>}
      </section>
    </>
  );
}
