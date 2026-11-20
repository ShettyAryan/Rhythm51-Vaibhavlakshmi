"use client";

import { BookOpen, Compass, Expand, Images, Info, LayoutPanelTop, Minimize, Trees } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useState } from "react";
import type { DocumentRef, MediaRef, Snapshot } from "@/lib/tour/types";
import { Dialog } from "@/components/ui/Dialog";
import { useFullscreen } from "@/components/ui/useFullscreen";
import { BackgroundMusic } from "./BackgroundMusic";
import { ConstructXRBadge } from "./ConstructXRBadge";
import { HeroMedia } from "./HeroMedia";
import { IntroScreen } from "./IntroScreen";
import { RendersGallery } from "./RendersGallery";
import { DocumentViewer, documentFiles } from "./DocumentViewer";

interface LandingProps {
  snapshot: Snapshot;
  /** Prefix for tour links ("/tour" publicly, "/admin/preview/tour" in preview). */
  tourBase: string;
  /** Suffix for tour links: "?drafts=1" in preview, "/index.html" on the static site. */
  tourQuery?: string;
  banner?: React.ReactNode;
  /** Show the opening intro (public site). Off in the admin preview. */
  intro?: boolean;
}

const INTRO_KEY = "intro.done";

/**
 * The intro plays once per browser session (coming back from a tour doesn't
 * replay it). Automated browsers skip it so tests start on the landing page.
 */
function introAlreadySeen() {
  try {
    if (window.sessionStorage.getItem(INTRO_KEY) === "1") return true;
  } catch {}
  return navigator.webdriver === true;
}

type ModalKind = "floorPlan" | "brochure" | "renders" | "about" | null;

