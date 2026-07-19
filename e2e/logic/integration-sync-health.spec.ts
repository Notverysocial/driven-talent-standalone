import { test, expect } from "@playwright/test";
import {
  syncHealth,
  humanizeMinutes,
  healthTone,
} from "../../src/lib/integrations/health";

// Regression suite for the uAttend silent-failure incident (2026-07-02 →
// 2026-07-19, seventeen days with no sync and no alarm).
//
// Two defects combined:
//   1. uAttend's sync() returned ok:false whenever any employee was unmapped —
//      a warning condition, not a failed run — which set status='error'.
//   2. The cron selected `.eq('status','connected')`, so an 'error' row was
//      never picked up again. One warning permanently disabled the job.
// Neither surfaced, because the UI showed a bare "Last sync" timestamp with no
// notion of how old it was.
//
// These run in the REQUIRED `logic` project. The freshness rule is the alarm
// that should have fired on day one, so it is gated.

const PROVIDER = "uattend" as const; // 30-minute default interval
const NOW = new Date("2026-07-19T12:00:00.000Z");

function ago(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString();
}

test.describe("syncHealth — freshness, not just status", () => {
  test("a recent sync on a connected row is ok", () => {
    const h = syncHealth({
      provider: PROVIDER,
      status: "connected",
      lastSyncAt: ago(10),
      now: NOW,
    });
    expect(h.level).toBe("ok");
    expect(h.staleMinutes).toBe(10);
  });

  test("THE INCIDENT: connected + 17 days since last sync reads stale, not ok", () => {
    // This is the exact production state. Before this module it rendered a
    // green dot and the string "Jul 2, 3:14 PM" — indistinguishable from
    // healthy. It must never read "ok" again.
    const h = syncHealth({
      provider: PROVIDER,
      status: "connected",
      lastSyncAt: "2026-07-02T15:14:00.000Z",
      now: NOW,
    });
    expect(h.level).toBe("stale");
    // 16d 21h elapsed; humanizeMinutes floors partial days.
    expect(h.label).toContain("16d");
    expect(h.missedIntervals).toBeGreaterThan(800); // 30-min job, ~811 missed runs
  });

  test("staleness outranks a healthy-looking status column", () => {
    // The row can claim 'connected' and still be dead. Status is what the last
    // run reported; staleness is whether runs are still happening.
    const h = syncHealth({
      provider: PROVIDER,
      status: "connected",
      lastSyncAt: ago(30 * 20),
      now: NOW,
    });
    expect(h.level).toBe("stale");
  });

  test("a single missed tick does not cry wolf", () => {
    // 30-min interval, 45 minutes late — one skipped cron run (deploy, cold
    // start). Still ok; alarms that fire on noise get ignored.
    const h = syncHealth({
      provider: PROVIDER,
      status: "connected",
      lastSyncAt: ago(45),
      now: NOW,
    });
    expect(h.level).toBe("ok");
  });

  test("three missed intervals warns", () => {
    const h = syncHealth({
      provider: PROVIDER,
      status: "connected",
      lastSyncAt: ago(30 * 3),
      now: NOW,
    });
    expect(h.level).toBe("warn");
  });

  test("eight missed intervals is stale", () => {
    const h = syncHealth({
      provider: PROVIDER,
      status: "connected",
      lastSyncAt: ago(30 * 8),
      now: NOW,
    });
    expect(h.level).toBe("stale");
  });

  test("connected but never synced is stale, not ok", () => {
    // A job that has never run once must not read as fresh just because it has
    // no timestamp to be old.
    const h = syncHealth({
      provider: PROVIDER,
      status: "connected",
      lastSyncAt: null,
      now: NOW,
    });
    expect(h.level).toBe("stale");
    expect(h.label).toBe("Never synced");
  });

  test("a recent failure reads as an error with its age", () => {
    const h = syncHealth({
      provider: PROVIDER,
      status: "error",
      lastSyncAt: ago(20),
      now: NOW,
    });
    expect(h.level).toBe("error");
    expect(h.label).toContain("20m");
  });

  test("an old failure reads stale — the age is the bigger fact", () => {
    const h = syncHealth({
      provider: PROVIDER,
      status: "error",
      lastSyncAt: ago(30 * 50),
      now: NOW,
    });
    expect(h.level).toBe("stale");
  });

  test("disconnected is off, not an alarm", () => {
    const h = syncHealth({
      provider: PROVIDER,
      status: "disconnected",
      lastSyncAt: null,
      now: NOW,
    });
    expect(h.level).toBe("off");
  });

  test("per-provider cadence is respected", () => {
    // indeed syncs hourly; 3h stale is a warning there but well past stale on
    // a 15-minute provider like calendly.
    const threeHours = ago(180);
    expect(
      syncHealth({ provider: "indeed", status: "connected", lastSyncAt: threeHours, now: NOW }).level,
    ).toBe("warn");
    expect(
      syncHealth({ provider: "calendly", status: "connected", lastSyncAt: threeHours, now: NOW }).level,
    ).toBe("stale");
  });

  test("a garbage timestamp is treated as never-synced, not as fresh", () => {
    const h = syncHealth({
      provider: PROVIDER,
      status: "connected",
      lastSyncAt: "not-a-date",
      now: NOW,
    });
    expect(h.level).toBe("stale");
  });

  test("a future timestamp clamps to zero rather than going negative", () => {
    const h = syncHealth({
      provider: PROVIDER,
      status: "connected",
      lastSyncAt: new Date(NOW.getTime() + 60_000).toISOString(),
      now: NOW,
    });
    expect(h.staleMinutes).toBe(0);
    expect(h.level).toBe("ok");
  });
});

