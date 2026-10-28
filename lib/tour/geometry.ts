/**
 * Coordinate conventions shared by the public viewer, the admin editors and the
 * floor-plan navigator. See docs/COORDINATES.md for diagrams.
 *
 * PANORAMA SPACE (stored with every access point and hotspot)
 *   yaw   – degrees in (-180, 180]. 0 = the centre column of the equirectangular
 *           image. Positive yaw turns RIGHT (clockwise seen from above), i.e.
 *           moves towards the right-hand side of the source image.
 *   pitch – degrees in [-90, 90]. 0 = horizon (image's middle row), +90 = zenith.
 *   fov   – vertical field of view in degrees.
 *
 *   Texture mapping: u = 0.5 + yaw / 360, v = 0.5 - pitch / 180 (v from top).
 *
 * WORLD SPACE (three.js, right-handed, camera at origin)
 *   yaw 0 / pitch 0 looks down -Z; yaw +90 looks down +X; pitch +90 looks up +Y.
 *
 * FLOOR-PLAN SPACE
 *   marker (x, y) – normalised [0, 1] image coordinates, origin top-left, so they
 *                   survive any resizing of the plan image.
 *   bearing       – degrees clockwise from the plan image's "up" direction.
 *
 *   bearing = yaw + accessPoint.headingOffset + floorPlan.orientationOffset
 *
 *   headingOffset is per panorama because every capture can start facing a
 *   different direction; orientationOffset rotates every marker on a plan at
 *   once (useful when a plan image is replaced with a rotated export).
 */

/**
 * Accepted panorama shapes. Panoramas are full-sphere equirectangular images
 * (360° wide × 180° tall). The sphere is texture-mapped by proportion, so the
 * frame can be the classic 2:1 or a 16:9 frame (e.g. 7680×4320 from Blender),
 * which stores the same full sphere slightly stretched vertically.
 */
export const PANORAMA_ASPECT = { min: 1.75, max: 2.05, label: "2:1 (e.g. 8192×4096) or 16:9 (e.g. 7680×4320)" } as const;

export function isPanoramaAspect(width: number, height: number): boolean {
  if (!width || !height) return false;
  const r = width / height;
  return r >= PANORAMA_ASPECT.min && r <= PANORAMA_ASPECT.max;
}

export const MIN_FOV = 30;
export const MAX_FOV = 110;
export const DEFAULT_FOV = 75;

const DEG = Math.PI / 180;

/** Wraps any angle into (-180, 180]. */
export function normalizeYaw(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  let a = ((deg % 360) + 360) % 360; // [0, 360)
  if (a > 180) a -= 360;
  return a === -180 ? 180 : a;
}

/** Wraps any angle into [0, 360). */
export function normalizeBearing(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return ((deg % 360) + 360) % 360;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function clampPitch(deg: number): number {
  return clamp(Number.isFinite(deg) ? deg : 0, -90, 90);
}

export function clampFov(deg: number): number {
  return clamp(Number.isFinite(deg) ? deg : DEFAULT_FOV, MIN_FOV, MAX_FOV);
}

/** Shortest signed angular difference b - a, in (-180, 180]. */
export function angleDelta(a: number, b: number): number {
  return normalizeYaw(b - a);
}

/** Unit direction vector in world space for a yaw/pitch pair. */
export function yawPitchToVector(yaw: number, pitch: number): [number, number, number] {
  const y = yaw * DEG;
  const p = pitch * DEG;
  return [Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p)];
}

/** Inverse of {@link yawPitchToVector}. Accepts non-normalised vectors. */
export function vectorToYawPitch(x: number, y: number, z: number): { yaw: number; pitch: number } {
  const len = Math.hypot(x, y, z) || 1;
  const pitch = Math.asin(clamp(y / len, -1, 1)) / DEG;
  const yaw = Math.atan2(x, -z) / DEG;
  return { yaw: normalizeYaw(yaw), pitch };
}

/** Equirectangular texture coordinate (u right, v down, both 0..1) for a direction. */
export function yawPitchToUv(yaw: number, pitch: number): { u: number; v: number } {
  return { u: 0.5 + normalizeYaw(yaw) / 360, v: 0.5 - clampPitch(pitch) / 180 };
}

export function uvToYawPitch(u: number, v: number): { yaw: number; pitch: number } {
  return { yaw: normalizeYaw((u - 0.5) * 360), pitch: clampPitch((0.5 - v) * 180) };
}

/** Horizontal field of view for a vertical fov and viewport aspect ratio (w/h). */
export function horizontalFov(verticalFov: number, aspect: number): number {
  return (2 * Math.atan(Math.tan((verticalFov * DEG) / 2) * aspect)) / DEG;
}

/** Bearing on the floor plan (degrees clockwise from image-up) for a camera yaw. */
export function planBearing(yaw: number, headingOffset: number, orientationOffset: number): number {
  return normalizeBearing(yaw + headingOffset + orientationOffset);
}

/**
 * Bearing from point a to point b on a plan image, both in normalised coordinates.
 * The image's pixel aspect ratio is required because normalised x and y are not
 * the same physical length on non-square plans.
 */
export function bearingBetween(
  a: { x: number; y: number },
  b: { x: number; y: number },
  imageWidth: number,
  imageHeight: number,
): number | null {
  const dx = (b.x - a.x) * imageWidth;
  const dy = (b.y - a.y) * imageHeight;
  if (Math.hypot(dx, dy) < 1e-6) return null;
  return normalizeBearing(Math.atan2(dx, -dy) / DEG);
}

/**
 * Calibration: the admin looks at a feature in the panorama (camera yaw) and
 * clicks the same feature on the plan. Returns the heading offset that makes the
 * navigator's indicator point at that feature.
 */
export function calibrateHeadingOffset(params: {
  yaw: number;
  marker: { x: number; y: number };
  target: { x: number; y: number };
  imageWidth: number;
  imageHeight: number;
  orientationOffset: number;
}): number | null {
  const bearing = bearingBetween(params.marker, params.target, params.imageWidth, params.imageHeight);
  if (bearing === null) return null;
  return normalizeYaw(bearing - params.yaw - params.orientationOffset);
}

/**
 * Estimates the yaw (in the destination panorama) that looks back at the source
 * access point, using both markers on the shared plan. Used to pre-position
 * reciprocal hotspots. Returns null when the geometry is unknown.
 */
export function estimateReturnYaw(params: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  toHeadingOffset: number;
  orientationOffset: number;
  imageWidth: number;
  imageHeight: number;
}): number | null {
  const bearing = bearingBetween(params.to, params.from, params.imageWidth, params.imageHeight);
  if (bearing === null) return null;
  return normalizeYaw(bearing - params.toHeadingOffset - params.orientationOffset);
}

/**
 * SVG path for the view cone drawn on the floor plan: a circular sector centred
 * on (0, 0) pointing up (bearing 0) with the given angular width and radius.
 * The caller rotates it by the plan bearing.
 */
export function viewConePath(widthDeg: number, radius: number): string {
  const half = (clamp(widthDeg, 5, 170) / 2) * DEG;
  const x = Math.sin(half) * radius;
  const y = -Math.cos(half) * radius;
  return `M 0 0 L ${(-x).toFixed(3)} ${y.toFixed(3)} A ${radius} ${radius} 0 0 1 ${x.toFixed(3)} ${y.toFixed(3)} Z`;
}
