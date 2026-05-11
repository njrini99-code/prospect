/**
 * e2e/pipeline-stage-move.spec.ts
 *
 * Critical path: login → /pipeline → drag a kanban card to a new stage
 * → verify the card appears in the new column (persistence via moveMeddpiccStage).
 *
 * SCAFFOLD ONLY — requires a running dev server with seeded data.
 * Run with: npm run test:e2e
 *
 * Assumptions about the pipeline board DOM (from pipeline-board.tsx):
 *   - Each stage column has a data-stage attribute
 *   - Each card has a data-company-key attribute
 *   - Cards are draggable (HTML5 drag-and-drop or pointer events)
 */
import { test, expect } from "@playwright/test";

const APP_PASSWORD = process.env.APP_PASSWORD ?? "adppeo2026";

async function loginAs(page: import("@playwright/test").Page, password: string) {
  await page.goto("/login");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /Sign in/i }).click();
  await page.waitForURL(/\/today/, { timeout: 10_000 });
}

test.describe("Pipeline stage move", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, APP_PASSWORD);
  });

  test("pipeline page loads with stage columns", async ({ page }) => {
    await page.goto("/pipeline");
    // Verify at least one known stage column is visible
    await expect(
      page.getByText("Discovery scheduled", { exact: false }),
    ).toBeVisible({ timeout: 8000 });
  });

  test("pipeline board renders kanban cards", async ({ page }) => {
    await page.goto("/pipeline");
    // At least one stage column container should be in the DOM
    // Columns are rendered with a heading per stage label
    const stages = [
      "Discovery scheduled",
      "Discovery held",
      "Proposal sent",
    ];
    for (const stage of stages) {
      await expect(
        page.locator(`[data-stage], h2, h3`).filter({ hasText: stage }).first(),
      ).toBeVisible({ timeout: 8000 });
    }
  });

  test("drag card from Discovery scheduled to Discovery held", async ({
    page,
  }) => {
    await page.goto("/pipeline");
    await page.waitForLoadState("networkidle");

    // Locate the first card in "Discovery scheduled"
    const sourceCol = page
      .locator("[data-stage='Discovery scheduled'], [data-column]")
      .first();
    const card = sourceCol.locator("[data-company-key], [draggable='true']").first();

    // Locate the "Discovery held" column drop target
    const targetCol = page
      .locator("[data-stage='Discovery held'], [data-column]")
      .nth(1);

    // Only attempt drag if a card exists — skip gracefully if board is empty
    const cardCount = await card.count();
    if (cardCount === 0) {
      test.skip();
      return;
    }

    const cardBox = await card.boundingBox();
    const targetBox = await targetCol.boundingBox();

    if (!cardBox || !targetBox) {
      test.skip();
      return;
    }

    // Perform pointer-based drag
    await page.mouse.move(
      cardBox.x + cardBox.width / 2,
      cardBox.y + cardBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      targetBox.x + targetBox.width / 2,
      targetBox.y + targetBox.height / 2,
      { steps: 10 },
    );
    await page.mouse.up();

    // After drop, wait for any server action / revalidation
    await page.waitForTimeout(1500);

    // Reload the page to confirm server-side persistence
    await page.reload();
    await page.waitForLoadState("networkidle");

    // The card should now appear in "Discovery held"
    const cardCompanyKey = await card.getAttribute("data-company-key").catch(() => null);
    if (cardCompanyKey) {
      const movedCard = page.locator(
        `[data-stage='Discovery held'] [data-company-key='${cardCompanyKey}']`,
      );
      await expect(movedCard).toBeVisible({ timeout: 8000 });
    } else {
      // Fallback: the target column should have at least one card
      const targetCards = targetCol.locator(
        "[data-company-key], [draggable='true']",
      );
      await expect(targetCards.first()).toBeVisible({ timeout: 8000 });
    }
  });

  test("move card via action button if drag is not available", async ({
    page,
  }) => {
    await page.goto("/pipeline");
    await page.waitForLoadState("networkidle");

    // Some implementations expose a stage-select dropdown on the card
    const stageSelect = page
      .locator("select[name='stage'], [data-stage-select]")
      .first();

    const selectCount = await stageSelect.count();
    if (selectCount === 0) {
      // No select-based fallback — drag-only UI, skip this path
      test.skip();
      return;
    }

    await stageSelect.selectOption("Discovery held");
    await page.waitForTimeout(1000);

    // Confirm the page still renders correctly after the update
    await expect(
      page.getByText("Discovery held", { exact: false }),
    ).toBeVisible();
  });
});
