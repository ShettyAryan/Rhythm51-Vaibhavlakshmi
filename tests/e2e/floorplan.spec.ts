import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

const DEMO = path.join(process.cwd(), "seed", "demo");

async function dragBy(page: Page, selector: string, dx: number, dy: number) {
  await page.locator(selector).first().scrollIntoViewIfNeeded();
  const box = (await page.locator(selector).first().boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 });
  await page.mouse.up();
}

test.describe("floor plans", () => {
  test("adding a plan: clear error without a name, and one step from a PDF", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/floor-plans");
    await page.getByTestId("add-plan").click();
    await expect(page.getByTestId("new-plan-error")).toContainText("Enter a name");

    await page.getByTestId("new-plan-name").fill("Tower B Typical");
    await page.getByTestId("new-plan-file").setInputFiles(path.join(DEMO, "floor-plans.pdf"));
    await page.getByTestId("add-plan").click();
    await expect(page.getByTestId("plan-canvas")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("plan-pdf-picker")).toContainText(".pdf");
    await expect(page.getByTestId("plan-image-picker")).toContainText("page-1.png");
    await expect(page.getByTestId("plan-status")).toHaveValue("published");
  });

  test("adding a plan from an image", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/floor-plans");
    await page.getByTestId("new-plan-file").setInputFiles(path.join(DEMO, "plan-site.png"));
    await page.getByTestId("add-plan").click(); // name is taken from the file name
    await expect(page.getByTestId("plan-canvas")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("plan site");
  });

  test("viewpoint position and direction can be changed on the plan and persist", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/floor-plans");
    await page.getByText("Demo Apartment Layout").click();
    await expect(page.getByTestId("plan-canvas")).toBeVisible();

    // Select Living Room › Entrance View from the list.
    await page.locator('[data-testid=plan-ap][data-name="Entrance View"]').first().click();
    const card = page.getByTestId("selected-viewpoint");
    await expect(card).toContainText("Living Room — Entrance View");
    const posBefore = await card.locator("p.text-xs").first().innerText();

    // Move it by dragging the dot.
    await dragBy(page, "[data-testid=plan-active-marker] [data-testid=plan-marker]", 80, 40);
    await expect(card.locator("p.text-xs").first()).not.toHaveText(posBefore);

    // Turn the direction (alignment) with the handle: drag it to point straight down (south ≈ 180°).
    const marker = (await page.locator("[data-testid=plan-active-marker] [data-testid=plan-marker]").boundingBox())!;
    const handle = (await page.getByTestId("rotate-handle").boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(marker.x + marker.width / 2, marker.y + marker.height / 2 + 150, { steps: 12 });
    await page.mouse.up();
    await expect(page.getByTestId("direction-input")).toHaveValue("180");
    const alignment = await page.getByTestId("alignment-input").inputValue();
    expect(Number(alignment)).toBe(180); // initial yaw 0 → alignment = 180

    // Starting-direction mode changes where visitors face instead of the alignment.
    await page.getByTestId("mode-start").check();
    await page.getByTestId("direction-input").fill("90");
    await expect(page.getByTestId("alignment-input")).toHaveValue("180");

    await page.getByTestId("plan-save").click();
    await expect(page.getByTestId("toast-success")).toBeVisible();

    // Persisted after reload.
    await page.reload();
    await page.locator('[data-testid=plan-ap][data-name="Entrance View"]').first().click();
    await expect(page.getByTestId("direction-input")).toHaveValue("90");
    await expect(page.getByTestId("alignment-input")).toHaveValue("180");
    await expect(page.getByTestId("selected-viewpoint").locator("p.text-xs").first()).not.toHaveText(posBefore);
  });

  test("viewpoint editor: marker can be dragged on its plan", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/tours/rooms");
    await page.locator('[data-testid=admin-ap][data-name="Dining View"] a').first().click();
    await expect(page.getByTestId("ap-plan-canvas")).toBeVisible();
    const before = await page.locator("[data-testid=ap-plan-canvas] [data-testid=plan-active-marker]").getAttribute("transform");
    await dragBy(page, "[data-testid=ap-plan-canvas] [data-testid=plan-active-marker] [data-testid=plan-marker]", -60, 30);
    await expect(page.locator("[data-testid=ap-plan-canvas] [data-testid=plan-active-marker]")).not.toHaveAttribute("transform", before!);
    await expect(page.getByTestId("ap-save")).toBeEnabled();
  });
});
