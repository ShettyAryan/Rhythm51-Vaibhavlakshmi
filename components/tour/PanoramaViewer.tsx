"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as THREE from "three";
import {
  clamp,
  clampFov,
  horizontalFov,
  normalizeYaw,
  vectorToYawPitch,
  yawPitchToVector,
} from "@/lib/tour/geometry";
import type { HotspotData, MediaRef } from "@/lib/tour/types";
import { Spinner } from "@/components/ui/Spinner";
import { HotspotMarker } from "./HotspotMarker";
import type { CameraView, ViewBus } from "./viewBus";

const DEG = Math.PI / 180;
const PITCH_LIMIT = 85;
const TEXTURE_CACHE_SIZE = 4;

export interface ViewerScene {
  /** Changes whenever the visitor moves to another access point. */
  id: string;
  panorama: MediaRef | null;
  initialYaw: number;
  initialPitch: number;
  initialFov: number;
  hotspots: (HotspotData & { displayLabel?: string; disabled?: boolean })[];
}

export interface PanoramaViewerHandle {
  getView(): CameraView;
  setView(view: Partial<Pick<CameraView, "yaw" | "pitch" | "fov">>, animate?: boolean): void;
  resetView(): void;
  /** Container element (for fullscreen). */
  element(): HTMLDivElement | null;
}

interface PanoramaViewerProps {
  scene: ViewerScene;
  onNavigate?: (destinationId: string, hotspot: HotspotData) => void;
  viewBus?: ViewBus;
  /** Editor mode: a click (without drag) reports the panorama coordinate. */
  onPick?: (yaw: number, pitch: number) => void;
  /** Editor mode: highlight a hotspot. */
  selectedHotspotId?: string | null;
  onHotspotSelect?: (id: string) => void;
  showCrosshair?: boolean;
  /** Fired when the displayed panorama finishes loading or fails. */
  onStatusChange?: (status: "loading" | "ready" | "error" | "empty") => void;
  className?: string;
  ariaLabel?: string;
  children?: React.ReactNode;
}

type Status = "loading" | "ready" | "error" | "empty";

// ---------------------------------------------------------------------------
// Texture loading with a small LRU cache shared by all viewers on the page.
// ---------------------------------------------------------------------------

const textureCache = new Map<string, Promise<THREE.Texture>>();

