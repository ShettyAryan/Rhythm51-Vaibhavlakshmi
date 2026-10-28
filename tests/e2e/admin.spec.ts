import { expect, test } from "@playwright/test";
import { loginAsAdmin, waitForPanorama } from "./helpers";

test.describe("admin security", () => {
  test("admin pages redirect anonymous visitors to the login page", async ({ page }) => {
    await page.goto("/admin/tours/rooms");
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("admin APIs reject anonymous and cross-site requests", async ({ page, request }) => {
    expect((await request.get("/api/admin/tours/rooms")).status()).toBe(401);
    expect((await request.patch("/api/admin/project", { data: { name: "x" } })).status()).toBe(401);
    expect((await request.post("/api/admin/publish")).status()).toBe(401);
    // Even with a valid session, a cross-origin mutation is refused.
    await loginAsAdmin(page);
    const res = await page.request.patch("/api/admin/project", { data: { name: "x" }, headers: { Origin: "https://evil.example" } });
    expect(res.status()).toBe(403);
  });

  test("draft (unpublished) media URLs are not served to visitors", async ({ page, request }) => {
    await page.goto("/tour/rooms");
    await waitForPanorama(page);
    const src = await page.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name).find((n) => n.includes("/api/media/") && n.includes("p=1")));
    expect(src).toBeTruthy();
    const draftUrl = src!.replace("&p=1", "").replace("p=1&", "");
    expect((await request.get(draftUrl)).status()).toBe(404);
    expect((await request.get(src!)).status()).toBe(200);
  });

  test("wrong password is rejected", async ({ page }) => {
    await page.goto("/admin/login");
    await page.fill("input[name=email]", "e2e-admin@example.com");
    await page.fill("input[name=password]", "not-the-password");
    await page.click("button[type=submit]");
    await expect(page.getByTestId("login-error")).toBeVisible();
  });
});

test.describe("admin content management", () => {
  test("changes persist after reload and appear publicly only after publishing", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/settings");
    const headline = page.getByTestId("settings-headline");
    await headline.fill("A Home in Rhythm");
    await page.getByTestId("settings-save").click();
    await expect(page.getByTestId("toast-success")).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("settings-headline")).toHaveValue("A Home in Rhythm");

    // Not public yet…
    await page.goto("/");
    await expect(page.getByTestId("hero-headline")).not.toHaveText("A Home in Rhythm");
    // …until published.
    await page.goto("/admin/publish");
    await page.getByTestId("publish-button").click();
    await expect(page.getByTestId("toast-success")).toBeVisible();
    await page.goto("/");
    await expect(page.getByTestId("hero-headline")).toHaveText("A Home in Rhythm");
  });

  test("draft rooms and viewpoints stay hidden from the public tour", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/tours/rooms");
    await page.getByTestId("new-group-name").fill("Study Room");
    await page.getByTestId("add-group").click();
    const group = page.locator('[data-testid=admin-group][data-name="Study Room"]');
    await expect(group).toBeVisible();
    await group.getByTestId("new-ap-name").fill("Desk View");
    await group.getByTestId("add-ap").click();
    await expect(page.getByTestId("ap-editor")).toBeVisible();
    await expect(page.getByTestId("panorama-empty")).toBeVisible();

    // Publish everything else; the draft room must not appear.
    await page.request.post("/api/admin/publish");
    await page.goto("/tour/rooms");
    await waitForPanorama(page);
    await expect(page.getByTestId("tour-sidebar")).not.toContainText("Study Room");

    // Admin preview with drafts shows it, with a clear empty state for the missing panorama.
    await page.goto("/admin/preview/tour/rooms?drafts=1");
    await expect(page.getByTestId("preview-banner")).toBeVisible();
    await page.getByTestId("tour-sidebar").getByText("Study Room").click();
    await expect(page.getByTestId("panorama-empty")).toBeVisible();
  });

  test("draft viewpoints are flagged and can be published in one click", async ({ page }) => {
    await loginAsAdmin(page);
    // Put "Balcony View" back to Draft and publish normally: it disappears publicly.
    const tour = await (await page.request.get("/api/admin/tours/rooms")).json();
    const balcony = tour.groups.flatMap((g: { accessPoints: { id: string; name: string }[] }) => g.accessPoints).find((a: { name: string }) => a.name === "Balcony View");
    expect((await page.request.patch(`/api/admin/access-points/${balcony.id}`, { data: { status: "draft" } })).ok()).toBeTruthy();

    await page.goto("/admin/publish");
    await expect(page.getByTestId("draft-summary")).toContainText("1 viewpoint");
    await page.getByTestId("publish-button").click();
    await expect(page.getByTestId("toast-success")).toBeVisible();
    await page.goto("/tour/rooms");
    await waitForPanorama(page);
    await expect(page.getByTestId("tour-sidebar")).not.toContainText("Balcony View");

    // One click marks ready drafts as Published and publishes them.
    await page.goto("/admin/publish");
    await page.getByTestId("publish-all-button").click();
    await expect(page.getByTestId("toast-success")).toContainText("Marked");
    await page.goto("/tour/rooms");
    await waitForPanorama(page);
    await expect(page.getByTestId("tour-sidebar")).toContainText("Balcony View");
  });

  test("hotspot editor: add a hotspot at the view centre and persist it", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/tours/rooms");
    await page.locator('[data-testid=admin-ap][data-name="Window View"] a').first().click();
    await waitForPanorama(page);
    const rows = page.getByTestId("hotspot-row");
    const before = await rows.count();
    const option = page.getByTestId("hotspot-destination").locator("option", { hasText: "Entrance View" }).first();
    await page.getByTestId("hotspot-destination").selectOption(await option.getAttribute("value"));
    await page.getByTestId("add-hotspot-here").click();
    await expect(rows).toHaveCount(before + 1);
    await page.getByTestId("ap-save").click();
    await expect(page.getByTestId("toast-success")).toBeVisible();
    await page.reload();
    await waitForPanorama(page);
    await expect(page.getByTestId("hotspot-row")).toHaveCount(before + 1);
  });
});
