import { test, expect } from "@playwright/test";

// Coverage for the Sentry install (infra/sentry-install). The fix wires the
// Next.js client instrumentation hook (instrumentation-client.ts) which calls
// Sentry.init() on every client render. Two things must hold in production:
//
//   1. INSTALL: the Sentry browser SDK is actually present in the bundle. The
//      SDK marks itself by attaching a carrier object to window.__SENTRY__
//      (it holds the SDK "version" key). If the script tag / client hook were
//      missing, this global would be undefined.
//
//   2. NO-OP SAFETY: prod has no NEXT_PUBLIC_SENTRY_DSN set yet, and the init
//      config gates on `enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN`. So the
//      SDK must load but send zero events. We assert no network request ever
//      leaves for a Sentry ingest endpoint.
//
// This spec runs on a public route ("/", which redirects to /login when
// unauthenticated) so it needs no seeded session. It only requires the same
// E2E_BASE_URL skip-guard the rest of the suite uses, so CI with placeholder
// Supabase does not boot a redundant dev server for it.

const SENTRY_INGEST = /sentry\.io|\.ingest\.|\/envelope(\/|\?|$)/i;

test.describe("Sentry instrumentation", () => {
  test.skip(
    !process.env.E2E_BASE_URL,
    "Set E2E_BASE_URL to a deployed Driven Talent app to assert the production Sentry bundle.",
  );

  test("SDK is installed and sends no events while the DSN is unset", async ({
    page,
  }) => {
    // Record any request that would carry an error/replay envelope to Sentry.
    const sentryRequests: string[] = [];
    page.on("request", (req) => {
      if (SENTRY_INGEST.test(req.url())) sentryRequests.push(req.url());
    });

    // "/" redirects to /login when signed out; the client instrumentation hook
    // still runs there, so this proves install without needing a session.
    await page.goto("/", { waitUntil: "networkidle" });

    // (1) INSTALL: the Sentry carrier is present and self-reports a version.
    const carrier = await page.evaluate(() => {
      const c = (window as unknown as { __SENTRY__?: Record<string, unknown> })
        .__SENTRY__;
      if (!c) return { present: false, version: null as string | null };
      // The carrier stores the loaded SDK version under a "version" key.
      const version =
        typeof c.version === "string" ? (c.version as string) : null;
      return { present: true, version };
    });

    expect(
      carrier.present,
      "window.__SENTRY__ is missing - the Sentry client instrumentation did not load.",
    ).toBe(true);
    expect(
      carrier.version,
      "window.__SENTRY__ carries no SDK version string.",
    ).toBeTruthy();

    // (2) NO-OP SAFETY: with no DSN configured, nothing must be transmitted.
    expect(
      sentryRequests,
      `Sentry transmitted ${sentryRequests.length} event(s) despite an empty DSN: ${sentryRequests.join(", ")}`,
    ).toEqual([]);
  });
});
