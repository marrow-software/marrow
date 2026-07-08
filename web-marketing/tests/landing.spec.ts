import { test, expect } from "@playwright/test";

const APP_URL = "https://app.marrow.so";
const SELF_HOST_DOCS_URL = "https://docs.marrow.so/deployment/docker-compose/";

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

  test("nav CTAs are self-host-first: Self-host primary, Cloud secondary", async ({ page }) => {
    await page.goto("/");
    const header = page.locator("header");

    const selfHost = header.getByRole("link", { name: "Self-host", exact: true });
    await expect(selfHost).toHaveAttribute("href", SELF_HOST_DOCS_URL);

    const openMarrow = header.getByRole("link", { name: "Open Marrow" });
    await expect(openMarrow).toHaveAttribute("href", APP_URL);

    const signIn = header.getByRole("link", { name: "Sign in", exact: true });
    await expect(signIn).toHaveAttribute("href", APP_URL);

    const selfHostHref = await selfHost.getAttribute("href");
    expect(selfHostHref).not.toContain("github");
    expect(selfHostHref).not.toContain("app.marrow.so");
  });

  test("hero leads with self-host and accurate license badge", async ({ page }) => {
    await page.goto("/");

    const heroSelfHost = page.getByRole("link", { name: /Self-host with Docker/i }).first();
    await expect(heroSelfHost).toHaveAttribute("href", SELF_HOST_DOCS_URL);

    const heroCloud = page.getByRole("link", { name: /Try Marrow Cloud/i }).first();
    await expect(heroCloud).toHaveAttribute("href", APP_URL);

    await expect(page.getByRole("main").getByText("Apache 2.0")).toBeVisible();
    await expect(page.getByText("MIT licensed")).toHaveCount(0);
    await expect(page.getByText(/Works offline/i)).toHaveCount(0);
    await expect(page.getByText(/local-first sync/i)).toHaveCount(0);
  });

  for (const path of ["/", "/product", "/pricing"]) {
    test(`${path} returns 200 and renders SiteNav with no /signup links`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);

      // SiteNav present: header with the brand glyph + the self-host-first CTAs.
      await expect(page.locator('header svg[viewBox="0 0 32 32"]').first()).toBeVisible();
      await expect(page.locator("header").getByRole("link", { name: "Self-host", exact: true })).toBeVisible();
      await expect(page.locator("header").getByRole("link", { name: "Open Marrow" })).toBeVisible();

      // No link anywhere resolves to the dead /signup route.
      await expect(page.locator('a[href*="signup"]')).toHaveCount(0);
    });
  }
});
