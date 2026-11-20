import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test("Renders button opens a gallery with arrows, keys, thumbnails and captions", async ({ page }) => {
  await loginAsAdmin(page);
  const images = [
    ...(await (await page.request.get("/api/admin/assets?category=image")).json()).assets,
    ...(await (await page.request.get("/api/admin/assets?category=floor_plan_image")).json()).assets,
  ].slice(0, 3) as { id: string }[];
  expect(images.length).toBeGreaterThanOrEqual(2);
  const save = (data: unknown) => page.request.patch("/api/admin/documents/renders", { data });
  const publish = async () => expect((await page.request.post("/api/admin/publish")).ok()).toBeTruthy();

  try {
    // Without renders the button is shown but disabled.
    expect((await save({ files: [], status: "published" })).ok()).toBeTruthy();
    await publish();
    await page.goto("/");
    await expect(page.getByTestId("nav-renders")).toBeDisabled();

    const captions = ["Living room", "Terrace", "Lobby"].slice(0, images.length);
    expect((await save({ files: images.map((a, i) => ({ assetId: a.id, title: captions[i] })), status: "published" })).ok()).toBeTruthy();
    await publish();

    await page.goto("/");
    await expect(page.locator("[data-testid^=nav-]")).toHaveCount(5);
    const button = page.getByTestId("nav-renders");
    await expect(button).toHaveText(/renders/i);
    await button.click();

    const modal = page.getByTestId("renders-modal");
    await expect(modal.getByTestId("render-image")).toBeVisible();
    await expect.poll(() => modal.getByTestId("render-image").evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    await expect(modal.getByTestId("render-caption")).toHaveText(captions[0]!);
    await expect(modal.getByTestId("render-counter")).toHaveText(`1 / ${images.length}`);
    await expect(modal.getByTestId("render-thumb")).toHaveCount(images.length);

    await modal.getByTestId("render-next").click();
    await expect(modal.getByTestId("render-caption")).toHaveText(captions[1]!);
    await page.keyboard.press("ArrowLeft");
    await expect(modal.getByTestId("render-counter")).toHaveText(`1 / ${images.length}`);
    // Wraps around backwards.
    await page.keyboard.press("ArrowLeft");
    await expect(modal.getByTestId("render-counter")).toHaveText(`${images.length} / ${images.length}`);
    await modal.getByTestId("render-thumb").nth(1).click();
    await expect(modal.getByTestId("render-caption")).toHaveText(captions[1]!);

    // Fits inside the modal.
    const [img, box] = [(await modal.getByTestId("render-image").boundingBox())!, (await modal.boundingBox())!];
    expect(img.width).toBeLessThanOrEqual(box.width + 1);
    await page.screenshot({ path: test.info().outputPath("renders.png") });

    await page.keyboard.press("Escape");
    await expect(modal).toBeHidden();
  } finally {
    await save({ files: [] });
    await publish();
  }
});
