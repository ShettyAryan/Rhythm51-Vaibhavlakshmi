import { expect, test } from "@playwright/test";
import { currentBearing, waitForPanorama } from "./helpers";

test.describe("landing page", () => {
  test("renders a full-viewport hero with the four actions", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    const hero = page.getByTestId("hero-image");
    await expect(hero).toBeVisible();
    const box = await hero.boundingBox();
    const vp = page.viewportSize()!;
    expect(box!.width).toBeGreaterThanOrEqual(vp.width - 1);
    expect(box!.height).toBeGreaterThanOrEqual(vp.height - 1);
    for (const id of ["nav-rooms", "nav-amenities", "nav-floorPlan", "nav-brochure"]) {
      await expect(page.getByTestId(id)).toBeEnabled();
    }
    // No page scroll in the initial viewport.
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);
    expect(errors).toEqual([]);
  });

  test("Explore Room opens the rooms tour at its starting viewpoint", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("nav-rooms").click();
    await expect(page).toHaveURL(/\/tour\/rooms/);
    await waitForPanorama(page);
    await expect(page.getByTestId("tour-location")).toContainText("Living Room");
    await expect(page.getByTestId("tour-viewpoint-name")).toHaveText("Entrance View");
  });

  test("Explore Amenities opens the amenities tour", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("nav-amenities").click();
    await expect(page).toHaveURL(/\/tour\/amenities/);
    await waitForPanorama(page);
    await expect(page.getByTestId("tour")).toHaveAttribute("data-tour-type", "amenities");
    await expect(page.getByTestId("tour-location")).toContainText("Entrance Lobby");
  });

  test("Floor Plan modal opens, renders PDF pages and closes", async ({ page }) => {
    await page.goto("/");
    const trigger = page.getByTestId("nav-floorPlan");
    await trigger.click();
    const modal = page.getByTestId("floorplan-modal");
    await expect(modal).toBeVisible();
    await expect(modal.getByTestId("pdf-page-count")).toHaveText("/ 5");
    await expect(modal.getByTestId("pdf-page").first()).toBeVisible();
    // Background is scroll-locked while open.
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("hidden");
    // Page navigation
    await modal.getByRole("button", { name: "Next page" }).click();
    await expect(modal.locator("#pdf-page")).toHaveValue("2");
    await modal.getByRole("button", { name: "Zoom in" }).click();
    await expect(modal.getByText("125%")).toBeVisible();
    await expect(modal.getByRole("link", { name: "Download PDF" })).toBeVisible();
    await modal.getByRole("button", { name: "Close" }).click();
    await expect(modal).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("Brochure modal opens, scrolls, and closes with Escape", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("nav-brochure").click();
    const modal = page.getByTestId("brochure-modal");
    await expect(modal).toBeVisible();
    await expect(modal.getByTestId("pdf-page-count")).toHaveText("/ 38", { timeout: 60_000 });
    // Download disabled for the brochure by the seed configuration.
    await expect(modal.getByRole("link", { name: "Download PDF" })).toHaveCount(0);
    await modal.getByTestId("pdf-scroll").evaluate((el) => el.scrollBy(0, 4000));
    await expect(modal.locator("#pdf-page")).not.toHaveValue("1");
    await page.keyboard.press("Escape");
    await expect(modal).toBeHidden();
  });
});

