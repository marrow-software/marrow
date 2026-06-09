import { test, expect } from "@playwright/test";

const APP_URL = "https://app.marrow.so";

// These are assertion-based DOM smoke tests (not pixel snapshots). Each one
// would have caught a specific bug from the design-handoff alignment work:
// the wrong glyph, the Get-started→github CTA, the dead /signup link, and the
// half-wired nav. Reverting any one of those fixes should turn one red.

test.describe("marketing landing", () => {
  test("nav exposes Product and Pricing with the right hrefs", async ({ page }) => {
    await page.goto("/");
    const nav = page.locator("header nav");
    await expect(nav.getByRole("link", { name: "Product", exact: true })).toHaveAttribute("href", "/");
    await expect(nav.getByRole("link", { name: "Pricing", exact: true })).toHaveAttribute("href", "/pricing");
  });

  test("header renders the MarrowGlyph (viewBox 0 0 32 32)", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('header svg[viewBox="0 0 32 32"]').first()).toBeVisible();
  });

  test("primary CTA and Sign in both point at the app", async ({ page }) => {
    await page.goto("/");
    const header = page.locator("header");

    const openMarrow = header.getByRole("link", { name: "Open Marrow" });
    await expect(openMarrow).toHaveAttribute("href", APP_URL);

    const signIn = header.getByRole("link", { name: "Sign in", exact: true });
    await expect(signIn).toHaveAttribute("href", APP_URL);

    // The primary CTA must not regress back to pointing at GitHub.
    const openHref = await openMarrow.getAttribute("href");
    expect(openHref).not.toContain("github");
  });

  for (const path of ["/", "/product", "/pricing"]) {
    test(`${path} returns 200 and renders SiteNav with no /signup links`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);

      // SiteNav present: header with the brand glyph + the Open Marrow CTA.
      await expect(page.locator('header svg[viewBox="0 0 32 32"]').first()).toBeVisible();
      await expect(page.locator("header").getByRole("link", { name: "Open Marrow" })).toBeVisible();

      // No link anywhere resolves to the dead /signup route.
      await expect(page.locator('a[href*="signup"]')).toHaveCount(0);
    });
  }
});
