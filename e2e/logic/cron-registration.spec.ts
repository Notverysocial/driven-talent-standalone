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

// ---------------------------------------------------------------------------
// EVERY PUBLIC SCHEDULED-JOB ROUTE MUST ACTUALLY CALL THE FAIL-CLOSED HELPER
//
// evaluateCronAuth being correct (tested below) protects nothing if a route
// doesn't call it. That is exactly how /api/workflows/tick survived PR #68: it is
// allowlisted in proxy.ts but NOT in vercel.json, so it was never in CRON_PATHS,
// so nothing here looked at it — and it kept its own
//
//     const expected = process.env.WORKFLOWS_TICK_SECRET;
//     if (expected) { ... }
//
// with that secret never set in production. A public URL, open to anyone, in
// front of processScheduledJobs — which as of 2026-09-11 runs as service_role.
//
// So this reads the ROUTE SOURCE and asserts the call is really there. The list
// is CRON_PATHS plus every other scheduled-job path allowlisted in the proxy.
// ---------------------------------------------------------------------------

/** Scheduled-job paths that are public in proxy.ts but deliberately NOT crons. */
const PUBLIC_SCHEDULED_NOT_CRON = ["/api/workflows/tick"] as const;

/**
 * Route source with comments removed, so the guard judges LIVE code only.
 *
 * Without this, a route that documents the old bug in its own header — quoting
 * `if (expected)` to explain why it no longer does it — reads as guilty of it.
 * Both uattend-weekly and workflows/tick do exactly that, and both tripped this
 * guard on their comments while their live code was already fail-closed.
 *
 * Strips WHOLE-LINE `//` comments and `/* *\/` blocks only. Deliberately not
 * every `//`: that would mangle strings like "https://…". The cost is that an
 * inline trailing comment mentioning `if (expected)` still trips the guard — but
 * that fails LOUD. This can only ever over-report; it can never let a fail-open
 * route pass.
 */
function liveCode(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");
}

function routeSource(apiPath: string): string {
  const raw = readFileSync(
    join(process.cwd(), "src", "app", ...apiPath.split("/").filter(Boolean), "route.ts"),
    "utf8",
  );
  return liveCode(raw);
}

test.describe("every public scheduled-job route fails closed", () => {
  for (const p of [...CRON_PATHS, ...PUBLIC_SCHEDULED_NOT_CRON]) {
    test(`${p} calls checkCronAuth and has no fail-open secret check`, () => {
      const src = routeSource(p);
      expect(src, `${p} must call checkCronAuth(request)`).toMatch(/checkCronAuth\(\s*request\s*\)/);
      // The exact fail-open shape: read a secret, then only check "if" it exists.
      expect(src, `${p} must not skip auth when a secret is unset`).not.toMatch(
        /if\s*\(\s*expected\s*\)/,
      );
      expect(src, `${p} must not use a private per-route secret`).not.toMatch(/WORKFLOWS_TICK_SECRET/);
    });
  }

  test("/api/workflows/tick is public in the proxy but stays OUT of CRON_PATHS", () => {
    // It is not scheduled, so listing it in CRON_PATHS would trip the orphan
    // check above. It is still reachable, which is why it must fail closed.
    const proxy = readFileSync(join(process.cwd(), "src", "proxy.ts"), "utf8");
    expect(proxy).toContain('"/api/workflows/tick"');
    expect(isCronPath("/api/workflows/tick")).toBe(false);
  });
});

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
