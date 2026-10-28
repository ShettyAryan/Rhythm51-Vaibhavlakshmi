"use client";

import { BookOpen, Compass, Info, LayoutPanelTop, Trees } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DocumentRef, Snapshot } from "@/lib/tour/types";
import { PdfViewer } from "@/components/pdf/PdfViewer";
import { Dialog } from "@/components/ui/Dialog";
import { Ribbon } from "./Ribbon";

interface LandingProps {
  snapshot: Snapshot;
  /** Prefix for tour links ("/tour" publicly, "/admin/preview/tour" in preview). */
  tourBase: string;
  /** Suffix for tour links: "?drafts=1" in preview, "/index.html" on the static site. */
  tourQuery?: string;
  banner?: React.ReactNode;
}

type ModalKind = "floorPlan" | "brochure" | "about" | null;

export function Landing({ snapshot, tourBase, tourQuery = "", banner }: LandingProps) {
  const router = useRouter();
  const { project, documents, tours } = snapshot;
  const [modal, setModal] = useState<ModalKind>(null);
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
  ] as const;

  const heroSrc = project.hero?.variants.lg?.url ?? project.hero?.url;
  const heroSrcSet = project.hero
    ? [project.hero.variants.md && `${project.hero.variants.md.url} ${project.hero.variants.md.width}w`,
        project.hero.variants.lg && `${project.hero.variants.lg.url} ${project.hero.variants.lg.width}w`,
        project.hero.width && `${project.hero.url} ${project.hero.width}w`]
        .filter(Boolean)
        .join(", ")
    : undefined;

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-wine text-ivory" data-testid="landing">
      {/* Hero */}
      {heroSrc ? (
        <img
          src={heroSrc}
          srcSet={heroSrcSet || undefined}
          sizes="100vw"
          alt={project.name ? `${project.name}` : "Property"}
          className="absolute inset-0 h-full w-full object-cover"
          fetchPriority="high"
          data-testid="hero-image"
        />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_70%_20%,#893b46_0%,#56163b_45%,#351020_100%)]" data-testid="hero-placeholder" />
      )}
      <div className="absolute inset-0 bg-black" style={{ opacity: project.heroOverlay }} aria-hidden />
      <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-[#1a0812]/85 to-transparent" aria-hidden />
      <Ribbon className="pointer-events-none absolute -right-24 -top-24 w-[42rem] max-w-[90vw] opacity-90 sm:-right-16 sm:-top-28" />

      {banner}

      {/* Brand bar */}
      <header className="absolute inset-x-0 top-0 z-10 flex items-start justify-between px-5 pt-5 sm:px-10 sm:pt-8">
        <div className="animate-fade-up">
          {project.logo ? (
            <img src={project.logo.url} alt={project.name || "Logo"} className="h-12 w-auto drop-shadow-lg sm:h-16" />
          ) : project.name ? (
            <p className="font-display text-3xl tracking-wide drop-shadow">{project.name}</p>
          ) : null}
          {project.developerName && <p className="eyebrow mt-2 text-gold-soft/90 drop-shadow">by {project.developerName}</p>}
        </div>
        {hasAbout && (
          <button
            type="button"
            onClick={() => setModal("about")}
            className="relative z-10 flex items-center gap-2 border border-ivory/30 bg-black/20 px-3 py-2 text-xs uppercase tracking-[0.2em] backdrop-blur transition hover:border-gold hover:text-gold"
          >
            <Info className="size-4" /> About
          </button>
        )}
      </header>

      {/* Headline */}
      {project.showHeroText && (project.heroHeadline || project.heroSubtitle) && (
        <div className="absolute inset-x-0 bottom-[calc(9.5rem+env(safe-area-inset-bottom))] z-10 px-6 sm:bottom-44 sm:px-12 lg:px-16">
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
      <nav
        aria-label="Explore"
        className="absolute inset-x-0 bottom-0 z-20 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-8 sm:pb-8"
      >
        <div className="mx-auto max-w-5xl animate-fade-up border border-gold/45 bg-[#2a0d1c]/72 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-md [animation-delay:300ms]">
          <div className="ornament hidden px-8 pt-3 sm:flex" aria-hidden>
            <span className="eyebrow text-[0.6rem] text-gold/90">Discover</span>
          </div>
          <ul className="grid grid-cols-4 divide-x divide-gold/25" role="list">
            {actions.map(({ key, label, icon: Icon, available, onClick }) => (
              <li key={key}>
                <button
                  type="button"
                  onClick={onClick}
                  disabled={!available}
                  data-testid={`nav-${key}`}
                  className="group flex h-full w-full flex-col items-center justify-center gap-1.5 px-1 py-3 text-center transition hover:bg-ivory/[0.06] disabled:cursor-not-allowed disabled:opacity-45 sm:gap-2 sm:py-5"
                >
                  <Icon className="size-5 text-gold transition duration-300 group-hover:-translate-y-0.5 group-hover:text-gold-soft sm:size-6" strokeWidth={1.25} aria-hidden />
                  <span className="text-[0.62rem] font-medium uppercase leading-tight tracking-[0.14em] text-ivory sm:text-xs sm:tracking-[0.24em]">
                    {label}
                  </span>
                  {!available && <span className="sr-only">(not available yet)</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </nav>

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
      <Dialog open={modal === "about"} onClose={() => setModal(null)} title={project.name || "About"} className="w-[min(92vw,560px)]">
        <div className="scroll-thin max-h-[70dvh] overflow-y-auto px-6 py-5">
          {project.aboutText && <p className="whitespace-pre-line leading-relaxed text-charcoal/85">{project.aboutText}</p>}
          {Object.keys(project.contact).length > 0 && (
            <dl className="mt-5 space-y-2 border-t border-gold/30 pt-4 text-sm">
              {project.contact.phone && (
                <div className="flex gap-3"><dt className="eyebrow w-20 text-plum/70">Phone</dt><dd><a className="hover:text-plum" href={`tel:${project.contact.phone.replace(/[^\d+]/g, "")}`}>{project.contact.phone}</a></dd></div>
              )}
              {project.contact.email && (
                <div className="flex gap-3"><dt className="eyebrow w-20 text-plum/70">Email</dt><dd><a className="hover:text-plum" href={`mailto:${project.contact.email}`}>{project.contact.email}</a></dd></div>
              )}
              {project.contact.website && (
                <div className="flex gap-3"><dt className="eyebrow w-20 text-plum/70">Web</dt><dd><a className="hover:text-plum" href={project.contact.website} target="_blank" rel="noopener noreferrer">{project.contact.website.replace(/^https?:\/\//, "")}</a></dd></div>
              )}
              {project.contact.address && (
                <div className="flex gap-3"><dt className="eyebrow w-20 text-plum/70">Address</dt><dd className="whitespace-pre-line">{project.contact.address}</dd></div>
              )}
            </dl>
          )}
        </div>
      </Dialog>
    </main>
  );
}

function DocumentModal({ open, onClose, title, doc, testId }: { open: boolean; onClose: () => void; title: string; doc: DocumentRef | null; testId: string }) {
  return (
    <Dialog open={open} onClose={onClose} title={title} hideHeader={!!doc} className="h-[calc(100dvh-1.5rem)] w-[min(calc(100vw-1.5rem),1200px)]" testId={testId}>
      {doc ? (
        <PdfViewer url={doc.url} title={doc.title || title} downloadUrl={doc.downloadUrl} fileName={doc.fileName} onClose={onClose} />
      ) : (
        <div className="grid flex-1 place-items-center px-8 py-16 text-center" data-testid="document-empty">
          <div className="max-w-sm">
            <BookOpen className="mx-auto size-10 text-gold" strokeWidth={1} />
            <p className="mt-4 font-display text-3xl text-plum">Available soon</p>
            <p className="mt-2 text-sm text-stone">The {title.toLowerCase()} has not been published yet. Please check back later.</p>
            <button type="button" onClick={onClose} className="mt-6 border border-plum/40 px-5 py-2 text-xs uppercase tracking-[0.2em] text-plum hover:bg-plum/5">
              Close
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
