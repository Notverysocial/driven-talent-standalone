import { test, expect } from "@playwright/test";
import {
  ATTEMPT_STATUS_LABEL,
  ATTEMPT_STATUS_TONE,
  STUCK_PENDING_MINUTES,
  attemptNeedsAttention,
  contactableFrom,
  isStuckPending,
  partitionAttempts,
} from "../../src/lib/application-attempts";

// application_submission_attempts is written by the public site and read by
// nobody.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS (reconcile 2026-07-22)
//
// The site writes an attempt row BEFORE forwarding an application, precisely so
// that a crash mid-flight still leaves a record of who tried to apply. Its own
// migration says: "Rows with status pending or failed are applications that may
// never have reached application_intakes — work them by hand."
//
// There was no way to work them by hand. `grep -rn application_submission_attempts
// src/` in this repo returned nothing. The table is a dead letter office with
// the door welded shut: the site correctly refuses to tell an applicant "we got
// it" when nothing landed, and the recruiter still never learns they exist.
//
// The four statuses, from the migration:
//   pending   — written, forward not yet resolved (a STUCK row means a crash)
//   forwarded — the intake endpoint accepted it (normal path)
//   recovered — forward failed, the site wrote application_intakes directly
//   failed    — nothing landed; this row IS the only record. Replay by hand.
// ---------------------------------------------------------------------------

const at = (over: Record<string, unknown> = {}) => ({
  id: "a1",
  full_name: "Test Applicant",
  email: "a@example.com",
  phone: "(909) 555-0000",
  city: "Chino, CA",
  position_of_interest: "Forklift",
  status: "failed",
  detail: "multipart HTTP 500 -> json HTTP 500",
  intake_id: null,
  has_resume: true,
  resume_filename: "cv.pdf",
  source: "public-site-jobseekers-form",
  payload: {},
  created_at: "2026-07-22T10:00:00Z",
  resolved_at: null,
  ...over,
});

test.describe("attemptNeedsAttention — which rows a recruiter must work", () => {
  test("THE POINT: a failed attempt needs attention", () => {
    expect(attemptNeedsAttention(at({ status: "failed" }))).toBe(true);
  });

  test("a pending attempt needs attention — it may be a crash mid-flight", () => {
    expect(attemptNeedsAttention(at({ status: "pending" }))).toBe(true);
  });

  test("a forwarded attempt that actually landed does NOT", () => {
    expect(
      attemptNeedsAttention(at({ status: "forwarded", intake_id: "i1" })),
    ).toBe(false);
  });

  test("a recovered attempt that landed does NOT", () => {
    expect(
      attemptNeedsAttention(at({ status: "recovered", intake_id: "i1" })),
    ).toBe(false);
  });

  test("THE TRAP: 'forwarded' with no intake_id still needs attention", () => {
    // The status column is what the site *believed*; intake_id is the evidence.
    // Trusting the label over the evidence is how a lost application hides in
    // the resolved pile.
    expect(
      attemptNeedsAttention(at({ status: "forwarded", intake_id: null })),
    ).toBe(true);
  });
});

test.describe("isStuckPending — a pending row that never resolved", () => {
  const now = new Date("2026-07-22T12:00:00Z");

  test("pending for longer than the window is stuck", () => {
    expect(
      isStuckPending(at({ status: "pending", created_at: "2026-07-22T10:00:00Z" }), now),
    ).toBe(true);
  });

  test("just-created pending is not yet stuck — it may still be in flight", () => {
    const fresh = new Date(now.getTime() - (STUCK_PENDING_MINUTES - 1) * 60_000);
    expect(
      isStuckPending(at({ status: "pending", created_at: fresh.toISOString() }), now),
    ).toBe(false);
  });

  test("a resolved status is never 'stuck' whatever its age", () => {
    expect(
      isStuckPending(
        at({ status: "forwarded", intake_id: "i1", created_at: "2020-01-01T00:00:00Z" }),
        now,
      ),
    ).toBe(false);
  });

  test("an unparseable created_at does not crash the page", () => {
    expect(isStuckPending(at({ status: "pending", created_at: "not-a-date" }), now)).toBe(false);
  });
});

test.describe("contactableFrom — can a recruiter actually reach this person?", () => {
  test("a row with a phone is contactable", () => {
    expect(contactableFrom(at({ phone: "(909) 555-0000", email: null })).length).toBeGreaterThan(0);
  });

  test("a row with only an email is contactable", () => {
    expect(contactableFrom(at({ phone: null, email: "a@example.com" })).length).toBeGreaterThan(0);
  });

  test("THE WORST CASE: a row with neither is surfaced as uncontactable", () => {
    // This is the row that proves the whole table matters — somebody tried to
    // apply and we cannot reach them. It must not render as an empty cell.
    expect(contactableFrom(at({ phone: null, email: null }))).toEqual([]);
  });
});

test.describe("partitionAttempts — the recovery list", () => {
  test("splits needs-attention from resolved, losing nothing", () => {
    const rows = [
      at({ id: "1", status: "failed" }),
      at({ id: "2", status: "pending" }),
      at({ id: "3", status: "forwarded", intake_id: "i" }),
      at({ id: "4", status: "recovered", intake_id: "i" }),
      at({ id: "5", status: "forwarded", intake_id: null }),
    ];
    const { needsAttention, resolved } = partitionAttempts(rows);
    expect(needsAttention.map((r) => r.id)).toEqual(["1", "2", "5"]);
    expect(resolved.map((r) => r.id)).toEqual(["3", "4"]);
    expect(needsAttention.length + resolved.length).toBe(rows.length);
  });

  test("an empty list is not an error", () => {
    expect(partitionAttempts([])).toEqual({ needsAttention: [], resolved: [] });
  });

  test("every status has a label and a tone", () => {
    for (const s of ["pending", "forwarded", "recovered", "failed"] as const) {
      expect(ATTEMPT_STATUS_LABEL[s], s).toBeTruthy();
      expect(ATTEMPT_STATUS_TONE[s], s).toBeTruthy();
    }
  });
});
