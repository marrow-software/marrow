import { defineConfig, devices } from "@playwright/test";

// Smoke tests run against the built static export (`out/`), served by `serve`.
// Run `npm run build` first, then `npm run test:e2e`.
const PORT = 4321;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx serve out -l ${PORT} --no-port-switching`,
    url: BASE_URL,
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
  },
});
