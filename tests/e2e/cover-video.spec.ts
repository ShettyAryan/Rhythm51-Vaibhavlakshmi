import { expect, test, type Page } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

/** Records a real 1.5 s WebM in the browser (Playwright's Chromium has no H.264 decoder). */
async function recordWebm(page: Page): Promise<Buffer> {
  await page.goto("about:blank");
  const b64 = await page.evaluate(async () => {
    const canvas = Object.assign(document.createElement("canvas"), { width: 320, height: 180 });
    const ctx = canvas.getContext("2d")!;
    const rec = new MediaRecorder(canvas.captureStream(30), { mimeType: "video/webm" });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    const done = new Promise((r) => (rec.onstop = r));
    rec.start();
    const t0 = performance.now();
    await new Promise<void>((resolve) => {
      const draw = () => {
        const t = performance.now() - t0;
        ctx.fillStyle = `hsl(${(t / 5) % 360} 60% 45%)`;
        ctx.fillRect(0, 0, 320, 180);
        if (t < 1500) requestAnimationFrame(draw);
        else resolve();
      };
      draw();
    });
    rec.stop();
    await done;
    const buf = new Uint8Array(await new Blob(chunks, { type: "video/webm" }).arrayBuffer());
    let s = "";
    for (const b of buf) s += String.fromCharCode(b);
    return btoa(s);
  });
  return Buffer.from(b64, "base64");
}

async function upload(page: Page, data: Buffer, fileName: string, mimeType: string, category: string) {
  const created = await (await page.request.post("/api/admin/assets", { data: { fileName, mimeType, size: data.length, category } })).json();
  expect((await page.request.put(created.upload.url, { data, headers: { "Content-Type": mimeType } })).ok()).toBeTruthy();
  const res = await page.request.post(`/api/admin/assets/${created.assetId}/finalize`);
  expect(res.ok(), await res.text()).toBeTruthy();
  return created.assetId as string;
}

const publish = async (page: Page) => expect((await page.request.post("/api/admin/publish")).ok()).toBeTruthy();

test("a video cover plays on desktop while phones get their own image", async ({ page }) => {
  await loginAsAdmin(page);
  const { project } = await (await page.request.get("/api/admin/project")).json();
  const original = { heroAssetId: project.hero_asset_id, heroMobileAssetId: project.hero_mobile_asset_id };
  const mobileImage = (await (await page.request.get("/api/admin/assets?category=floor_plan_image")).json()).assets[0].id;
  const video = await upload(page, await recordWebm(page), "e2e-cover.webm", "video/webm", "video");

  try {
    const patch = await page.request.patch("/api/admin/project", { data: { heroAssetId: video, heroMobileAssetId: mobileImage } });
    expect(patch.ok()).toBeTruthy();
    await publish(page);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const v = page.getByTestId("hero-video");
    await expect(v).toBeVisible();
    // One video on a plain browser loop: no second copy, no fades.
    await expect(page.locator("video")).toHaveCount(1);
    expect(await v.evaluate((el: HTMLVideoElement) => [el.muted, el.loop, el.playsInline])).toEqual([true, true, true]);
    await expect.poll(() => v.evaluate((el: HTMLVideoElement) => !el.paused && el.currentTime > 0), { timeout: 15_000 }).toBe(true);
    expect(await v.evaluate((el) => [getComputedStyle(el).opacity, getComputedStyle(el).transitionDuration])).toEqual(["1", "0s"]);
    await expect(page.getByTestId("hero-image")).toHaveCount(0);
    // Covers the whole screen.
    const box = (await v.boundingBox())!;
    expect([box.width, box.height]).toEqual([1440, 900]);
    // Keeps playing past the end of the 1.5 s clip (the browser restarts it).
    await page.waitForTimeout(2500);
    expect(await v.evaluate((el: HTMLVideoElement) => !el.paused && !el.ended)).toBe(true);
    // A phone gets the mobile image (and never downloads the video).
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("hero-image")).toBeVisible();
    await expect(page.getByTestId("hero-video")).toHaveCount(0);
    await expect.poll(() => page.getByTestId("hero-image").evaluate((el: HTMLImageElement) => el.currentSrc)).toContain(mobileImage);
  } finally {
    await page.request.patch("/api/admin/project", { data: original });
    await publish(page);
    await page.request.delete(`/api/admin/assets/${video}`);
  }
});
