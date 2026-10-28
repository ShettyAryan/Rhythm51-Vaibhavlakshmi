export function Spinner({ className = "", label = "Loading" }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-label={label} className={`inline-block size-8 ${className}`}>
      <svg viewBox="0 0 40 40" className="animate-spin-slow h-full w-full" aria-hidden>
        <circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1.5" />
        <path d="M20 3a17 17 0 0 1 17 17" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </span>
  );
}
