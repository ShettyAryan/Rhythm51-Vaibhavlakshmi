"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MediaRef } from "@/lib/tour/types";

const MUTED_KEY = "bg-music-muted";
const POSITION_KEY = "bg-music-position";

function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}
function write(storage: () => Storage, key: string, value: string) {
  try {
    storage().setItem(key, value);
  } catch {}
}
const local = () => window.localStorage;
const session = () => window.sessionStorage;

interface BackgroundMusicProps {
  music: MediaRef | null | undefined;
  volume?: number;
  className?: string;
  iconClassName?: string;
  /**
   * When false (the intro screen is showing), stay silent and ignore clicks; the
   * "Start Experience" button then starts the music via `startExperience()`.
   */
  armed?: boolean;
}

const START_EVENT = "experience:start";

/**
 * Starts the music. Call it synchronously inside a click handler: browsers only
 * allow sound to start from a user gesture.
 */
export function startExperience() {
  window.dispatchEvent(new Event(START_EVENT));
}

/**
 * Looping background music with a mute / unmute button.
 *
 * Browsers block sound until the visitor interacts with the page, so playback
 * starts on the first tap, click or key press anywhere. The visitor's mute choice
 * is remembered (localStorage), and the track resumes where it left off when
 * moving between the landing page and the tours (sessionStorage), including on
 * the static site where each page is a separate HTML file.
 */
export function BackgroundMusic({ music, volume = 0.5, className = "", iconClassName = "size-4", armed = true }: BackgroundMusicProps) {
  const audio = useRef<HTMLAudioElement>(null);
  // The visitor's earlier choice. (The first render's markup depends only on
  // `playing`, which starts false, so reading storage here can't break hydration.)
  const [muted, setMuted] = useState(() => typeof window !== "undefined" && read(local, MUTED_KEY) === "1");
  const [playing, setPlaying] = useState(false);
  const src = music?.url;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  // "Start Experience": play right away, inside the click (unless the visitor muted before).
  useEffect(() => {
    const onStart = () => {
      const el = audio.current;
      if (el && !mutedRef.current) void el.play().catch(() => {});
    };
    window.addEventListener(START_EVENT, onStart);
    return () => window.removeEventListener(START_EVENT, onStart);
  }, []);

  useEffect(() => {
    const el = audio.current;
    if (el) el.volume = Math.min(1, Math.max(0, volume));
  }, [volume, src]);

  // Resume from the position saved by the previous page, and keep saving it.
  useEffect(() => {
    const el = audio.current;
    if (!el || !src) return;
    const saved = read(session, POSITION_KEY);
    try {
      const { src: savedSrc, t } = saved ? (JSON.parse(saved) as { src: string; t: number }) : { src: "", t: 0 };
      if (savedSrc === src && t > 0) {
        const seek = () => {
          if (el.duration && t < el.duration) el.currentTime = t;
        };
        if (el.readyState >= 1) seek();
        else el.addEventListener("loadedmetadata", seek, { once: true });
      }
    } catch {}
    const save = () => write(session, POSITION_KEY, JSON.stringify({ src, t: el.currentTime }));
    el.addEventListener("timeupdate", save);
    window.addEventListener("pagehide", save);
    return () => {
      save();
      el.removeEventListener("timeupdate", save);
      window.removeEventListener("pagehide", save);
    };
  }, [src]);

  // Play unless muted: now if the browser allows it, otherwise on the first interaction.
  useEffect(() => {
    const el = audio.current;
    if (!el || !src || !armed) return;
    if (muted) {
      el.pause();
      return;
    }
    const events = ["pointerdown", "keydown", "touchend"] as const;
    const stop = () => events.forEach((e) => window.removeEventListener(e, onGesture, true));
    const tryPlay = () => {
      if (document.hidden) return;
      el.play().then(stop, () => {});
    };
    function onGesture(e: Event) {
      // The mute button handles its own clicks.
      if ((e.target as Element | null)?.closest?.("[data-music-toggle]")) return;
      tryPlay();
    }
    events.forEach((e) => window.addEventListener(e, onGesture, true));
    tryPlay();

    // Pause while the tab is in the background.
    const onVisibility = () => (document.hidden ? el.pause() : tryPlay());
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [muted, src, armed]);

  if (!src) return null;

  const on = playing && !muted;
  const toggle = () => {
    const el = audio.current;
    if (!el) return;
    if (on) {
      setMuted(true);
      write(local, MUTED_KEY, "1");
      el.pause();
    } else {
      setMuted(false);
      write(local, MUTED_KEY, "0");
      void el.play().catch(() => {});
    }
  };

  return (
    <>
      <audio
        ref={audio}
        src={src}
        loop
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        data-testid="background-music"
      />
      <button
        type="button"
        onClick={toggle}
        className={className}
        aria-label={on ? "Mute music" : "Play music"}
        aria-pressed={!on}
        title={on ? "Mute music" : "Play music"}
        data-music-toggle
        data-testid="music-toggle"
        data-state={on ? "playing" : "off"}
      >
        {on ? <Volume2 className={iconClassName} /> : <VolumeX className={iconClassName} />}
      </button>
    </>
  );
}
