// Who is allowed to overwrite a time card, and which weeks a scheduled pull
// covers. Pure so it runs in the required `logic` gate — this decides whether
// an automated job can rewrite hours an invoice was built from, which is not a
// rule that should live only inside a server function nothing can test.

import type { TimecardStatus } from "@/lib/supabase/types";
import { mondayOf } from "./contract";

/**
 * Who triggered an ingest.
 *
 * - `manual`   — Rocio clicking "Pull week" in Reports. Force semantics,
 *                unchanged: re-pulling a week to fix it is a legitimate
 *                operation and a human is looking at the result.
 * - `scheduled`— the cron. Never overwrites a time card a human has acted on.
 *
 * The split is deliberate and explicit rather than inferred from context: an
 * automated job that silently rewrites approved payroll is a different risk
 * from a person doing it on purpose, and the caller always knows which it is.
 */
export type IngestTrigger = "manual" | "scheduled";

// A scheduled pull may only touch cards still in `draft`. Everything else has
// been acted on by a human:
//   submitted — awaiting approval; overwriting changes what someone submitted
//   approved  — previewInvoicesForPeriod reads exactly these; overwriting moves
//               invoice amounts with no operator action
//   rejected  — a deliberate decision; re-pulling would erase the evidence
// Skipped cards are REPORTED, never dropped quietly — that is the difference
// between a guard and a silent no-op.
const SCHEDULED_WRITABLE_STATUSES: readonly TimecardStatus[] = ["draft"];

export function mayOverwriteTimecard(input: {
  trigger: IngestTrigger;
  existingStatus: TimecardStatus | null;
}): boolean {
  // No existing card — this is an insert, always allowed.
  if (input.existingStatus === null) return true;
  if (input.trigger === "manual") return true;
  return SCHEDULED_WRITABLE_STATUSES.includes(input.existingStatus);
}

/**
 * Weeks a scheduled run covers: the current week plus the previous one.
 * Late punches are normal in this business, so a run that only looked at the
 * current week would permanently miss anything entered after the week rolled.
 *
 * Returned oldest-first so a run's later weeks overwrite earlier ones on any
 * overlap rather than the reverse.
 */
export function scheduledPullWindows(todayIso: string): string[] {
  const current = mondayOf(todayIso);
  const previous = mondayOf(
    new Date(new Date(`${current}T00:00:00`).getTime() - 7 * 86_400_000)
      .toISOString()
      .slice(0, 10),
  );
  return [previous, current];
}
