import { expect, test, type Page } from "@playwright/test";
import { silentMp3 } from "../silentMp3";
import { loginAsAdmin } from "./helpers";

async function uploadMp3(page: Page): Promise<string> {
  const data = silentMp3(3);
  const created = await (
    await page.request.post("/api/admin/assets", { data: { fileName: "e2e-theme.mp3", mimeType: "audio/mpeg", size: data.length, category: "audio" } })
  ).json();
  expect((await page.request.put(created.upload.url, { data, headers: { "Content-Type": "audio/mpeg" } })).ok()).toBeTruthy();
  expect((await page.request.post(`/api/admin/assets/${created.assetId}/finalize`)).ok()).toBeTruthy();
  return created.assetId;
}

const publish = async (page: Page) => expect((await page.request.post("/api/admin/publish")).ok()).toBeTruthy();

test("background music starts on first interaction, can be muted, and the choice is remembered", async ({ page }) => {
  await loginAsAdmin(page);
  const track = await uploadMp3(page);
  try {
    expect((await page.request.patch("/api/admin/project", { data: { musicAssetId: track, musicVolume: 0.4 } })).ok()).toBeTruthy();
    await publish(page);

    await page.goto("/");
    const toggle = page.getByTestId("music-toggle");
    const audio = page.getByTestId("background-music");
    await expect(toggle).toBeVisible();
    expect(await audio.evaluate((el: HTMLAudioElement) => el.loop)).toBe(true);

    // Any interaction with the page starts the music.
    await page.mouse.click(700, 300);
    await expect(toggle).toHaveAttribute("data-state", "playing");
    expect(await audio.evaluate((el: HTMLAudioElement) => el.volume)).toBeCloseTo(0.4);

    // Mute; it stays muted after a reload and further clicks.
    await toggle.click();
    await expect(toggle).toHaveAttribute("data-state", "off");
    await expect(toggle).toHaveAccessibleName("Play music");
    await page.reload();
    await page.mouse.click(700, 300);
    await page.waitForTimeout(500);
    await expect(page.getByTestId("music-toggle")).toHaveAttribute("data-state", "off");
    expect(await page.getByTestId("background-music").evaluate((el: HTMLAudioElement) => el.paused)).toBe(true);

    // Unmute with the button.
    await page.getByTestId("music-toggle").click();
    await expect(page.getByTestId("music-toggle")).toHaveAttribute("data-state", "playing");

    // The tour has the same control in its toolbar and keeps playing.
    await page.getByTestId("nav-rooms").click();
    await expect(page.getByTestId("tour")).toBeVisible();
    await expect(page.getByRole("toolbar", { name: "Viewer controls" }).getByTestId("music-toggle")).toHaveAttribute("data-state", "playing");
  } finally {
    await page.request.patch("/api/admin/project", { data: { musicAssetId: null } });
    await publish(page);
    await page.request.delete(`/api/admin/assets/${track}`);
  }
});
