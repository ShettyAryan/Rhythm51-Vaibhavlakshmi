import { notFound } from "next/navigation";
import { PreviewBanner } from "@/components/admin/PreviewBanner";
import { ThemeStyle } from "@/components/public/ThemeStyle";
import { EmptyTour, TourExperience } from "@/components/tour/TourExperience";
import { getAdminProject } from "@/lib/api";
import { requireAdminPage } from "@/lib/auth/session";
import { buildSnapshot } from "@/lib/content/snapshot";
import { getDb } from "@/lib/db";
import type { TourType } from "@/lib/tour/types";

export const metadata = { title: "Tour preview", robots: { index: false, follow: false } };

export default async function PreviewTour({ params, searchParams }: { params: Promise<{ type: string }>; searchParams: Promise<{ ap?: string; drafts?: string }> }) {
  await requireAdminPage();
  const { type } = await params;
  if (type !== "rooms" && type !== "amenities") notFound();
  const project = await getAdminProject();
  if (!project) notFound();
  const { ap, drafts } = await searchParams;
  const includeDrafts = drafts === "1";
  const built = await buildSnapshot(await getDb(), project.id, { mode: "preview", includeDrafts });
  if (!built) notFound();
  const { snapshot } = built;
  const tour = snapshot.tours[type as TourType];
  const label = type === "rooms" ? snapshot.project.navLabels.rooms : snapshot.project.navLabels.amenities;
  const home = `/admin/preview${includeDrafts ? "?drafts=1" : ""}`;
  if (!tour || tour.groups.length === 0) {
    return <EmptyTour homeHref={home} title={label} message={includeDrafts ? "Add rooms and viewpoints in the admin panel." : "Nothing is marked Published yet. Try the preview with drafts."} />;
  }
  const other: TourType = type === "rooms" ? "amenities" : "rooms";
  return (
    <>
      <ThemeStyle theme={snapshot.project.theme} />
      <TourExperience
        tour={tour}
        project={{ name: snapshot.project.name, logo: snapshot.project.logo, navLabels: snapshot.project.navLabels }}
        initialAccessPointId={typeof ap === "string" ? ap : null}
        basePath="/admin/preview/tour"
        homeHref={home}
        otherTour={snapshot.tours[other]?.groups.length ? other : null}
        linkQuery={includeDrafts ? "?drafts=1" : ""}
        previewBanner={<PreviewBanner drafts={includeDrafts} />}
      />
    </>
  );
}
