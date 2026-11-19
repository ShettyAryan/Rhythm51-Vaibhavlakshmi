import { expect, test, type Page } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

interface Asset {
  id: string;
  category: string;
  fileName: string;
}

async function assets(page: Page, category: string): Promise<Asset[]> {
  return (await (await page.request.get(`/api/admin/assets?category=${category}`)).json()).assets;
}

/** Uploads a copy of an existing asset through the normal upload API. */
async function duplicateAsset(page: Page, source: Asset & { mimeType: string; url: string }, fileName: string): Promise<string> {
  const data = await (await page.request.get(source.url)).body();
  const created = await (
    await page.request.post("/api/admin/assets", { data: { fileName, mimeType: source.mimeType, size: data.length, category: source.category } })
  ).json();
  expect((await page.request.put(created.upload.url, { data, headers: { "Content-Type": source.mimeType } })).ok()).toBeTruthy();
  expect((await page.request.post(`/api/admin/assets/${created.assetId}/finalize`)).ok()).toBeTruthy();
  return created.assetId;
}

async function publish(page: Page) {
  expect((await page.request.post("/api/admin/publish")).ok()).toBeTruthy();
}

test.describe("multi-file documents & responsive cover", () => {
  test("Floor Plan modal shows PDFs and an image as tabs", async ({ page }) => {
    await loginAsAdmin(page);
    const pdfs = (await assets(page, "pdf")) as (Asset & { mimeType: string; url: string })[];
    const floorPdf = pdfs.find((a) => /floor/i.test(a.fileName)) ?? pdfs[0]!;
    const image = (await assets(page, "floor_plan_image"))[0]!;
    expect(floorPdf && image).toBeTruthy();
    const secondPdf = await duplicateAsset(page, floorPdf, "3bhk-plans.pdf");

    const save = (files: { assetId: string; title: string }[]) =>
      page.request.patch("/api/admin/documents/floor_plan", { data: { files, status: "published" } });

    try {
      expect((await save([
        { assetId: floorPdf.id, title: "2 BHK" },
        { assetId: secondPdf, title: "3 BHK" },
        { assetId: image.id, title: "Site plan" },
      ])).ok()).toBeTruthy();
      await publish(page);

      await page.goto("/");
      await page.getByTestId("nav-floorPlan").click();
      const modal = page.getByTestId("floorplan-modal");
      await expect(modal.getByTestId("document-tabs")).toBeVisible();
      await expect(modal.getByRole("tab")).toHaveText(["2 BHK", "3 BHK", "Site plan"]);
      await expect(modal.getByTestId("pdf-page").first()).toBeVisible();

      await modal.getByTestId("document-tab-1").click();
      await expect(modal.getByTestId("document-tab-1")).toHaveAttribute("aria-selected", "true");
      await expect(modal.getByTestId("pdf-page").first()).toBeVisible({ timeout: 60_000 });

      await modal.getByTestId("document-tab-2").click();
      const img = modal.getByTestId("document-image");
      await expect(img).toBeVisible();
      await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
      // Fits inside the modal at 100%.
      const [imgBox, modalBox] = [(await img.boundingBox())!, (await modal.boundingBox())!];
      expect(imgBox.width).toBeLessThanOrEqual(modalBox.width);
      expect(imgBox.y + imgBox.height).toBeLessThanOrEqual(modalBox.y + modalBox.height + 1);
      await page.screenshot({ path: test.info().outputPath("floorplan-image-tab.png") });

      await page.keyboard.press("Escape");
      await expect(modal).toBeHidden();
    } finally {
      // Restore the seeded single-PDF floor plan for the other specs.
      await save([{ assetId: floorPdf.id, title: "" }]);
      await publish(page);
      await page.request.delete(`/api/admin/assets/${secondPdf}`);
    }
  });

  test("mobile screens get the mobile cover image", async ({ page }) => {
    await loginAsAdmin(page);
    const mobile = (await assets(page, "floor_plan_image"))[0]!;
    try {
      expect((await page.request.patch("/api/admin/project", { data: { heroMobileAssetId: mobile.id } })).ok()).toBeTruthy();
      await publish(page);

      const src = (p: Page) => p.getByTestId("hero-image").evaluate((el: HTMLImageElement) => el.currentSrc);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/");
      await expect.poll(() => src(page)).toContain(mobile.id);

      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/");
      await expect.poll(() => src(page)).not.toContain(mobile.id);
    } finally {
      await page.request.patch("/api/admin/project", { data: { heroMobileAssetId: null } });
      await publish(page);
    }
  });
});
