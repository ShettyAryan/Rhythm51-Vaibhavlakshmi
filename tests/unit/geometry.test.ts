import { describe, expect, it } from "vitest";
import {
  angleDelta,
  bearingBetween,
  calibrateHeadingOffset,
  clampFov,
  estimateReturnYaw,
  horizontalFov,
  normalizeBearing,
  normalizeYaw,
  planBearing,
  uvToYawPitch,
  vectorToYawPitch,
  viewConePath,
  yawPitchToUv,
  yawPitchToVector,
} from "@/lib/tour/geometry";

const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe("angle normalisation", () => {
  it("wraps yaw into (-180, 180]", () => {
    expect(normalizeYaw(0)).toBe(0);
    expect(normalizeYaw(180)).toBe(180);
    expect(normalizeYaw(-180)).toBe(180);
    expect(normalizeYaw(190)).toBe(-170);
    expect(normalizeYaw(-190)).toBe(170);
    expect(normalizeYaw(720 + 45)).toBe(45);
    expect(normalizeYaw(Number.NaN)).toBe(0);
  });
  it("wraps bearings into [0, 360)", () => {
    expect(normalizeBearing(-90)).toBe(270);
    expect(normalizeBearing(360)).toBe(0);
  });
  it("computes the shortest angular delta", () => {
    expect(angleDelta(170, -170)).toBe(20);
    expect(angleDelta(-170, 170)).toBe(-20);
  });
  it("clamps field of view", () => {
    expect(clampFov(10)).toBe(30);
    expect(clampFov(200)).toBe(110);
  });
});

describe("panorama space", () => {
  it("yaw 0 / pitch 0 looks down -Z; yaw +90 looks down +X; pitch +90 looks up", () => {
    const [x0, y0, z0] = yawPitchToVector(0, 0);
    close(x0, 0); close(y0, 0); close(z0, -1);
    const [x1, , z1] = yawPitchToVector(90, 0);
    close(x1, 1); close(z1, 0);
    const [, y2] = yawPitchToVector(0, 90);
    close(y2, 1);
  });
  it("vector <-> yaw/pitch round-trips", () => {
    for (const [yaw, pitch] of [[0, 0], [45, 10], [-120, -30], [179, 60], [-90, 0]] as const) {
      const v = yawPitchToVector(yaw, pitch);
      const r = vectorToYawPitch(...v);
      close(r.yaw, yaw, 1e-9);
      close(r.pitch, pitch, 1e-9);
    }
  });
  it("maps the image centre to yaw 0 and the right edge to yaw 180", () => {
    expect(yawPitchToUv(0, 0)).toEqual({ u: 0.5, v: 0.5 });
    expect(yawPitchToUv(90, 45)).toEqual({ u: 0.75, v: 0.25 });
    expect(uvToYawPitch(0.25, 0.5)).toEqual({ yaw: -90, pitch: 0 });
  });
  it("computes horizontal fov from vertical fov and aspect", () => {
    close(horizontalFov(90, 1), 90, 1e-9);
    expect(horizontalFov(75, 16 / 9)).toBeGreaterThan(100);
  });
});

describe("floor plan direction", () => {
  it("adds heading and plan orientation offsets to yaw", () => {
    expect(planBearing(0, 90, 0)).toBe(90);
    expect(planBearing(30, -30, 0)).toBe(0);
    expect(planBearing(-10, 0, 20)).toBe(10);
    expect(planBearing(170, 30, 0)).toBe(200);
  });
  it("computes bearings on non-square plans in pixel space", () => {
    // Straight up / right on any plan.
    expect(bearingBetween({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.1 }, 2000, 1000)).toBe(0);
    expect(bearingBetween({ x: 0.5, y: 0.5 }, { x: 0.9, y: 0.5 }, 2000, 1000)).toBe(90);
    // Equal normalised deltas are NOT 45° on a 2:1 plan.
    const b = bearingBetween({ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.4 }, 2000, 1000)!;
    close(b, (Math.atan2(200, 100) * 180) / Math.PI, 1e-9);
    expect(bearingBetween({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, 100, 100)).toBeNull();
  });
  it("calibration makes the indicator point at the clicked feature", () => {
    const params = { yaw: 37, marker: { x: 0.2, y: 0.7 }, target: { x: 0.6, y: 0.3 }, imageWidth: 1600, imageHeight: 900, orientationOffset: 12 };
    const offset = calibrateHeadingOffset(params)!;
    const expected = bearingBetween(params.marker, params.target, 1600, 900)!;
    close(planBearing(37, offset, 12), expected, 1e-6);
  });
  it("estimates the yaw that looks back at the source viewpoint", () => {
    // Destination due east of the source; destination panorama yaw 0 faces north.
    const yaw = estimateReturnYaw({ from: { x: 0.2, y: 0.5 }, to: { x: 0.8, y: 0.5 }, toHeadingOffset: 0, orientationOffset: 0, imageWidth: 100, imageHeight: 100 });
    expect(yaw).toBe(-90); // look west
    const yaw2 = estimateReturnYaw({ from: { x: 0.2, y: 0.5 }, to: { x: 0.8, y: 0.5 }, toHeadingOffset: 90, orientationOffset: 0, imageWidth: 100, imageHeight: 100 });
    expect(yaw2).toBe(180);
  });
  it("draws a view cone path", () => {
    expect(viewConePath(90, 10)).toMatch(/^M 0 0 L -7\.071 -7\.071 A 10 10 0 0 1 7\.071 -7\.071 Z$/);
  });
});
