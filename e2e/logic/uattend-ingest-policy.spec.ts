import { test, expect } from "@playwright/test";
import {
  mayOverwriteTimecard,
  scheduledPullWindows,
} from "../../src/lib/uattend/ingest-policy";
import type { TimecardStatus } from "../../src/lib/supabase/types";

// The payroll-corruption guard on the scheduled uAttend pull.
//
// importUattendTimecards upserts on (employee_id, client_id, week_start), so it
// cannot duplicate a card — but its UPDATE was unconditional and never looked at
// `timecards.status`. previewInvoicesForPeriod reads status='approved' cards, so
// an automated re-pull could rewrite reg_hours/ot_hours underneath a draft
// invoice and move its total with no operator action.
//
// The split is manual=force / scheduled=guarded, deliberately: Rocio re-pulling
// a week to fix it is legitimate and must keep working exactly as before; a cron
// doing the same thing at 4am is not.
//
// Required `logic` gate — flipping the guard off turns this red.

const ALL_STATUSES: TimecardStatus[] = [
  "draft",
  "submitted",
  "approved",
  "rejected",
];

test.describe("mayOverwriteTimecard — scheduled runs", () => {
  test("a draft may be overwritten — that is the normal path", () => {
    expect(
      mayOverwriteTimecard({ trigger: "scheduled", existingStatus: "draft" }),
    ).toBe(true);
  });

  test("THE GUARD: an approved card is never overwritten by the cron", () => {
    // This is the one that moves money. previewInvoicesForPeriod reads approved
    // cards with onlyApproved:true.
    expect(
      mayOverwriteTimecard({ trigger: "scheduled", existingStatus: "approved" }),
    ).toBe(false);
  });

  test("a submitted card is not overwritten — someone submitted those hours", () => {
    expect(
      mayOverwriteTimecard({ trigger: "scheduled", existingStatus: "submitted" }),
    ).toBe(false);
  });

  test("a rejected card is not overwritten — the rejection is a decision", () => {
    expect(
      mayOverwriteTimecard({ trigger: "scheduled", existingStatus: "rejected" }),
    ).toBe(false);
  });

  test("a missing card is always an insert, whatever the trigger", () => {
    expect(
      mayOverwriteTimecard({ trigger: "scheduled", existingStatus: null }),
    ).toBe(true);
    expect(
      mayOverwriteTimecard({ trigger: "manual", existingStatus: null }),
    ).toBe(true);
  });

  test("draft is the ONLY status a scheduled run may write over", () => {
    // Pinned exhaustively: adding a new TimecardStatus later must be a
    // deliberate decision here, not an accidental widening of what the cron
    // can rewrite.
    const writable = ALL_STATUSES.filter((s) =>
      mayOverwriteTimecard({ trigger: "scheduled", existingStatus: s }),
    );
    expect(writable).toEqual(["draft"]);
  });
});

test.describe("mayOverwriteTimecard — manual runs keep force semantics", () => {
  test("every status stays overwritable by hand", () => {
    // Rocio's workflow must not change as a side effect of adding a cron.
    for (const status of ALL_STATUSES) {
      expect(
        mayOverwriteTimecard({ trigger: "manual", existingStatus: status }),
        `manual overwrite of ${status}`,
      ).toBe(true);
    }
  });

  test("manual and scheduled genuinely differ on approved", () => {
    // If these ever agree, either the guard is gone or the manual path was
    // narrowed — both are regressions, in opposite directions.
    expect(
      mayOverwriteTimecard({ trigger: "manual", existingStatus: "approved" }),
    ).not.toBe(
      mayOverwriteTimecard({ trigger: "scheduled", existingStatus: "approved" }),
    );
  });
});

test.describe("scheduledPullWindows — current + previous week", () => {
  test("returns exactly two weeks, oldest first", () => {
    const w = scheduledPullWindows("2026-07-19"); // a Sunday
    expect(w).toHaveLength(2);
    expect(w[0] < w[1]).toBe(true);
  });

  // DT's pay week is Sun–Sat, so a pull window must open on a SUNDAY. This
  // asserted Mondays until 2026-07-20 — the boundary bug Antonio reported.
  test("both entries are Sundays", () => {
    for (const day of ["2026-07-13", "2026-07-15", "2026-07-19"]) {
      for (const ws of scheduledPullWindows(day)) {
        expect(new Date(`${ws}T00:00:00`).getDay(), `${ws} from ${day}`).toBe(0);
      }
    }
  });

  test("the windows are exactly 7 days apart", () => {
    const [prev, cur] = scheduledPullWindows("2026-07-19");
    const days =
      (new Date(`${cur}T00:00:00`).getTime() -
        new Date(`${prev}T00:00:00`).getTime()) /
      86_400_000;
    expect(days).toBe(7);
  });

  test("a run early in the pay week still reaches back a full week", () => {
    // The riskiest day: right after the week turns over the current week is
    // nearly empty, so last week's late punches are the entire point of the
    // second window. Sun–Sat ⇒ Monday Jul 13 sits in the week that opened
    // Sunday Jul 12, and the previous window is Sunday Jul 5.
    const [prev, cur] = scheduledPullWindows("2026-07-13"); // Monday
    expect(cur).toBe("2026-07-12");
    expect(prev).toBe("2026-07-05");
  });

  test("does NOT reach back further — no silent backfill", () => {
    // Three weeks of un-pulled June must stay a visible decision for a human,
    // not something the first scheduled run quietly sweeps up.
    const windows = scheduledPullWindows("2026-07-19");
    expect(windows.every((w) => w >= "2026-07-06")).toBe(true);
    expect(windows).not.toContain("2026-06-29");
    expect(windows).not.toContain("2026-06-22");
  });
});
