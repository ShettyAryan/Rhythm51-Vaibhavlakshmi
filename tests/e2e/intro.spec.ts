import { expect, test, type Page } from "@playwright/test";
import { silentMp3 } from "../silentMp3";
import { loginAsAdmin } from "./helpers";

// Automated browsers skip the intro; pretend to be a normal visitor here.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false }));
});

async function uploadMp3(page: Page): Promise<string> {
  const data = silentMp3(3);
  const created = await (
    await page.request.post("/api/admin/assets", { data: { fileName: "intro-theme.mp3", mimeType: "audio/mpeg", size: data.length, category: "audio" } })
  ).json();
  expect((await page.request.put(created.upload.url, { data, headers: { "Content-Type": "audio/mpeg" } })).ok()).toBeTruthy();
  expect((await page.request.post(`/api/admin/assets/${created.assetId}/finalize`)).ok()).toBeTruthy();
  return created.assetId;
}
const publish = async (page: Page) => expect((await page.request.post("/api/admin/publish")).ok()).toBeTruthy();

test("intro plays, then Start Experience opens the site and starts the music", async ({ page }) => {
  await loginAsAdmin(page);
  const track = await uploadMp3(page);
  try {
    expect((await page.request.patch("/api/admin/project", { data: { musicAssetId: track } })).ok()).toBeTruthy();
    await publish(page);

    await page.goto("/");
    const intro = page.getByTestId("intro");
    await expect(intro).toBeVisible();
    await expect(intro.getByRole("img", { name: "Vaibhavlaxmi" })).toBeVisible();
    await expect(intro.getByRole("img", { name: "Value Beyond Walls" })).toBeVisible();

    // Credit: ConstructXR in Poppins, in the logo's green.
    const name = page.getByTestId("intro-credit").getByText("ConstructXR");
    await expect(name).toBeVisible({ timeout: 6000 });
    expect(await name.evaluate((el) => [getComputedStyle(el).fontFamily.split(",")[0], getComputedStyle(el).color])).toEqual([
      "Poppins",
      "rgb(31, 56, 48)",
    ]);

    // No button (and no sound) while the animation runs, even if the visitor clicks around.
    await expect(page.getByTestId("intro-start")).toHaveCount(0);
    await page.mouse.click(40, 40);
    expect(await page.getByTestId("background-music").evaluate((el: HTMLAudioElement) => el.paused)).toBe(true);

    const start = page.getByTestId("intro-start");
    await expect(start).toBeVisible({ timeout: 12_000 });
    await expect(start).toHaveText(/start experience/i);
    await expect(start).toBeFocused();
    await start.click();

    await expect(intro).toHaveCount(0);
    await expect(page.getByTestId("music-toggle")).toHaveAttribute("data-state", "playing");
    await expect(page.getByTestId("nav-floorPlan")).toBeVisible();

    // Once per session: coming back doesn't replay it.
    await page.reload();
    await expect(page.getByTestId("landing")).toBeVisible();
    await expect(page.getByTestId("intro")).toHaveCount(0);
  } finally {
    await page.request.patch("/api/admin/project", { data: { musicAssetId: null } });
    await publish(page);
    await page.request.delete(`/api/admin/assets/${track}`);
  }
});

test("admin preview never shows the intro", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/preview");
  await expect(page.getByTestId("landing")).toBeVisible();
  await expect(page.getByTestId("intro")).toHaveCount(0);
});
