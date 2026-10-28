/**
 * The flowing coral-to-magenta ribbon that sweeps across the brochure's page
 * corners, redrawn as a lightweight SVG accent.
 */
export function Ribbon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 600 400" className={className} aria-hidden fill="none">
      <defs>
        <linearGradient id="ribbon-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ec6c69" stopOpacity="0" />
          <stop offset="0.35" stopColor="#ec6c69" stopOpacity="0.85" />
          <stop offset="1" stopColor="#a42d66" stopOpacity="0.95" />
        </linearGradient>
        <linearGradient id="ribbon-gold" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#c7a56a" stopOpacity="0" />
          <stop offset="0.5" stopColor="#e3cfa3" stopOpacity="0.9" />
          <stop offset="1" stopColor="#c7a56a" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* A twisting satin band: wide at the corner, tapering as it sweeps down. */}
      <path d="M250 0 C 330 60, 380 130, 450 175 C 510 214, 560 222, 600 214 L 600 150 C 568 160, 530 152, 492 122 C 440 82, 400 34, 372 0 Z" fill="url(#ribbon-grad)" />
      <path d="M372 0 C 400 34, 440 82, 492 122 C 530 152, 568 160, 600 150 L 600 120 C 575 128, 545 120, 515 98 C 470 64, 438 28, 420 0 Z" fill="#a42d66" fillOpacity="0.55" />
      <path d="M190 0 C 300 80, 360 170, 470 238 C 525 270, 570 280, 600 278" stroke="url(#ribbon-gold)" strokeWidth="1" />
    </svg>
  );
}
