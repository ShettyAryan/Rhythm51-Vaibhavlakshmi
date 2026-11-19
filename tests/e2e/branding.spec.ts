import { expect, test } from "@playwright/test";

test("home page shows ConstructXR (Poppins) and a full-screen button", async ({ page }) => {
  await page.goto("/");
  const badge = page.getByTestId("constructxr-badge");
  await expect(badge).toBeVisible();
  await expect(badge).toContainText("ConstructXR");
  expect(await badge.locator("span").evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/^Poppins/);
  // Bottom-right corner, bottom-left full-screen.
  const vp = page.viewportSize()!;
  const b = (await badge.boundingBox())!;
  expect(b.x + b.width).toBeGreaterThan(vp.width * 0.8);
  expect(b.y).toBeGreaterThan(vp.height * 0.8);
  const fs = page.getByTestId("landing-fullscreen");
  await expect(fs).toBeVisible();
  const f = (await fs.boundingBox())!;
  expect(f.x).toBeLessThan(vp.width * 0.2);
  expect(f.y).toBeGreaterThan(vp.height * 0.8);

  await fs.click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await expect(fs).toHaveAccessibleName("Exit full screen");
  // Full screen carries over into the tour (same page, client-side navigation).
  await page.getByTestId("nav-rooms").click();
  await expect(page.getByTestId("tour")).toBeVisible();
  expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.getByRole("button", { name: "Exit full screen" }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
});

test("tour has a Home button at the bottom right instead of a back button", async ({ page }) => {
  await page.goto("/tour/rooms");
  const home = page.getByTestId("tour-home");
  await expect(home).toBeVisible();
  const vp = page.viewportSize()!;
  const h = (await home.boundingBox())!;
  expect(h.x + h.width).toBeGreaterThan(vp.width * 0.9);
  expect(h.y).toBeGreaterThan(vp.height * 0.85);
  await home.click();
  await expect(page.getByTestId("landing")).toBeVisible();
});
