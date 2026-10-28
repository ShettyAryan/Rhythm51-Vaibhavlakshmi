/**
 * Tiny pub/sub for the live camera view. The panorama viewer publishes every
 * frame in which the view changes; subscribers (floor-plan navigator, editor
 * readouts) update their DOM directly so camera motion never re-renders React.
 */
export interface CameraView {
  yaw: number;
  pitch: number;
  /** Vertical field of view (degrees). */
  fov: number;
  /** Horizontal field of view actually visible on screen (degrees). */
  hfov: number;
}

export interface ViewBus {
  get(): CameraView;
  publish(view: CameraView): void;
  subscribe(fn: (view: CameraView) => void): () => void;
}

export function createViewBus(initial: CameraView = { yaw: 0, pitch: 0, fov: 75, hfov: 100 }): ViewBus {
  let current = initial;
  const listeners = new Set<(v: CameraView) => void>();
  return {
    get: () => current,
    publish(view) {
      current = view;
      for (const l of listeners) l(view);
    },
    subscribe(fn) {
      listeners.add(fn);
      fn(current);
      return () => listeners.delete(fn);
    },
  };
}