test.describe("tour navigation", () => {
  test("selecting a viewpoint in the side panel loads it", async ({ page }) => {
    await page.goto("/tour/rooms");
    await waitForPanorama(page);
    const scene = await page.getByTestId("panorama-viewer").getAttribute("data-scene");
    await page.getByTestId("tour-sidebar").getByText("Balcony View").click();
    await expect(page.getByTestId("tour-viewpoint-name")).toHaveText("Balcony View");
    await expect(page.getByTestId("panorama-viewer")).not.toHaveAttribute("data-scene", scene!);
    await waitForPanorama(page);
    await expect(page).toHaveURL(/\?ap=/);
    // Another room
    await page.getByTestId("tour-sidebar").getByText("Master Bedroom").click();
    await expect(page.getByTestId("tour-location")).toContainText("Master Bedroom");
  });

  test("hotspot navigation updates the room, side panel and plan marker", async ({ page }) => {
    await page.goto("/tour/rooms");
    await waitForPanorama(page);
    const markerBefore = await page.getByTestId("floorplan-marker").getAttribute("data-x");
    const kitchen = page.locator('[data-testid=hotspot][data-label="Kitchen"]');
    await expect(kitchen).toBeVisible();
    await kitchen.click();
    await expect(page.getByTestId("tour-location")).toContainText("Kitchen");
    await waitForPanorama(page);
    // Side panel highlights the new room.
    await expect(page.getByTestId("tour-sidebar").locator("[data-testid=tour-group][data-active=true]")).toContainText("Kitchen");
    // Plan marker moved and the navigator names the room.
    await expect(page.getByTestId("floorplan-marker")).not.toHaveAttribute("data-x", markerBefore!);
    await expect(page.getByTestId("floorplan-room")).toHaveText("Kitchen");
    // And the kitchen has a hotspot back to the living room.
    await expect(page.locator('[data-testid=hotspot][data-label="Living Room"]')).toHaveCount(1);
  });

  test("the floor-plan direction indicator follows camera rotation", async ({ page }) => {
    await page.goto("/tour/rooms");
    await waitForPanorama(page);
    // Entrance View: initial yaw 0, heading offset 90 → bearing 90 (east).
    await expect.poll(() => currentBearing(page)).toBeCloseTo(90, 0);
    const viewer = page.getByTestId("panorama-viewer");
    await viewer.focus();
    for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight"); // +30° yaw
    await expect.poll(() => currentBearing(page)).toBeCloseTo(120, 0);
    // Drag left → look right (grab-to-rotate)
    const box = (await viewer.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(box.x + box.width / 2 - i * 20, box.y + box.height / 2);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    await page.waitForTimeout(800);
    const after = await currentBearing(page);
    expect(after).toBeGreaterThan(125);
    // Reset view returns to the initial direction.
    await page.getByTestId("reset-view").click();
    await expect.poll(() => currentBearing(page)).toBeCloseTo(90, 0);
  });

  test("side panel can be hidden for a full view, is remembered, and the title stays inside it", async ({ page }) => {
    await page.goto("/tour/rooms");
    await waitForPanorama(page);
    const sidebar = page.getByTestId("tour-sidebar");
    // Title never extends past the panel's right edge.
    const panel = (await sidebar.boundingBox())!;
    const title = (await page.getByTestId("tour-title").boundingBox())!;
    expect(title.x + title.width).toBeLessThanOrEqual(panel.x + panel.width);

    await page.getByTestId("sidebar-toggle").click();
    await expect(sidebar).toHaveAttribute("data-collapsed", "true");
    await expect(sidebar).not.toBeInViewport();
    await expect(page.getByTestId("sidebar-open")).toBeVisible();

    await page.reload();
    await waitForPanorama(page);
    await expect(page.getByTestId("tour-sidebar")).toHaveAttribute("data-collapsed", "true");

    await page.getByTestId("sidebar-open").click();
    await expect(page.getByTestId("tour-sidebar")).toBeInViewport();
    await expect(page.getByTestId("sidebar-open")).toBeHidden();
  });

  test("unknown or unpublished ?ap= falls back to the default viewpoint", async ({ page }) => {
    await page.goto("/tour/rooms?ap=00000000-0000-4000-8000-000000000000");
    await waitForPanorama(page);
    await expect(page.getByTestId("tour-viewpoint-name")).toHaveText("Entrance View");
  });

  test("a panorama that fails to load shows a usable error state", async ({ page }) => {
    await page.route(/\/api\/media\/.*variant=md/, (route) => route.fulfill({ status: 500, body: "boom" }));
    await page.route(/\/api\/media\/[^?]+\?v=\d+&p=1$/, (route) => route.fulfill({ status: 500, body: "boom" }));
    await page.goto("/tour/amenities");
    await expect(page.getByTestId("panorama-error")).toBeVisible({ timeout: 30_000 });
    // Navigation remains usable.
    await expect(page.getByTestId("tour-sidebar")).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  });
});