function loadTexture(url: string, renderer: THREE.WebGLRenderer, signal: AbortSignal): Promise<THREE.Texture> {
  const cached = textureCache.get(url);
  if (cached) {
    textureCache.delete(url);
    textureCache.set(url, cached); // mark as recently used
    return cached;
  }
  const promise = new Promise<THREE.Texture>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    const abort = () => {
      // Evict synchronously so a new request for the same URL starts fresh.
      if (textureCache.get(url) === promise) textureCache.delete(url);
      img.src = "";
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    img.onload = async () => {
      signal.removeEventListener("abort", abort);
      try {
        await img.decode().catch(() => undefined);
        const tex = new THREE.Texture(img);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.generateMipmaps = true;
        tex.needsUpdate = true;
        // Upload now so the swap is instant (avoids a hitch on first render).
        renderer.initTexture(tex);
        resolve(tex);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => {
      signal.removeEventListener("abort", abort);
      reject(new Error(`Failed to load ${url}`));
    };
    img.src = url;
  });
  textureCache.set(url, promise);
  promise.catch(() => textureCache.delete(url));
  // Evict least-recently-used textures beyond the cache size.
  while (textureCache.size > TEXTURE_CACHE_SIZE) {
    const [oldUrl, oldPromise] = textureCache.entries().next().value as [string, Promise<THREE.Texture>];
    textureCache.delete(oldUrl);
    oldPromise.then((t) => (t.userData.inUse ? (t.userData.evicted = true) : t.dispose())).catch(() => undefined);
  }
  return promise;
}

/** Picks the best rendition the device can display sharply without wasting memory. */
export function pickPanoramaSources(pano: MediaRef, maxTextureSize: number): { preview: string | null; full: string } {
  const coarse = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  const mem = (typeof navigator !== "undefined" && (navigator as { deviceMemory?: number }).deviceMemory) || 8;
  const cap = Math.min(maxTextureSize, coarse || mem < 4 ? 4096 : 8192);
  const width = pano.width ?? 0;
  // Prefer the web-optimised full-resolution copy over a heavy original.
  let full = pano.variants.full?.url ?? pano.url;
  if (width > cap) full = pano.variants.lg && pano.variants.lg.width <= cap ? pano.variants.lg.url : (pano.variants.md?.url ?? pano.url);
  const preview = pano.variants.md && pano.variants.md.url !== full ? pano.variants.md.url : null;
  return { preview, full };
}

/** Warms the HTTP cache for a panorama the visitor is likely to open next. */
export function prefetchPanorama(pano: MediaRef | null | undefined) {
  if (!pano) return;
  const url = pano.variants.md?.url ?? pano.url;
  const img = new Image();
  img.decoding = "async";
  img.src = url;
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// ---------------------------------------------------------------------------

export const PanoramaViewer = forwardRef<PanoramaViewerHandle, PanoramaViewerProps>(function PanoramaViewer(
  { scene, onNavigate, viewBus, onPick, selectedHotspotId, onHotspotSelect, showCrosshair, onStatusChange, className = "", ariaLabel, children },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasHost = useRef<HTMLDivElement>(null);
  const hotspotEls = useRef(new Map<string, HTMLElement>());
  const [status, setStatus] = useState<Status>("loading");
  const [webglFailed, setWebglFailed] = useState(false);
  const [veil, setVeil] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  // Mutable engine state (never triggers React renders).
  const engine = useRef<{
    renderer: THREE.WebGLRenderer;
    camera: THREE.PerspectiveCamera;
    material: THREE.MeshBasicMaterial;
    mesh: THREE.Mesh;
    scene: THREE.Scene;
    dirty: boolean;
    raf: number;
    view: { yaw: number; pitch: number; fov: number };
    velocity: { yaw: number; pitch: number };
    tween: { from: { yaw: number; pitch: number; fov: number }; to: { yaw: number; pitch: number; fov: number }; start: number; dur: number } | null;
    width: number;
    height: number;
  } | null>(null);

  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const callbacks = useRef({ onNavigate, onPick, onStatusChange, viewBus });
  callbacks.current = { onNavigate, onPick, onStatusChange, viewBus };

  const markDirty = useCallback(() => {
    if (engine.current) engine.current.dirty = true;
  }, []);

  // ---- Engine setup (once) ---------------------------------------------------
  useEffect(() => {
    const host = canvasHost.current;
    const container = containerRef.current;
    if (!host || !container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "high-performance" });
    } catch {
      setWebglFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x1d1418, 1);
    renderer.domElement.className = "block h-full w-full";
    renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(renderer.domElement);

    const threeScene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1100);
    camera.rotation.order = "YXZ";
    // Sphere seen from inside. scale(-1,1,1) un-mirrors the texture and the
    // rotation puts the image's centre column (u = 0.5) at -Z, i.e. yaw 0.
    const geometry = new THREE.SphereGeometry(500, 96, 64);
    geometry.scale(-1, 1, 1);
    geometry.rotateY(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    material.visible = false;
    const mesh = new THREE.Mesh(geometry, material);
    threeScene.add(mesh);

    const s = sceneRef.current;
    engine.current = {
      renderer,
      camera,
      material,
      mesh,
      scene: threeScene,
      dirty: true,
      raf: 0,
      view: { yaw: s.initialYaw, pitch: s.initialPitch, fov: clampFov(s.initialFov) },
      velocity: { yaw: 0, pitch: 0 },
      tween: null,
      width: 1,
      height: 1,
    };

    const resize = () => {
      const e = engine.current;
      if (!e) return;
      const w = Math.max(1, container.clientWidth);
      const h = Math.max(1, container.clientHeight);
      e.width = w;
      e.height = h;
      renderer.setSize(w, h, false);
      e.dirty = true;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();

    const onContextLost = (ev: Event) => {
      ev.preventDefault();
      setStatus("error");
    };
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);

    const tick = (now: number) => {
      const e = engine.current;
      if (!e) return;
      e.raf = requestAnimationFrame(tick);

      if (e.tween) {
        const t = clamp((now - e.tween.start) / e.tween.dur, 0, 1);
        const k = 1 - Math.pow(1 - t, 3);
        const dyaw = normalizeYaw(e.tween.to.yaw - e.tween.from.yaw);
        e.view.yaw = normalizeYaw(e.tween.from.yaw + dyaw * k);
        e.view.pitch = e.tween.from.pitch + (e.tween.to.pitch - e.tween.from.pitch) * k;
        e.view.fov = e.tween.from.fov + (e.tween.to.fov - e.tween.from.fov) * k;
        if (t >= 1) e.tween = null;
        e.dirty = true;
      } else if (Math.abs(e.velocity.yaw) > 0.01 || Math.abs(e.velocity.pitch) > 0.01) {
        e.view.yaw = normalizeYaw(e.view.yaw + e.velocity.yaw);
        e.view.pitch = clamp(e.view.pitch + e.velocity.pitch, -PITCH_LIMIT, PITCH_LIMIT);
        e.velocity.yaw *= 0.9;
        e.velocity.pitch *= 0.9;
        e.dirty = true;
      }
      if (!e.dirty) return;
      e.dirty = false;

      const aspect = e.width / e.height;
      // Portrait screens get a slightly wider vertical FOV so the view isn't a keyhole.
      const vfov = aspect < 1 ? Math.min(100, e.view.fov * (1 + (1 - aspect) * 0.5)) : e.view.fov;
      e.camera.fov = vfov;
      e.camera.aspect = aspect;
      e.camera.updateProjectionMatrix();
      e.camera.rotation.y = -e.view.yaw * DEG;
      e.camera.rotation.x = e.view.pitch * DEG;
      e.camera.updateMatrixWorld();
      e.renderer.render(e.scene, e.camera);
      positionHotspots(e.camera, e.width, e.height);
      callbacks.current.viewBus?.publish({ ...e.view, fov: vfov, hfov: horizontalFov(vfov, aspect) });
    };
    engine.current.raf = requestAnimationFrame(tick);

    return () => {
      const e = engine.current;
      engine.current = null;
      ro.disconnect();
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      if (e) cancelAnimationFrame(e.raf);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  const tmp = useRef(new THREE.Vector3());
  const camDir = useRef(new THREE.Vector3());
  const positionHotspots = useCallback((camera: THREE.PerspectiveCamera, w: number, h: number) => {
    camera.getWorldDirection(camDir.current);
    for (const hs of sceneRef.current.hotspots) {
      const el = hotspotEls.current.get(hs.id);
      if (!el) continue;
      const [x, y, z] = yawPitchToVector(hs.yaw, hs.pitch);
      const v = tmp.current.set(x, y, z);
      const facing = v.dot(camDir.current);
      v.multiplyScalar(100).project(camera);
      const visible = facing > 0.05 && Math.abs(v.x) < 1.15 && Math.abs(v.y) < 1.15;
      if (!visible) {
        el.style.visibility = "hidden";
        continue;
      }
      el.style.visibility = "visible";
      el.style.transform = `translate3d(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px, 0)`;
    }
  }, []);

  // ---- Load the panorama whenever the scene (access point) changes ---------
  useEffect(() => {
    const e = engine.current;
    const pano = scene.panorama;
    const controller = new AbortController();
    const reduced = prefersReducedMotion();
    let cancelled = false;

    const apply = (tex: THREE.Texture, resetView: boolean) => {
      const en = engine.current;
      if (!en || cancelled) return;
      const prev = en.material.map;
      if (prev && prev !== tex) prev.userData.inUse = false;
      if (prev?.userData.evicted) prev.dispose();
      tex.userData.inUse = true;
      en.material.map = tex;
      en.material.visible = true;
      en.material.needsUpdate = true;
      if (resetView) {
        en.view = { yaw: scene.initialYaw, pitch: scene.initialPitch, fov: clampFov(scene.initialFov) };
        en.velocity = { yaw: 0, pitch: 0 };
        en.tween = null;
      }
      en.dirty = true;
    };

    if (!pano) {
      if (e) {
        e.material.visible = false;
        e.dirty = true;
      }
      setStatus("empty");
      callbacks.current.onStatusChange?.("empty");
      return;
    }
    if (!e) return;

    setStatus("loading");
    callbacks.current.onStatusChange?.("loading");
    const { preview, full } = pickPanoramaSources(pano, e.renderer.capabilities.maxTextureSize);
    const hadPrevious = !!e.material.map && e.material.visible;

    let shown = false;
    (async () => {
      try {
        // First displayable texture: preview if available (fast), else full.
        const first = await loadTexture(preview ?? full, e.renderer, controller.signal);
        if (cancelled) return;
        if (hadPrevious && !reduced) {
          setVeil(true);
          await new Promise((r) => setTimeout(r, 180));
          if (cancelled) return;
        }
        apply(first, true);
        shown = true;
        setVeil(false);
        setStatus("ready");
        callbacks.current.onStatusChange?.("ready");
        if (preview) {
          const best = await loadTexture(full, e.renderer, controller.signal);
          apply(best, false);
        }
      } catch (err) {
        if (cancelled || (err as DOMException)?.name === "AbortError") return;
        setVeil(false);
        // A failed full-resolution upgrade keeps the preview on screen.
        if (shown) return;
        setStatus("error");
        callbacks.current.onStatusChange?.("error");
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [scene.id, scene.panorama?.url, scene.panorama?.id, retryKey]);

  // Hotspot edits (editor) need a re-render of their positions.
  useEffect(() => {
    markDirty();
  }, [scene.hotspots, markDirty]);

  // ---- Interaction -------------------------------------------------------
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ moved: number; lastT: number; pinchDist: number | null }>({ moved: 0, lastT: 0, pinchDist: null });

  const onPointerDown = (ev: React.PointerEvent) => {
    if ((ev.target as HTMLElement).closest("[data-hotspot]")) return;
    const e = engine.current;
    if (!e) return;
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    e.velocity = { yaw: 0, pitch: 0 };
    e.tween = null;
    drag.current.moved = 0;
    drag.current.lastT = performance.now();
    drag.current.pinchDist = pointers.current.size === 2 ? pinchDistance() : null;
  };

  const pinchDistance = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : null;
  };

  const onPointerMove = (ev: React.PointerEvent) => {
    const e = engine.current;
    const prev = pointers.current.get(ev.pointerId);
    if (!e || !prev) return;
    const dx = ev.clientX - prev.x;
    const dy = ev.clientY - prev.y;
    pointers.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointers.current.size >= 2) {
      const d = pinchDistance();
      if (d && drag.current.pinchDist) {
        e.view.fov = clampFov(e.view.fov * (drag.current.pinchDist / d));
        drag.current.pinchDist = d;
        drag.current.moved += 10;
        e.dirty = true;
      }
      return;
    }
    const degPerPx = e.camera.fov / e.height;
    const dYaw = -dx * degPerPx;
    const dPitch = dy * degPerPx;
    e.view.yaw = normalizeYaw(e.view.yaw + dYaw);
    e.view.pitch = clamp(e.view.pitch + dPitch, -PITCH_LIMIT, PITCH_LIMIT);
    const now = performance.now();
    const dt = Math.max(1, now - drag.current.lastT);
    drag.current.lastT = now;
    e.velocity = { yaw: clamp((dYaw * 16) / dt, -6, 6), pitch: clamp((dPitch * 16) / dt, -6, 6) };
    drag.current.moved += Math.abs(dx) + Math.abs(dy);
    e.dirty = true;
  };

  const onPointerUp = (ev: React.PointerEvent) => {
    const e = engine.current;
    const had = pointers.current.delete(ev.pointerId);
    if (pointers.current.size < 2) drag.current.pinchDist = null;
    if (!e || !had) return;
    if (prefersReducedMotion() || performance.now() - drag.current.lastT > 80) e.velocity = { yaw: 0, pitch: 0 };
    if (drag.current.moved < 5 && callbacks.current.onPick) {
      const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
      const ndc = new THREE.Vector3(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1, 0.5);
      ndc.unproject(e.camera);
      const { yaw, pitch } = vectorToYawPitch(ndc.x, ndc.y, ndc.z);
      callbacks.current.onPick(round2(yaw), round2(pitch));
    }
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      const e = engine.current;
      if (!e) return;
      ev.preventDefault();
      const delta = ev.deltaMode === 1 ? ev.deltaY * 16 : ev.deltaY;
      e.view.fov = clampFov(e.view.fov + delta * 0.04);
      e.tween = null;
      e.dirty = true;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const animateTo = useCallback((to: Partial<{ yaw: number; pitch: number; fov: number }>, animate = true) => {
    const e = engine.current;
    if (!e) return;
    const target = {
      yaw: normalizeYaw(to.yaw ?? e.view.yaw),
      pitch: clamp(to.pitch ?? e.view.pitch, -PITCH_LIMIT, PITCH_LIMIT),
      fov: clampFov(to.fov ?? e.view.fov),
    };
    e.velocity = { yaw: 0, pitch: 0 };
    if (!animate || prefersReducedMotion()) {
      e.view = target;
      e.tween = null;
    } else {
      e.tween = { from: { ...e.view }, to: target, start: performance.now(), dur: 650 };
    }
    e.dirty = true;
  }, []);

  const onKeyDown = (ev: React.KeyboardEvent) => {
    if ((ev.target as HTMLElement).closest("[data-hotspot]")) return;
    const e = engine.current;
    if (!e) return;
    const step = ev.shiftKey ? 15 : 5;
    switch (ev.key) {
      case "ArrowLeft":
        animateTo({ yaw: e.view.yaw - step }, false);
        break;
      case "ArrowRight":
        animateTo({ yaw: e.view.yaw + step }, false);
        break;
      case "ArrowUp":
        animateTo({ pitch: e.view.pitch + step }, false);
        break;
      case "ArrowDown":
        animateTo({ pitch: e.view.pitch - step }, false);
        break;
      case "+":
      case "=":
        animateTo({ fov: e.view.fov - 5 }, false);
        break;
      case "-":
      case "_":
        animateTo({ fov: e.view.fov + 5 }, false);
        break;
      default:
        return;
    }
    ev.preventDefault();
  };

  useImperativeHandle(
    ref,
    () => ({
      getView: () => {
        const e = engine.current;
        if (!e) return { yaw: 0, pitch: 0, fov: 75, hfov: 100 };
        return { ...e.view, hfov: horizontalFov(e.camera.fov, e.width / e.height) };
      },
      setView: (view, animate = true) => animateTo(view, animate),
      resetView: () => {
        const s = sceneRef.current;
        animateTo({ yaw: s.initialYaw, pitch: s.initialPitch, fov: s.initialFov });
      },
      element: () => containerRef.current,
    }),
    [animateTo],
  );

  const handleHotspot = (hs: ViewerScene["hotspots"][number]) => {
    if (onHotspotSelect) return onHotspotSelect(hs.id);
    if (hs.disabled) return;
    callbacks.current.onNavigate?.(hs.destinationId, hs);
  };

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full touch-none select-none overflow-hidden bg-[#1d1418] outline-none ${onPick ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"} ${className}`}
      role="application"
      aria-roledescription="360 degree panorama"
      aria-label={ariaLabel ?? "Panorama viewer. Drag or use arrow keys to look around; plus and minus to zoom."}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      data-testid="panorama-viewer"
      data-status={webglFailed ? "fallback" : status}
      data-scene={scene.id}
    >
      <div ref={canvasHost} className="absolute inset-0" />

      {webglFailed && <FlatFallback pano={scene.panorama} />}

      {/* Hotspots (positioned every frame) */}
      {!webglFailed && status === "ready" && (
        <div className="pointer-events-none absolute inset-0">
          {scene.hotspots.map((hs) => (
            <HotspotMarker
              key={hs.id}
              ref={(el) => {
                if (el) hotspotEls.current.set(hs.id, el);
                else hotspotEls.current.delete(hs.id);
                markDirty();
              }}
              label={hs.displayLabel ?? hs.label}
              style={hs.style}
              selected={selectedHotspotId === hs.id}
              disabled={hs.disabled}
              onActivate={() => handleHotspot(hs)}
            />
          ))}
        </div>
      )}

      {showCrosshair && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" aria-hidden>
          <div className="relative size-10">
            <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/80 mix-blend-difference" />
            <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/80 mix-blend-difference" />
          </div>
        </div>
      )}

      {/* Transition veil */}
      <div
        className={`pointer-events-none absolute inset-0 bg-[#1d1418] transition-opacity duration-200 ${veil ? "opacity-100" : "opacity-0"}`}
        aria-hidden
      />

      {status === "loading" && !webglFailed && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center" data-testid="panorama-loading">
          <div className="flex flex-col items-center gap-3 rounded-full bg-black/35 px-6 py-5 text-ivory backdrop-blur-sm">
            <Spinner className="text-gold" label="Loading panorama" />
          </div>
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center" data-testid="panorama-error">
          <div className="max-w-sm border border-gold/40 bg-wine/85 px-6 py-5 text-ivory backdrop-blur">
            <p className="font-display text-2xl">This view could not be loaded</p>
            <p className="mt-2 text-sm text-ivory/75">Check your connection, then try again or choose another viewpoint.</p>
            <button
              type="button"
              className="mt-4 border border-gold/70 px-4 py-2 text-xs uppercase tracking-[0.2em] text-gold hover:bg-gold/10"
              onClick={() => {
                if (scene.panorama) {
                  for (const k of [...textureCache.keys()]) if (k.includes(scene.panorama.id)) textureCache.delete(k);
                }
                setRetryKey((n) => n + 1);
              }}
            >
              Retry
            </button>
          </div>
        </div>
      )}
      {status === "empty" && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center" data-testid="panorama-empty">
          <div className="max-w-sm border border-gold/40 bg-wine/85 px-6 py-5 text-ivory">
            <p className="font-display text-2xl">No panorama yet</p>
            <p className="mt-2 text-sm text-ivory/75">A 360° image has not been assigned to this viewpoint.</p>
          </div>
        </div>
      )}
      {children}
    </div>
  );
});

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function FlatFallback({ pano }: { pano: MediaRef | null }) {
  if (!pano) return null;
  const src = pano.variants.md?.url ?? pano.url;
  return (
    <div className="absolute inset-0 flex flex-col bg-[#1d1418]" data-testid="panorama-fallback">
      <p className="bg-wine px-4 py-2 text-center text-xs text-ivory/85">
        Your browser can’t display the interactive 360° view. Scroll sideways to see the full panorama.
      </p>
      <div className="scroll-thin flex-1 overflow-x-auto overflow-y-hidden">
        <img src={src} alt="Flat panorama" className="h-full max-w-none" />
      </div>
    </div>
  );
}

