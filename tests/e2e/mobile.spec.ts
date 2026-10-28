import { expect, test } from "@playwright/test";
import { waitForPanorama } from "./helpers";

test("mobile: landing actions, room drawer and compact plan work by touch", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("nav-rooms")).toBeVisible();
  await page.getByTestId("nav-rooms").tap();
  await waitForPanorama(page);

  // Desktop side panel is hidden; the bottom sheet opens from the Rooms button.
  await expect(page.getByTestId("tour-sidebar")).toBeHidden();
  await page.getByTestId("mobile-rooms-button").tap();
  const sheet = page.getByTestId("tour-sheet");
  await expect(sheet).toBeInViewport();
  await sheet.getByText("Master Bedroom").tap();
  await expect(page.getByTestId("tour-location")).toContainText("Master Bedroom");
  await expect(sheet).not.toBeInViewport();

  // Floor plan starts collapsed on phones and expands on tap.
  await page.getByTestId("floorplan-toggle").tap();
  await expect(page.getByTestId("floorplan-navigator")).toBeVisible();
  await expect(page.getByTestId("floorplan-room")).toHaveText("Master Bedroom");

  // Hotspot labels are visible without hover on touch devices; tapping navigates.
  await waitForPanorama(page);
  const hs = page.locator('[data-testid=hotspot][data-label="Window View"]');
  await hs.tap();
  await expect(page.getByTestId("tour-viewpoint-name")).toHaveText("Window View");

  // Page itself does not scroll while interacting with the panorama.
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("mobile: document modal fits the viewport", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("nav-floorPlan").tap();
  const modal = page.getByTestId("floorplan-modal");
  await expect(modal).toBeVisible();
  const box = (await modal.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.width).toBeLessThanOrEqual(vp.width);
  expect(box.height).toBeLessThanOrEqual(vp.height);
  await expect(modal.getByTestId("pdf-page").first()).toBeVisible();
  await modal.getByRole("button", { name: "Close" }).tap();
  await expect(modal).toBeHidden();
});
