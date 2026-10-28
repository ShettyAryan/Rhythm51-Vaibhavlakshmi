import type { Metadata } from "next";
import { connection } from "next/server";
import { Landing } from "@/components/public/Landing";
import { ThemeStyle } from "@/components/public/ThemeStyle";
import { Unpublished } from "@/components/public/Unpublished";
import { getLiveSnapshot } from "@/lib/content/publish";

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const snap = await getLiveSnapshot();
  const p = snap?.project;
  return {
    title: p?.name ? `${p.name}${p.developerName ? ` · ${p.developerName}` : ""}` : "Virtual Tour",
    description: p?.heroSubtitle || p?.heroHeadline || "Interactive 360° property tour",
  };
}

export default async function HomePage() {
  await connection();
  const snapshot = await getLiveSnapshot();
  if (!snapshot) return <Unpublished />;
  return (
    <>
      <ThemeStyle theme={snapshot.project.theme} />
      <Landing snapshot={snapshot} tourBase="/tour" />
    </>
  );
}
