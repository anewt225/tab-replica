import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * Use a Chromium that is already on the machine when one is available, rather
 * than downloading a second copy. Set PLAYWRIGHT_CHROMIUM_PATH to override.
 */
const localChromium = [
  process.env.PLAYWRIGHT_CHROMIUM_PATH,
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
].find((candidate) => candidate && existsSync(candidate));

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    ...(localChromium ? { launchOptions: { executablePath: localChromium } } : {}),
  },
  projects: [
    {
      name: "mobile",
      // A phone at a restaurant table is the primary target, so test there.
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: "pnpm build && pnpm start --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      // Enables /api/test/seed so tests can skip the OCR round trip.
      ENABLE_TEST_ROUTES: "1",
      DATABASE_URL:
        process.env.DATABASE_URL ?? "postgres://tab:tab@localhost:5433/tab",
      DEVICE_COOKIE_SECRET: process.env.DEVICE_COOKIE_SECRET ?? "e2e-secret",
    },
  },
});
