"use client";

import { useEffect, useRef, useState } from "react";
import type { MediaRef } from "@/lib/tour/types";

export interface HeroSource {
  /** CSS media query; the first matching source wins. */
  media: string;
  ref: MediaRef;
}

const COVER = "absolute inset-0 h-full w-full object-cover";

export const isVideo = (ref: MediaRef | null | undefined) => !!ref?.mimeType?.startsWith("video/");

export function srcSetOf(ref: MediaRef) {
  return (
    [
      ref.variants.md && `${ref.variants.md.url} ${ref.variants.md.width}w`,
      ref.variants.lg && `${ref.variants.lg.url} ${ref.variants.lg.width}w`,
      ref.width && `${ref.url} ${ref.width}w`,
    ]
      .filter(Boolean)
      .join(", ") || ref.url
  );
}

/**
 * The landing cover: an image, animated GIF or video per screen type.
 *
 * Images only → a <picture>, so the browser picks the file before any script runs.
 * Any video → the same media queries are evaluated here and a single element is
 * drawn (a <picture> cannot switch to a <video>), so only one file downloads.
 */
export function HeroMedia({
  fallback,
  sources,
  alt,
  onReady,
}: {
  fallback: MediaRef;
  sources: HeroSource[];
  alt: string;
  /** Called once the cover can be shown (image loaded / video has its first frame), or failed. */
  onReady?: () => void;
}) {
  const anyVideo = isVideo(fallback) || sources.some((s) => isVideo(s.ref));
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  const ready = () => readyRef.current?.();
  // An image may finish loading before React attaches its handlers (cached, or
  // server-rendered), so also check when the element is attached.
  const imgRef = (el: HTMLImageElement | null) => {
    if (el?.complete) ready();
  };
  const [active, setActive] = useState<MediaRef | null>(null);
  const key = sources.map((s) => `${s.media}=${s.ref.id}`).join("|") + `|${fallback.id}`;

  useEffect(() => {
    if (!anyVideo) return;
    const queries = sources.map((s) => ({ mq: window.matchMedia(s.media), ref: s.ref }));
    const update = () => setActive(queries.find((q) => q.mq.matches)?.ref ?? fallback);
    update();
    queries.forEach((q) => q.mq.addEventListener("change", update));
    return () => queries.forEach((q) => q.mq.removeEventListener("change", update));
    // `key` captures every source and the fallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyVideo, key]);

  if (!anyVideo) {
    return (
      <picture>
        {sources.map(({ media, ref }) => (
          <source key={media} media={media} srcSet={srcSetOf(ref)} sizes="100vw" />
        ))}
        <img
          src={fallback.variants.lg?.url ?? fallback.url}
          srcSet={srcSetOf(fallback) || undefined}
          sizes="100vw"
          alt={alt}
          className={COVER}
          fetchPriority="high"
          ref={imgRef}
          onLoad={ready}
          onError={ready}
          data-testid="hero-image"
        />
      </picture>
    );
  }
  if (!active) return null;
  if (isVideo(active)) return <CoverVideo key={active.id} src={active.url} onReady={ready} />;

  return (
    <img
      key={active.id}
      src={active.variants.lg?.url ?? active.url}
      srcSet={srcSetOf(active) || undefined}
      sizes="100vw"
      alt={alt}
      className={COVER}
      fetchPriority="high"
      ref={imgRef}
      onLoad={ready}
      onError={ready}
      data-testid="hero-image"
    />
  );
}

/**
 * Silent background video on a plain loop (the browser restarts it; no fades).
 * Muted + inline autoplay is allowed by every browser; if one still refuses
 * (e.g. iPhone Low Power Mode), it starts on the visitor's first tap.
 */
function CoverVideo({ src, onReady }: { src: string; onReady?: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.readyState >= 2) onReady?.();
    el.muted = true; // React doesn't always reflect `muted` as an attribute, which autoplay needs.
    const events = ["pointerdown", "touchend", "keydown"] as const;
    const stop = () => events.forEach((e) => window.removeEventListener(e, tryPlay, true));
    function tryPlay() {
      void el!.play().then(stop, () => {});
    }
    events.forEach((e) => window.addEventListener(e, tryPlay, true));
    tryPlay();
    return stop;
  }, [src]);
  return (
    <video
      ref={ref}
      src={src}
      className={COVER}
      autoPlay
      muted
      loop
      onLoadedData={onReady}
      onError={onReady}
      playsInline
      preload="auto"
      disablePictureInPicture
      disableRemotePlayback
      aria-hidden
      data-testid="hero-video"
    />
  );
}