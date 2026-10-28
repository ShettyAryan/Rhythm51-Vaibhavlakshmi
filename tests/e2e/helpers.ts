import { expect, type Page } from "@playwright/test";
import { E2E_ADMIN } from "../../playwright.config";

export async function loginAsAdmin(page: Page) {
  const res = await page.request.post("/api/auth/login", { data: E2E_ADMIN });
  expect(res.ok()).toBeTruthy();
}

export async function waitForPanorama(page: Page) {
  await expect(page.getByTestId("panorama-viewer")).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
}

export async function currentBearing(page: Page) {
  return Number(await page.getByTestId("floorplan-cone").getAttribute("data-bearing"));
}
