import { CONSTRUCTXR_LOGO, CONSTRUCTXR_LOGO_ASPECT } from "./constructxrLogo";

/** ConstructXR mark + wordmark (Poppins), for the corner of the public pages. */
export function ConstructXRBadge({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 text-ivory drop-shadow-[0_1px_6px_rgba(0,0,0,0.55)] ${className}`} data-testid="constructxr-badge">
      <img
        src={CONSTRUCTXR_LOGO}
        alt=""
        width={Math.round(36 * CONSTRUCTXR_LOGO_ASPECT)}
        height={36}
        className="h-8 w-auto sm:h-9"
        aria-hidden
      />
      <span className="font-brand text-base font-semibold tracking-wide sm:text-lg">ConstructXR</span>
    </div>
  );
}
