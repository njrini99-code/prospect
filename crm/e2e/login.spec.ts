import { test, expect } from "@playwright/test";

test("login page loads", async ({ page }) => {
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: /Welcome back/i }),
  ).toBeVisible();
});

test("login flow with wrong password shows error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Password").fill("wrongpassword");
  await page.getByRole("button", { name: /Sign in/i }).click();
  await expect(page.getByText(/Incorrect password/i)).toBeVisible({
    timeout: 5000,
  });
});

test("login redirects to today on success", async ({ page }) => {
  const pwd = process.env.APP_PASSWORD ?? "adppeo2026";
  await page.goto("/login");
  await page.getByLabel("Password").fill(pwd);
  await page.getByRole("button", { name: /Sign in/i }).click();
  await page.waitForURL(/\/today/, { timeout: 10000 });
  await expect(page.getByRole("heading", { name: /Today/i })).toBeVisible();
});
