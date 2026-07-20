// Deciding how many minutes an employee actually WORKED on one day, from the
// uAttend punch report's day-level line items.
//
// Pure — no "server-only", no network, no database — so this arithmetic, which
// money is computed from, runs in the required CI gate.
//
// ---------------------------------------------------------------------------
// THE RULE
//
//     worked = Σ(Regular paycode-1 Tot)  −  Σ(meal/break paycode-6,7 Tot)
//
// Nothing is reconstructed, inferred, or defaulted. The meal is subtracted
// because it was punched, at the duration it was punched.
//
// ---------------------------------------------------------------------------
// WHY, AND WHAT THE PRODUCTION DATA PROVED (measured 2026-07-20)
//
// Reported: a Monday reading 8.47 h that should have read 7.95 h.
//
// The previous ingest DISCARDED the meal/break lines and reconstructed the
// unpaid meal as a RESIDUAL:
//
//     lunchMin = span(firstIn → lastOut) − regularTot
//
// which is correct only if the vendor's Regular `Tot` is already NET of the
// meal — an assumption a code comment asserted and `contract.ts` flagged as
// unconfirmed. It is FALSE. Measured against live prod:
//
//   * paycode 1 (Regular): Tot == (OutTime − InTime) on 772 of 772 rows,
//                          mean difference 0.000, max difference 0.00
//   * paycode 7 (meal)   : Tot == span exactly, on all 656 rows
//
// `Tot` IS the raw span, with zero exceptions. So the residual evaluated to
// exactly 0 every single time and the meal was billed. A residual cannot
// detect its own failure — it just degrades to zero.
//
// Two further facts from that measurement shape this module:
//
//   1. The meal lines DO come back — 656 rows, present on 328 of 377
//      employee-days. There is nothing to reconstruct; subtract the real line.
//   2. The meal is NOT 30 minutes. It averages 1.031 h and varies per row
//      (1.00, 1.06, …), so any hardcoded or default deduction is also wrong.
//      LUNCH_DEFAULT_MIN must never be applied to ingested data.
//
// And the shape that a "clever" heuristic gets wrong: days routinely carry
// MULTIPLE Regular lines, with the meal line nested inside the worked span
// rather than sitting in a gap between segments. Real rows, Mon 2026-06-22:
//
//     Aide Clemente     17.00 − 1.00 lunch = 16.00
//     Alexis Garcia     17.06 − 1.06 lunch = 16.00
//     Alondra Barajas   16.86 − 1.06 lunch = 15.80
//     Audiel Montiel    17.04 − 1.00 lunch = 16.04
//
// So a multi-line day must STILL have its meal subtracted. Treating "more than
// one Regular line" as a split shift and skipping the deduction would leave
// Aide Clemente at 17.00 — the original bug, on the majority of real days.
// ---------------------------------------------------------------------------

/** Rounding slack, in minutes. Vendor `Tot` is 2dp hours (0.01 h = 0.6 min). */
export const RECONCILE_TOLERANCE_MIN = 2;

/** uAttend paycodes. 1=Regular 2=Vac 3=Sick 4=Holiday 5=Other 6=Break 7=Lunch. */
export const REGULAR_PAYCODE = 1;
export const MEAL_PAYCODES = [6, 7] as const;

export function isRegularPaycode(id: number | null | undefined): boolean {
  // A missing paycode is treated as Regular, matching the punch normalizer.
  return id == null || id === REGULAR_PAYCODE;
}
export function isMealPaycode(id: number | null | undefined): boolean {
  return id != null && (MEAL_PAYCODES as readonly number[]).includes(id);
}

/** One line item from /reports/punch, already normalized. */
export type PunchLine = {
  paycodeId: number | null;
  /** The vendor's `Tot`, in decimal hours. */
  hours: number;
  punchIn: string | null;  // "HH:MM"
  punchOut: string | null; // "HH:MM"
};