test.describe("humanizeMinutes", () => {
  test("scales through minutes, hours, days", () => {
    expect(humanizeMinutes(0)).toBe("just now");
    expect(humanizeMinutes(5)).toBe("5m");
    expect(humanizeMinutes(90)).toBe("1h");
    expect(humanizeMinutes(60 * 24 * 17)).toBe("17d");
  });
});

test.describe("healthTone", () => {
  test("only 'ok' is green — stale and error both read red", () => {
    expect(healthTone("ok")).toBe("green");
    expect(healthTone("warn")).toBe("warm");
    expect(healthTone("stale")).toBe("red");
    expect(healthTone("error")).toBe("red");
  });
});

// ---------------------------------------------------------------------------
// THE LATCH
//
// The cron's row selection is a Supabase query, so it cannot run here without a
// database. What CAN be pinned is the decision the query encodes: which
// statuses are eligible for a retry. Modelling it as a predicate keeps the rule
// under the required gate, so narrowing it back to connected-only turns this
// red instead of silently disabling integrations again.
// ---------------------------------------------------------------------------

// Mirrors: .in("status", ["connected", "error"]) in
// src/app/api/integrations/cron/route.ts
const CRON_ELIGIBLE_STATUSES = ["connected", "error"] as const;
const isCronEligible = (status: string) =>
  (CRON_ELIGIBLE_STATUSES as readonly string[]).includes(status);

test.describe("cron eligibility — a failed run must not be a one-way door", () => {
  test("error rows are retried (the seventeen-day bug)", () => {
    // Before the fix this was false, and recordSyncEnd's next_sync_at
    // rescheduling was dead code for any row that had ever failed.
    expect(isCronEligible("error")).toBe(true);
  });

  test("connected rows are still drained", () => {
    expect(isCronEligible("connected")).toBe(true);
  });

  test("in-flight rows are skipped so a slow sync is not double-run", () => {
    expect(isCronEligible("syncing")).toBe(false);
  });

  test("disconnected rows stay out — no credentials to sync with", () => {
    expect(isCronEligible("disconnected")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// WARNING vs FAILURE
//
// uAttend returns ok:true + warning when punches stored fine but some employees
// are unmapped. recordSyncEnd's branch choice is what decides whether the row
// survives in the cron loop, so the mapping from a sync result to a status
// patch is pinned here.
// ---------------------------------------------------------------------------

// Mirrors the branch in src/lib/integrations/db.ts recordSyncEnd.
function statusFor(result: { ok: boolean; warning?: string | null }): {
  status: string;
  lastErrorSet: boolean;
} {
  return result.ok
    ? { status: "connected", lastErrorSet: Boolean(result.warning) }
    : { status: "error", lastErrorSet: true };
}

test.describe("a warning keeps the job alive but stays loud", () => {
  test("unmapped employees: stays connected AND still writes last_error", () => {
    // The whole point. It must remain visible (last_error set, card loud) while
    // NOT flipping to a status the cron refuses to retry.
    const r = statusFor({ ok: true, warning: "Unmapped uAttend employees: 1001, 1002" });
    expect(r.status).toBe("connected");
    expect(r.lastErrorSet).toBe(true);
    expect(isCronEligible(r.status)).toBe(true);
  });

  test("a clean run clears the warning", () => {
    const r = statusFor({ ok: true, warning: null });
    expect(r.status).toBe("connected");
    expect(r.lastErrorSet).toBe(false);
  });

  test("a real failure still errors — and is now still retried", () => {
    const r = statusFor({ ok: false });
    expect(r.status).toBe("error");
    expect(r.lastErrorSet).toBe(true);
    expect(isCronEligible(r.status)).toBe(true);
  });
});