export function Landing({ snapshot, tourBase, tourQuery = "", banner, intro = true }: LandingProps) {
  const router = useRouter();
  const { project, documents, tours } = snapshot;
  const [modal, setModal] = useState<ModalKind>(null);
  const fullscreen = useFullscreen();
  // Rendered on the server with the intro shown; hidden before the first paint
  // when it has already been seen, so there is no flash either way.
  const [showIntro, setShowIntro] = useState(intro);
  const [coverReady, setCoverReady] = useState(false);
  useLayoutEffect(() => {
    if (intro && introAlreadySeen()) setShowIntro(false);
  }, [intro]);
  const finishIntro = () => {
    try {
      window.sessionStorage.setItem(INTRO_KEY, "1");
    } catch {}
    setShowIntro(false);
  };
  const labels = project.navLabels;
  const hasAbout = !!(project.aboutText || Object.keys(project.contact).length);

  const actions = [
    {
      key: "rooms",
      label: labels.rooms,
      icon: Compass,
      available: !!tours.rooms?.groups.length,
      onClick: () => router.push(`${tourBase}/rooms${tourQuery}`),
    },
    {
      key: "amenities",
      label: labels.amenities,
      icon: Trees,
      available: !!tours.amenities?.groups.length,
      onClick: () => router.push(`${tourBase}/amenities${tourQuery}`),
    },
    { key: "floorPlan", label: labels.floorPlan, icon: LayoutPanelTop, available: true, onClick: () => setModal("floorPlan") },
    { key: "brochure", label: labels.brochure, icon: BookOpen, available: true, onClick: () => setModal("brochure") },
    {
      key: "renders",
      label: labels.renders ?? "Renders",
      icon: Images,
      available: documentFiles(documents.renders).some((f) => f.kind === "image"),
      onClick: () => setModal("renders"),
    },
  ] as const;

  // The browser uses the first <source> whose media query matches, else the desktop
  // image. Upright screens get a portrait image, so tall tablets are not cropped
  // down to a sliver of a landscape picture.
  const { hero, heroTablet, heroTabletPortrait, heroMobile } = project;
  const desktopHero = hero ?? heroTablet ?? heroTabletPortrait ?? heroMobile ?? null;
  const heroSources = [
    // Phones.
    { media: "(max-width: 639px)", ref: heroMobile ?? heroTabletPortrait },
    // Tablets held upright (and any other portrait screen).
    { media: "(orientation: portrait)", ref: heroTabletPortrait ?? heroMobile },
    // Tablets held sideways: small landscape screens, or touch screens up to iPad Pro size.
    { media: "(max-width: 1023px), (max-width: 1366px) and (pointer: coarse)", ref: heroTablet },
  ].filter((s): s is { media: string; ref: MediaRef } => !!s.ref);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-wine text-ivory" data-testid="landing" data-intro={showIntro ? "showing" : "done"}>
      {showIntro && <IntroScreen coverReady={coverReady || !desktopHero} onDone={finishIntro} />}
      {/* Hero */}
      {desktopHero ? (
        <HeroMedia fallback={desktopHero} sources={heroSources} alt={project.name || "Property"} onReady={() => setCoverReady(true)} />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_70%_20%,#893b46_0%,#56163b_45%,#351020_100%)]" data-testid="hero-placeholder" />
      )}
      <div className="absolute inset-0 bg-black" style={{ opacity: project.heroOverlay }} aria-hidden />
      <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-[#1a0812]/85 to-transparent" aria-hidden />

      {banner}

      {/* Brand bar */}
      <header className="absolute inset-x-0 top-0 z-10 flex items-start justify-between px-5 pt-5 sm:px-10 sm:pt-8">
        <div className="animate-fade-up">
          {project.logo ? (
            <img src={project.logo.url} alt={project.name || "Logo"} className="h-16 w-auto drop-shadow-lg sm:h-20 lg:h-24" />
          ) : project.name ? (
            <p className="font-display text-3xl tracking-wide drop-shadow">{project.name}</p>
          ) : null}
          {project.developerName && <p className="eyebrow mt-2 text-gold-soft/90 drop-shadow">by {project.developerName}</p>}
        </div>
        <div className="relative z-10 flex items-center gap-2">
          <BackgroundMusic
            music={project.music}
            volume={project.musicVolume}
            armed={!showIntro}
            className="flex items-center border border-ivory/30 bg-black/20 px-2.5 py-2 backdrop-blur transition hover:border-gold hover:text-gold"
            iconClassName="size-5"
          />
          {hasAbout && (
            <button
              type="button"
              onClick={() => setModal("about")}
              className="flex items-center gap-2 border border-ivory/30 bg-black/20 px-3 py-2 text-xs uppercase tracking-[0.2em] backdrop-blur transition hover:border-gold hover:text-gold"
            >
              <Info className="size-5" /> About
            </button>
          )}
        </div>
      </header>

      {/* Headline */}
      {project.showHeroText && (project.heroHeadline || project.heroSubtitle) && (
        <div className="absolute inset-x-0 bottom-[calc(13rem+env(safe-area-inset-bottom))] z-10 px-6 sm:bottom-60 sm:px-12 lg:bottom-44 lg:px-16">
          <div className="max-w-3xl animate-fade-up [animation-delay:150ms]">
            {project.heroHeadline && (
              <h1 className="font-display text-4xl font-light leading-[1.05] tracking-wide drop-shadow-[0_2px_18px_rgba(0,0,0,0.45)] sm:text-6xl lg:text-7xl" data-testid="hero-headline">
                {project.heroHeadline}
              </h1>
            )}
            {project.heroSubtitle && <p className="mt-4 max-w-xl text-base text-ivory/85 sm:text-lg">{project.heroSubtitle}</p>}
          </div>
        </div>
      )}

      {/* Bottom navigation */}
      {/* Phones and tablets: full-screen + ConstructXR sit in a row above the menu.
          Laptops and wider: they move into the bottom corners, level with the menu. */}
      <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-8 sm:pb-8 lg:grid lg:grid-cols-[1fr_minmax(0,56rem)_1fr] lg:items-center lg:gap-6">
        <div className="flex min-h-12 items-center justify-between gap-3 px-1 lg:contents">
          <div className="lg:col-start-1 lg:row-start-1 lg:justify-self-start">
            {fullscreen.supported && (
              <button
                type="button"
                onClick={fullscreen.toggle}
                className="grid size-12 place-items-center rounded-full border border-gold-soft/50 bg-black/30 text-ivory shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-md transition hover:border-gold-soft hover:bg-menu/90"
                aria-label={fullscreen.active ? "Exit full screen" : "Full screen"}
                title={fullscreen.active ? "Exit full screen" : "Full screen"}
                data-testid="landing-fullscreen"
              >
                {fullscreen.active ? <Minimize className="size-5" /> : <Expand className="size-5" />}
              </button>
            )}
          </div>
          <ConstructXRBadge className="lg:col-start-3 lg:row-start-1 lg:justify-self-end" />
        </div>
      <nav aria-label="Explore" className="lg:col-start-2 lg:row-start-1">
        <div className="mx-auto max-w-4xl animate-fade-up [animation-delay:300ms]" data-testid="landing-menu">
          <ul className="grid grid-cols-5 gap-1.5 sm:gap-3" role="list">
            {actions.map(({ key, label, icon: Icon, available, onClick }) => (
              <li key={key}>
                <button
                  type="button"
                  onClick={onClick}
                  disabled={!available}
                  data-testid={`nav-${key}`}
                  className="group flex h-full w-full flex-col items-center justify-center gap-1 rounded-2xl border border-gold-soft/50 bg-menu/92 px-1 py-2.5 text-center shadow-[0_10px_30px_rgba(0,0,0,0.4)] backdrop-blur-md transition hover:-translate-y-0.5 hover:bg-menu hover:shadow-[0_14px_36px_rgba(0,0,0,0.5)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-soft disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 sm:gap-1.5 sm:rounded-full sm:px-3 sm:py-3.5"
                >
                  <Icon className="size-6 text-gold-soft sm:size-7 transition duration-300 group-hover:text-ivory" strokeWidth={1.25} aria-hidden />
                  <span className="text-[0.56rem] font-medium uppercase leading-tight tracking-[0.06em] text-ivory sm:text-[0.7rem] sm:tracking-[0.16em]">
                    {label}
                  </span>
                  {!available && <span className="sr-only">(not available yet)</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </nav>
      </div>

      <DocumentModal
        open={modal === "floorPlan"}
        onClose={() => setModal(null)}
        title={labels.floorPlan}
        doc={documents.floorPlan}
        testId="floorplan-modal"
      />
      <DocumentModal
        open={modal === "brochure"}
        onClose={() => setModal(null)}
        title={labels.brochure}
        doc={documents.brochure}
        testId="brochure-modal"
      />
      <Dialog
        open={modal === "renders"}
        onClose={() => setModal(null)}
        title={labels.renders ?? "Renders"}
        hideHeader
        className="h-[calc(100dvh-1.5rem)] w-[min(calc(100vw-1.5rem),1400px)]"
        testId="renders-modal"
      >
        {documents.renders && <RendersGallery doc={documents.renders} title={labels.renders ?? "Renders"} onClose={() => setModal(null)} />}
      </Dialog>
      <Dialog open={modal === "about"} onClose={() => setModal(null)} title={project.name || "About"} className="w-[min(92vw,560px)]">
        <div className="scroll-thin max-h-[70dvh] overflow-y-auto px-6 py-5">
          {project.aboutText && <p className="whitespace-pre-line leading-relaxed text-charcoal/85">{project.aboutText}</p>}
          {Object.keys(project.contact).length > 0 && (
            <dl className="mt-5 space-y-2 border-t border-gold/30 pt-4 text-sm">
              {project.contact.phone && (
                <div className="flex gap-3"><dt className="eyebrow w-20 text-menu/70">Phone</dt><dd><a className="hover:text-menu" href={`tel:${project.contact.phone.replace(/[^\d+]/g, "")}`}>{project.contact.phone}</a></dd></div>
              )}
              {project.contact.email && (
                <div className="flex gap-3"><dt className="eyebrow w-20 text-menu/70">Email</dt><dd><a className="hover:text-menu" href={`mailto:${project.contact.email}`}>{project.contact.email}</a></dd></div>
              )}
              {project.contact.website && (
                <div className="flex gap-3"><dt className="eyebrow w-20 text-menu/70">Web</dt><dd><a className="hover:text-menu" href={project.contact.website} target="_blank" rel="noopener noreferrer">{project.contact.website.replace(/^https?:\/\//, "")}</a></dd></div>
              )}
              {project.contact.address && (
                <div className="flex gap-3"><dt className="eyebrow w-20 text-menu/70">Address</dt><dd className="whitespace-pre-line">{project.contact.address}</dd></div>
              )}
            </dl>
          )}
        </div>
      </Dialog>
    </main>
  );
}

function DocumentModal({ open, onClose, title, doc, testId }: { open: boolean; onClose: () => void; title: string; doc: DocumentRef | null; testId: string }) {
  const hasFiles = documentFiles(doc).length > 0;
  return (
    <Dialog open={open} onClose={onClose} title={title} hideHeader={hasFiles} className="h-[calc(100dvh-1.5rem)] w-[min(calc(100vw-1.5rem),1200px)]" testId={testId}>
      {doc && hasFiles ? (
        <DocumentViewer doc={doc} title={title} onClose={onClose} />
      ) : (
        <div className="grid flex-1 place-items-center px-8 py-16 text-center" data-testid="document-empty">
          <div className="max-w-sm">
            <BookOpen className="mx-auto size-10 text-gold" strokeWidth={1} />
            <p className="mt-4 font-display text-3xl text-menu">Available soon</p>
            <p className="mt-2 text-sm text-stone">The {title.toLowerCase()} has not been published yet. Please check back later.</p>
            <button type="button" onClick={onClose} className="mt-6 border border-menu/40 px-5 py-2 text-xs uppercase tracking-[0.2em] text-menu hover:bg-menu/5">
              Close
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
