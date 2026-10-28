import Link from "next/link";

export function PreviewBanner({ drafts }: { drafts: boolean }) {
  return (
    <div className="pointer-events-auto fixed left-1/2 top-2 z-[60] flex -translate-x-1/2 items-center gap-3 border border-gold/60 bg-charcoal/90 px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-ivory shadow-lg backdrop-blur" data-testid="preview-banner">
      <span className="size-2 rounded-full bg-coral" aria-hidden />
      Preview{drafts ? " · including drafts" : ""} — not visible to visitors
      <Link href="/admin/publish" className="text-gold underline-offset-2 hover:underline">
        Publish
      </Link>
    </div>
  );
}
