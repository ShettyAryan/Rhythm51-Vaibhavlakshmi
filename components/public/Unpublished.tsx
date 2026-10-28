export function Unpublished() {
  return (
    <main className="grid min-h-dvh place-items-center bg-wine px-6 text-center text-ivory" data-testid="unpublished">
      <div className="max-w-md">
        <div className="ornament mx-auto w-40" aria-hidden>
          <span className="size-1.5 rotate-45 bg-gold" />
        </div>
        <h1 className="mt-6 font-display text-4xl font-light">Virtual tour coming soon</h1>
        <p className="mt-3 text-ivory/70">This experience has not been published yet. Please check back shortly.</p>
      </div>
    </main>
  );
}
