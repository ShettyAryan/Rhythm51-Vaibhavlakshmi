/**
 * Client entry for the exported static site. Each exported HTML page embeds the
 * published snapshot as JSON and declares which page it is; this renders the
 * same public components the Next.js app uses.
 *
 * Every page has a <base href> pointing at the site root, so all paths in the
 * snapshot are relative ("media/…", "tour/rooms/index.html") and the site works
 * at a domain root or in any sub-folder.
 */
import "@fontsource/cormorant-garamond/300.css";
import "@fontsource/cormorant-garamond/400.css";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/400-italic.css";
import "@fontsource/jost/300.css";
import "@fontsource/jost/400.css";
import "@fontsource/jost/500.css";
import "@fontsource/jost/600.css";
import { createRoot } from "react-dom/client";
import { Landing } from "@/components/public/Landing";
import { ThemeStyle } from "@/components/public/ThemeStyle";
import { EmptyTour, TourExperience } from "@/components/tour/TourExperience";
import { runtimeConfig } from "@/lib/client/runtime";
import type { Snapshot, TourType } from "@/lib/tour/types";

const siteRoot = document.baseURI;
const abs = (path: string) => new URL(path, siteRoot).href;

// pdf.js resolves URLs against window.location (not <base>), so make media absolute.
function absolutize<T>(value: T): T {
  if (typeof value === "string") return (value.startsWith("media/") ? abs(value) : value) as T;
  if (Array.isArray(value)) return value.map(absolutize) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, absolutize(v)])) as T;
  }
  return value;
}

runtimeConfig.pdfWorkerSrc = abs("vendor/pdf.worker.min.mjs");

const raw = document.getElementById("tour-data")?.textContent;
const snapshot = absolutize(JSON.parse(raw ?? "null") as Snapshot);
const page = document.body.dataset.page as "landing" | TourType;
const home = abs("index.html");
const tourBase = abs("tour");

function App() {
  const { project } = snapshot;
  if (page === "landing") {
    return (
      <>
        <ThemeStyle theme={project.theme} />
        <Landing snapshot={snapshot} tourBase={tourBase} tourQuery="/index.html" />
      </>
    );
  }
  const tour = snapshot.tours[page];
  const label = page === "rooms" ? project.navLabels.rooms : project.navLabels.amenities;
  if (!tour || tour.groups.length === 0) return <EmptyTour homeHref={home} title={label} message="This tour will be available soon." />;
  const other: TourType = page === "rooms" ? "amenities" : "rooms";
  return (
    <>
      <ThemeStyle theme={project.theme} />
      <TourExperience
        tour={tour}
        project={{ name: project.name, logo: project.logo, navLabels: project.navLabels }}
        initialAccessPointId={new URLSearchParams(window.location.search).get("ap")}
        basePath={tourBase}
        homeHref={home}
        otherTour={snapshot.tours[other]?.groups.length ? other : null}
        linkQuery="/index.html"
      />
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
