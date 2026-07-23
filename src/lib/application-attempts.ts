// The dead-letter office for public-site applications, as pure logic.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS
//
// The public site writes an `application_submission_attempts` row BEFORE it
// forwards an application, so that a crash mid-flight still leaves a record of
// who tried to apply. Its migration says plainly:
//
//   "Rows with status pending or failed are applications that may never have
//    reached application_intakes — work them by hand."
//
// There was no way to work them by hand. `grep -rn application_submission_attempts
// src/` in this repo returned nothing (reconcile, 2026-07-22). The site
// correctly refuses to tell an applicant "we got it" when nothing landed, and
// then the recruiter never learns that person exists. A dead letter office with
// the door welded shut.
//
// Pure, so the classification that decides whether a lost applicant is shown or
// hidden runs in the required CI gate.
// ---------------------------------------------------------------------------

/** The four statuses the site writes. See the migration for the contract. */
export type AttemptStatus =
  /** Written, forward not yet resolved. A STUCK one means a crash. */
  | "pending"
  /** The intake endpoint accepted it. Normal path. */
  | "forwarded"
  /** Forward failed; the site wrote application_intakes directly. */
  | "recovered"
  /** Nothing landed. This row IS the only record. Replay by hand. */
  | "failed";

/** How long a `pending` row may sit before it is presumed crashed. The forward
 *  is a single HTTP call — anything still pending after this never resolved. */
export const STUCK_PENDING_MINUTES = 15;

export const ATTEMPT_STATUS_LABEL: Record<AttemptStatus, string> = {
  pending: "In flight",
  forwarded: "Landed",
  recovered: "Recovered by site",
  failed: "LOST — never landed",
};

export const ATTEMPT_STATUS_TONE: Record<AttemptStatus, string> = {
  pending: "amber",
  forwarded: "green",
  recovered: "warm",
  failed: "red",
};

export type AttemptRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  position_of_interest: string | null;
  status: string;
  detail: string | null;
  intake_id: string | null;
  has_resume: boolean;
  resume_filename: string | null;
  source: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  resolved_at: string | null;
};

export function isAttemptStatus(v: string): v is AttemptStatus {
  return ["pending", "forwarded", "recovered", "failed"].includes(v);
}

/**
 * Does a human have to do something about this row?
 *
 * THE TRAP: `status` is what the site BELIEVED; `intake_id` is the evidence.
 * A row marked `forwarded` with no intake_id did not land — trusting the label
 * over the evidence is exactly how a lost application hides in the resolved
 * pile. So a resolved status only counts as resolved when it points at a row.
 */
export function attemptNeedsAttention(r: AttemptRow): boolean {
  if (r.status === "pending" || r.status === "failed") return true;
  if (r.status === "forwarded" || r.status === "recovered") return !r.intake_id;
  // An unknown status is not something to quietly ignore.
  return true;
}

/** A `pending` row older than the window — the site crashed mid-forward. */
export function isStuckPending(r: AttemptRow, now: Date): boolean {
  if (r.status !== "pending") return false;
  const t = Date.parse(r.created_at);
  if (Number.isNaN(t)) return false; // a bad timestamp must not crash the page
  return now.getTime() - t > STUCK_PENDING_MINUTES * 60_000;
}

/** Every way we can reach this person. Empty means we cannot — the worst case,
 *  and the one that must never render as a blank cell. */
export function contactableFrom(r: AttemptRow): string[] {
  const out: string[] = [];
  if (r.phone?.trim()) out.push(r.phone.trim());
  if (r.email?.trim()) out.push(r.email.trim());
  return out;
}

/** Split for the recovery list. Order is preserved so "oldest first" upstream
 *  still means oldest first here. */
export function partitionAttempts(rows: AttemptRow[]): {
  needsAttention: AttemptRow[];
  resolved: AttemptRow[];
} {
  const needsAttention: AttemptRow[] = [];
  const resolved: AttemptRow[] = [];
  for (const r of rows) (attemptNeedsAttention(r) ? needsAttention : resolved).push(r);
  return { needsAttention, resolved };
}
