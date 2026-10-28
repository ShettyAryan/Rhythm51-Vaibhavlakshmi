import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ThemeStyle } from "@/components/public/ThemeStyle";
import { Unpublished } from "@/components/public/Unpublished";
import { EmptyTour, TourExperience } from "@/components/tour/TourExperience";
import { getLiveSnapshot } from "@/lib/content/publish";
import type { TourType } from "@/lib/tour/types";

type Params = { type: string };

function parseType(t: string): TourType | null {
  return t === "rooms" || t === "amenities" ? t : null;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  await connection();
  const type = parseType((await params).type);
  const snap = await getLiveSnapshot();
  const label = type === "amenities" ? snap?.project.navLabels.amenities : snap?.project.navLabels.rooms;
  return { title: [label ?? "Tour", snap?.project.name].filter(Boolean).join(" · ") };
}

export default async function TourPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<{ ap?: string }> }) {
  await connection();
  const type = parseType((await params).type);
  if (!type) notFound();
  const snapshot = await getLiveSnapshot();
  if (!snapshot) return <Unpublished />;
  const tour = snapshot.tours[type];
  const label = type === "rooms" ? snapshot.project.navLabels.rooms : snapshot.project.navLabels.amenities;
  if (!tour || tour.groups.length === 0) {
    return <EmptyTour homeHref="/" title={label} message="This tour will be available soon." />;
  }
  const other: TourType = type === "rooms" ? "amenities" : "rooms";
  const { ap } = await searchParams;
  return (
    <>
      <ThemeStyle theme={snapshot.project.theme} />
      <TourExperience
        tour={tour}
        project={{ name: snapshot.project.name, logo: snapshot.project.logo, navLabels: snapshot.project.navLabels }}
        initialAccessPointId={typeof ap === "string" ? ap : null}
        basePath="/tour"
        homeHref="/"
        otherTour={snapshot.tours[other]?.groups.length ? other : null}
      />
    </>
  );
}
