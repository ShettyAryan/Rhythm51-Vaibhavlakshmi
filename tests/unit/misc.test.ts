import { describe, expect, it } from "vitest";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/lib/auth/password";
import { parseRange } from "@/lib/storage/local";
import { accessPointUpdateSchema, projectSettingsSchema, uploadRequestSchema } from "@/lib/validation";

describe("HTTP range parsing", () => {
  it("parses common forms", () => {
    expect(parseRange("bytes=0-99", 1000)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=900-", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange("bytes=500-5000", 1000)).toEqual({ start: 500, end: 999 });
  });
  it("rejects unsatisfiable ranges", () => {
    expect(parseRange("bytes=1000-", 1000)).toBeNull();
    expect(parseRange("bytes=5-2", 1000)).toBeNull();
    expect(parseRange("items=0-1", 1000)).toBeNull();
    expect(parseRange("bytes=-", 1000)).toBeNull();
  });
});

describe("passwords", () => {
  it("hashes and verifies with scrypt", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("wrong password!!", hash)).toBe(false);
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
  });
  it("enforces a minimum length", () => {
    expect(validatePasswordStrength("short")).toMatch(/12/);
    expect(validatePasswordStrength("long-enough-password")).toBeNull();
  });
});

describe("validation", () => {
  it("normalises hotspot yaw and rejects out-of-range values", () => {
    const ok = accessPointUpdateSchema.parse({
      initialYaw: 270,
      hotspots: [{ destinationAccessPointId: "966908d4-26dc-45d8-9386-edbebc417ddc", label: " Kitchen ", yaw: -200, pitch: 5 }],
    });
    expect(ok.initialYaw).toBe(-90);
    expect(ok.hotspots![0]!.yaw).toBe(160);
    expect(ok.hotspots![0]!.label).toBe("Kitchen");
    expect(ok.hotspots![0]!.style).toBe("ring");
    expect(() => accessPointUpdateSchema.parse({ initialPitch: 120 })).toThrow();
    expect(() => accessPointUpdateSchema.parse({ marker: { x: 1.2, y: 0.5 } })).toThrow();
    expect(() => accessPointUpdateSchema.parse({ initialFov: 5 })).toThrow();
  });
  it("validates uploads and settings", () => {
    expect(() => uploadRequestSchema.parse({ fileName: "a.exe", mimeType: "application/x-msdownload", size: 10, category: "image" })).toThrow();
    expect(uploadRequestSchema.parse({ fileName: "a.pdf", mimeType: "application/pdf", size: 10, category: "pdf" }).fileName).toBe("a.pdf");
    expect(() => projectSettingsSchema.parse({ theme: { primary: "red", primaryDark: "", accent: "", ivory: "", rose: "" } })).toThrow();
    expect(() => projectSettingsSchema.parse({ contact: { phone: "", email: "", website: "javascript:alert(1)", address: "" } })).toThrow();
    expect(projectSettingsSchema.parse({ heroHeadline: "Hello\u0000 world " }).heroHeadline).toBe("Hello world");
  });
});