export type WorkedResolution = {
  /** Minutes actually worked — what the client is billed for. */
  workedMin: number;
  /** Minutes of unpaid meal/break that were punched and subtracted. */
  mealMin: number;
  /** Σ Regular `Tot`, in minutes, before the meal is taken off. */
  grossMin: number;
  /** Earliest Regular punch-in / latest Regular punch-out of the day. */
  in: string | null;
  out: string | null;
  /** What to store as the day's `lunch_min`, chosen so the timecard grid's own
   *  derivation (span − lunch_min) reproduces `workedMin` exactly. Null when
   *  there is no usable span to hang it on. */
  lunchMin: number | null;
  /** Set when this day did not reconcile cleanly and a human should look. */
  ambiguous: boolean;
  /** Why it was flagged. Empty when it reconciled. */
  reasons: string[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Minutes since midnight for "HH:MM", or null. */
function hm(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t).trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** In → Out span in minutes, handling a shift that crosses midnight. */
export function spanMinutes(inT: string | null, outT: string | null): number | null {
  const a = hm(inT);
  const b = hm(outT);
  if (a == null || b == null) return null;
  let s = b - a;
  if (s < 0) s += 24 * 60;
  return s;
}

/**
 * Resolve one employee-day from its punch lines.
 *
 * Deliberately has no gross/net heuristic. Production proved `Tot` is always
 * the raw span, so the rule is a straight subtraction that a SQL query can
 * reproduce line for line — which is how this gets verified against prod.
 *
 * Instead of guessing, it CANARIES the assumption: every Regular line whose
 * `Tot` stops matching its own In→Out span is flagged. If uAttend ever
 * switches to a net `Tot`, that shows up as a list of flagged days rather than
 * as a silent 5.4% swing in the other direction.
 */
export function resolveWorkedMinutes(lines: PunchLine[]): WorkedResolution {
  let grossMin = 0;
  let mealMin = 0;
  let inT: string | null = null;
  let outT: string | null = null;
  const reasons: string[] = [];

  for (const l of lines) {
    const mins = Math.max(0, (Number(l.hours) || 0) * 60);

    if (isMealPaycode(l.paycodeId)) {
      mealMin += mins;
      continue;
    }
    if (!isRegularPaycode(l.paycodeId)) continue; // vac / sick / holiday / other

    grossMin += mins;

    // Earliest in, latest out BY CLOCK VALUE — the punch report's row order is
    // not guaranteed, so "last row wins" could take an earlier Out.
    if (l.punchIn && (inT == null || l.punchIn < inT)) inT = l.punchIn;
    if (l.punchOut && (outT == null || l.punchOut > outT)) outT = l.punchOut;

    // Canary on the proven invariant: Tot == this line's own span.
    const lineSpan = spanMinutes(l.punchIn, l.punchOut);
    if (lineSpan != null && Math.abs(lineSpan - mins) > RECONCILE_TOLERANCE_MIN) {
      reasons.push(
        `regular line Tot ${round2(mins / 60)}h != its own span ${round2(lineSpan / 60)}h`,
      );
    }
  }

  const workedMin = Math.max(0, grossMin - mealMin);

  if (mealMin > grossMin) {
    reasons.push(`meal ${round2(mealMin / 60)}h exceeds regular ${round2(grossMin / 60)}h`);
  }

  // Store lunch_min as the leftover of the day's outer span, so the grid's own
  // `span − lunch_min` derivation reproduces workedMin instead of re-applying
  // the 30-minute default on top of an already-correct number.
  const daySpan = spanMinutes(inT, outT);
  let lunchMin: number | null = null;
  if (daySpan != null) {
    lunchMin = Math.max(0, Math.round(daySpan - workedMin));
    if (workedMin > daySpan + RECONCILE_TOLERANCE_MIN) {
      // The grid derives from the span, so it cannot display more than the
      // span. Flag rather than let the UI silently disagree with the ingest.
      reasons.push(
        `worked ${round2(workedMin / 60)}h exceeds the day span ${round2(daySpan / 60)}h`,
      );
    }
  }

  return {
    workedMin,
    mealMin,
    grossMin,
    in: inT,
    out: outT,
    lunchMin,
    ambiguous: reasons.length > 0,
    reasons,
  };
}

/** Worked hours as decimal hours, rounded the way the timecard grid rounds. */
export function workedHours(lines: PunchLine[]): number {
  return round2(resolveWorkedMinutes(lines).workedMin / 60);
}
