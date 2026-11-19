"use client";

import { useEffect, useRef, useState } from "react";
import { startExperience } from "./BackgroundMusic";
import { CONSTRUCTXR_GREEN, CONSTRUCTXR_LOGO_GREEN, VAIBHAVLAXMI_EMBLEM, VAIBHAVLAXMI_TAGLINE, VAIBHAVLAXMI_WORDMARK } from "./introAssets";

/** When the button may appear: after the animation (ms)… */
const ANIMATION_MS = 3600;
/** …and once the cover has loaded, but never later than this after the animation. */
const MAX_WAIT_MS = 6000;
const EXIT_MS = 700;

/**
 * Opening screen: the Vaibhavlaxmi emblem rises and catches the light, the
 * wordmark and tagline follow, then "Created by ConstructXR" and a Start
 * Experience button. Pressing it fades into the landing page and starts the
 * music (sound needs a click, which the button provides).
 */
export function IntroScreen({ coverReady, onDone }: { coverReady: boolean; onDone: () => void }) {
  const [animated, setAnimated] = useState(false);
  const [waitedEnough, setWaitedEnough] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const a = setTimeout(() => setAnimated(true), reduce ? 0 : ANIMATION_MS);
    const b = setTimeout(() => setWaitedEnough(true), (reduce ? 0 : ANIMATION_MS) + MAX_WAIT_MS);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);

  const ready = animated && (coverReady || waitedEnough);
  useEffect(() => {
    if (ready) button.current?.focus({ preventScroll: true });
  }, [ready]);

  const start = () => {
    if (leaving) return;
    startExperience(); // inside the click, so the browser allows sound
    setLeaving(true);
    setTimeout(onDone, EXIT_MS);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome"
      className={`intro fixed inset-0 z-[100] flex flex-col items-center overflow-hidden bg-[#faf7f0] px-6 text-charcoal ${leaving ? "intro-leave" : ""}`}
      data-testid="intro"
      data-state={leaving ? "leaving" : ready ? "ready" : "animating"}
    >
      {/* Soft warm light behind the emblem */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_45%_at_50%_38%,rgba(227,207,163,0.35),transparent_70%)]" aria-hidden />

      <div className="relative flex flex-1 flex-col items-center justify-center pt-8">
        <div className="intro-emblem relative" style={{ width: "clamp(112px, 22vmin, 190px)", aspectRatio: `${VAIBHAVLAXMI_EMBLEM.width} / ${VAIBHAVLAXMI_EMBLEM.height}` }}>
          <img src={VAIBHAVLAXMI_EMBLEM.src} alt="" className="h-full w-full" draggable={false} />
          {/* A band of light sweeping across the gold, clipped to the emblem's shape */}
          <span
            className="intro-shine absolute inset-0"
            style={{ maskImage: `url(${VAIBHAVLAXMI_EMBLEM.src})`, WebkitMaskImage: `url(${VAIBHAVLAXMI_EMBLEM.src})` }}
            aria-hidden
          />
        </div>
        <h1 className="mt-7 sm:mt-9">
          <img
            src={VAIBHAVLAXMI_WORDMARK.src}
            alt="Vaibhavlaxmi"
            className="intro-wordmark block h-auto"
            style={{ width: "clamp(230px, 60vmin, 460px)" }}
            draggable={false}
          />
        </h1>
        <img
          src={VAIBHAVLAXMI_TAGLINE.src}
          alt="Value Beyond Walls"
          className="intro-tagline mt-4 block h-auto sm:mt-5"
          style={{ width: "clamp(180px, 45vmin, 350px)" }}
          draggable={false}
        />
      </div>

      <div className="relative flex flex-col items-center gap-8 pb-[max(1.75rem,env(safe-area-inset-bottom))] sm:gap-10 sm:pb-10">
        <div className="grid h-14 place-items-center">
          {ready && (
            <button
              ref={button}
              type="button"
              onClick={start}
              className="intro-button rounded-full border border-gold/60 bg-menu px-9 py-3.5 text-sm font-medium uppercase tracking-[0.24em] text-ivory shadow-[0_14px_34px_rgba(184,52,86,0.35)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(184,52,86,0.45)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-menu"
              data-testid="intro-start"
            >
              Start Experience
            </button>
          )}
        </div>

        <div className="intro-credit flex flex-col items-center gap-2" data-testid="intro-credit">
          <span className="text-[0.65rem] font-medium uppercase tracking-[0.3em] text-stone">Created by</span>
          <span className="flex items-center gap-2.5" style={{ color: CONSTRUCTXR_GREEN }}>
            <img
              src={CONSTRUCTXR_LOGO_GREEN.src}
              alt=""
              className="h-8 w-auto sm:h-9"
              width={Math.round((36 * CONSTRUCTXR_LOGO_GREEN.width) / CONSTRUCTXR_LOGO_GREEN.height)}
              height={36}
              draggable={false}
            />
            <span className="font-brand text-lg font-semibold tracking-wide sm:text-xl">ConstructXR</span>
          </span>
        </div>
      </div>
    </div>
  );
}
