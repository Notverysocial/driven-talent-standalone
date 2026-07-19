import { defineConfig, devices } from "@playwright/test";

// ---------------------------------------------------------------------------
// WHY THIS SUITE IS SPLIT INTO TWO PROJECTS (card 91fa1361, 2026-07-19)
//
// Read this before merging e2e/browser/* back into the required check.
//
// CI has NO DATABASE. The workflow runs with
// NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co, a host that does not
// resolve. Every Supabase-backed page therefore burns tens of seconds in the
// client's retry/backoff before rendering (measured 2026-07-19 against a warm
// server: /login 0.5s, /bonuses 28.2s -> HTTP 200, /candidates + /applications
// ~7.3s -> HTTP 500). It is NOT cold compilation — a warmed request is just as
// slow, which is what proved the cause.
//
// Consequence: e2e/browser/bonuses.spec.ts sat right on the 30s per-test
// timeout (measured 29.6s locally on fast hardware). It passed on quick runners
// and failed on slow ones, so `ci / playwright` was red most of the time from
// ~2026-07-10. That chronic red is what let a genuine main-breaking regression
// (the duplicate-identifier double-apply, PRs #46-#51) sit undetected for about
// an hour while CI correctly screamed about it and everyone read it as "the
// known flake."
//
// So: the REQUIRED gate runs only the `logic` project — pure functions, no
// server, no database, fully deterministic. When it is red, something is
// actually broken. The `browser` project keeps every one of its tests intact
// (nothing deleted, nothing skipped) but runs in a separate, non-required
// workflow, because a database-less environment cannot give those tests a fair
// verdict. bonuses.spec.ts in particular is a real regression test for a real
// production 500 and must be preserved.
//
// The fix that makes the browser project meaningful is a real backend in CI
// (see docs/CI-REAL-BACKEND-FOLLOWUP.md). Once that exists, promote the browser
// project back into the required check and delete this caveat.
//
// Also note (card 91fa1361, fix C): the server below is `next start`, NOT
// `next dev`. CI previously built the app and then threw that build away to
// test a dev server — so the artifact that deploys was never the artifact that
// was tested. `next start` requires `next build` to have run first.
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

// Optional saved-login support. Production gates most routes behind /login, so
// the data-backed specs need an authenticated session. Generate a storageState
// JSON once (e.g. `npx playwright codegen --save-storage=auth.json <url>` after
// signing in) and point E2E_STORAGE_STATE at it. Do NOT commit that file or any
// credentials; it is git-ignored and supplied per-run via the environment.
const STORAGE_STATE = process.env.E2E_STORAGE_STATE || undefined;

// Booting a server is opt-in, so the required logic-only run stays fast and
// needs no build. Set E2E_WITH_SERVER=1 to run the browser project locally:
//   npm run build && E2E_WITH_SERVER=1 npx playwright test --project=browser
// If E2E_BASE_URL points at an already-running/deployed app, no server is spawned.
const NEEDS_SERVER =
  process.env.E2E_WITH_SERVER === "1" && !process.env.E2E_BASE_URL;

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
      // REQUIRED gate. Pure functions only: no browser page, no server, no DB.
      name: "logic",
      testDir: "./e2e/logic",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // NON-REQUIRED until CI has a real backend. Every test preserved.
      name: "browser",
      testDir: "./e2e/browser",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: NEEDS_SERVER
    ? {
        // fix C — exercise the production build, i.e. what actually deploys.
        command: "npm run start",
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined,
});
