import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

// Optional saved-login support. Production gates most routes behind /login, so
// the data-backed specs need an authenticated session. Generate a storageState
// JSON once (e.g. `npx playwright codegen --save-storage=auth.json <url>` after
// signing in) and point E2E_STORAGE_STATE at it. Do NOT commit that file or any
// credentials; it is git-ignored and supplied per-run via the environment.
const STORAGE_STATE = process.env.E2E_STORAGE_STATE || undefined;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    storageState: STORAGE_STATE,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `next dev -p ${PORT}`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
