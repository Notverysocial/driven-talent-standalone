import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CRON_PATHS, isCronPath } from "../../src/lib/cron-paths";
import { evaluateCronAuth } from "../../src/lib/cron-auth";

// The regression gate for the 2026-07 outage.
//
// ROOT CAUSE (from Vercel runtime logs): with AUTH_ENABLED=true, a Vercel Cron
// request carries no session. Any path missing from the proxy's public
// allowlist is 307-redirected to /login by the middleware BEFORE the route
// handler runs — no log line, no database write, no trace whatsoever. The job
// does not fail; it does not exist.
//
//   /api/leads/notify      → 200, logs every 15 min   (allowlisted)
//   /api/integrations/cron → 307, never logged, ever  (not allowlisted)
//
// Three of the four crons in vercel.json were in the second category. The
// integrations one had been dark long enough that `integrations` rows still
// held whatever the last MANUAL sync left them — which is why last_sync_at,
// next_sync_at and updated_at were in a combination the code on main cannot
// produce. The code never ran.
//
// This spec diffs vercel.json against the allowlist, so adding a cron without
// registering its path fails CI instead of failing silently in production.

type VercelConfig = { crons?: { path: string; schedule: string }[] };

const vercelConfig = JSON.parse(
  readFileSync(join(process.cwd(), "vercel.json"), "utf8"),
) as VercelConfig;

const declaredCrons = vercelConfig.crons ?? [];

test.describe("every cron in vercel.json is reachable through the proxy", () => {
  test("vercel.json actually declares crons (guards against an empty diff passing)", () => {
    expect(declaredCrons.length).toBeGreaterThan(0);
  });

  test("THE OUTAGE: every declared cron path is in the public allowlist", () => {
    const unregistered = declaredCrons
      .map((c) => c.path)
      .filter((p) => !isCronPath(p));
    expect(
      unregistered,
      `These cron paths are NOT allowlisted in src/lib/cron-paths.ts, so the ` +
        `proxy will 307 them to /login and they will never run:\n` +
        unregistered.map((p) => `  - ${p}`).join("\n"),
    ).toEqual([]);
  });

  test("/api/integrations/cron specifically — the path that was dark", () => {
    expect(isCronPath("/api/integrations/cron")).toBe(true);
    expect(declaredCrons.some((c) => c.path === "/api/integrations/cron")).toBe(
      true,
    );
  });

  test("the uAttend weekly timecard pull is registered", () => {
    expect(isCronPath("/api/timecards/uattend-weekly")).toBe(true);
    expect(
      declaredCrons.some((c) => c.path === "/api/timecards/uattend-weekly"),
    ).toBe(true);
  });

  test("the allowlist has no entries that no longer exist in vercel.json", () => {
    // Drift in the other direction: a stale public path is an endpoint exposed
    // past the auth gate for no reason.
    const declared = new Set(declaredCrons.map((c) => c.path));
    const orphans = CRON_PATHS.filter((p) => !declared.has(p));
    expect(orphans, `Allowlisted but not a declared cron: ${orphans.join(", ")}`).toEqual(
      [],
    );
  });

  test("non-cron paths are not allowlisted by this list", () => {
    for (const p of ["/dashboard", "/api/integrations/sync/uattend", "/clients", "/"]) {
      expect(isCronPath(p), p).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// FAIL-CLOSED SECRET
//
// Allowlisting is what makes the crons run — and it removes the accidental
// protection the 307 was providing. Every route previously used
//
//     const expected = process.env.CRON_SECRET;
//     if (expected) { ...check... }
//
// which does NOTHING when the secret is unset. Public + unset = open endpoint.
// ---------------------------------------------------------------------------

test.describe("evaluateCronAuth — no secret means refuse, never allow", () => {
  test("undefined secret refuses with 503 (it must NOT run unauthenticated)", () => {
    const v = evaluateCronAuth(undefined, "Bearer anything");
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.status).toBe(503);
  });

  test("empty / whitespace secret also refuses", () => {
    expect(evaluateCronAuth("", "Bearer x").ok).toBe(false);
    expect(evaluateCronAuth("   ", "Bearer x").ok).toBe(false);
  });

  test("a correct bearer is accepted", () => {
    expect(evaluateCronAuth("s3cret", "Bearer s3cret").ok).toBe(true);
  });

  test("a wrong bearer is rejected with 401", () => {
    const v = evaluateCronAuth("s3cret", "Bearer nope");
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.status).toBe(401);
  });

  test("a missing or malformed Authorization header is rejected", () => {
    expect(evaluateCronAuth("s3cret", null).ok).toBe(false);
    expect(evaluateCronAuth("s3cret", "").ok).toBe(false);
    expect(evaluateCronAuth("s3cret", "s3cret").ok).toBe(false); // no "Bearer "
    expect(evaluateCronAuth("s3cret", "Basic s3cret").ok).toBe(false);
  });

  test("a prefix of the secret does not pass", () => {
    expect(evaluateCronAuth("s3cret", "Bearer s3cre").ok).toBe(false);
    expect(evaluateCronAuth("s3cret", "Bearer s3cretX").ok).toBe(false);
  });

  test("comparison is not case- or whitespace-forgiving", () => {
    expect(evaluateCronAuth("s3cret", "Bearer S3CRET").ok).toBe(false);
    expect(evaluateCronAuth("s3cret", "Bearer  s3cret").ok).toBe(false);
  });
});
