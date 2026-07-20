// Deciding how many minutes an employee actually WORKED on one day, from the
// uAttend punch report's day-level line items.
//
// Pure — no "server-only", no network, no database — so this arithmetic, which
// money is computed from, runs in the required CI gate.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS
//
// Reported 2026-07-20: a Monday reading 8.47 h that should have read 7.95 h —
// a 31-minute punched meal being billed to the client.
//
// The previous ingest discarded the meal/break line items (paycodes 6 and 7)
// and reconstructed the unpaid meal as a RESIDUAL:
//
//     lunchMin = span(firstIn → lastOut) − regularTot
//
// That is only correct if the vendor's Regular `Tot` is already NET of the
// meal. When `Tot` is instead the GROSS In→Out span, the residual evaluates to
// exactly 0, the meal is silently added to worked time, and nothing anywhere
// reports a problem. A residual cannot detect its own failure — it just
// degrades to zero. That is the defect this module removes.
//
// The two shapes we must handle, using the reported Monday as the example
// (In 08:00, Out 16:28 ⇒ span 508 min; a 31-minute punched meal):
//
//   NET   — Regular Tot = 7.95 h (477 min). span − reg = 31 ≈ meal. worked = 477.
//   GROSS — Regular Tot = 8.47 h (508 min). span − reg =  0 <  meal. worked = 477.
//
// Both must yield 7.95 h. We distinguish them by comparing the unaccounted gap
// inside the day against the meal that was actually punched, rather than
// assuming either shape.
// ---------------------------------------------------------------------------

/** Rounding slack, in minutes. Vendor `Tot` is 2dp hours (0.01 h = 0.6 min), so
 *  a day summed from a few line items can drift ~1–2 min from the punch span. */
export const RECONCILE_TOLERANCE_MIN = 2;

export type DayPunchAggregate = {
  /** Σ of the day's Regular (paycode 1) `Tot`, in minutes. */
  regMin: number;
  /** Σ of the day's meal/break (paycodes 6, 7) `Tot`, in minutes. Unpaid. */
  mealMin: number;
  /** How many Regular line items the day had. >1 ⇒ a split shift, so the
   *  In→Out span legitimately contains unworked gaps that are not meals. */
  regLines: number;
  /** Earliest Regular punch-in, "HH:MM", or null. */
  in: string | null;
  /** Latest Regular punch-out, "HH:MM", or null. */
  out: string | null;
};

export type WorkedResolution = {
  /** Minutes actually worked — what the client is billed for. */
  workedMin: number;
  /** Minutes to store as the day's `lunch_min`, chosen so the timecard grid's
   *  own derivation (span − lunch_min) reproduces `workedMin` exactly. */
  lunchMin: number | null;
  /** Which shape the vendor's Regular `Tot` turned out to be. */
  basis:
    | "net"            // Tot already excluded the meal
    | "gross"          // Tot included the meal; we subtracted it
    | "no-meal"        // nothing was punched as a meal; nothing to deduct
    | "split-shift"    // multiple Regular segments; trust the summed segments
    | "no-span";       // no usable In/Out; only the summed Tot is available
  /** True when the day did not reconcile cleanly and a human should look. The
   *  ingest surfaces these rather than quietly picking a number. */
  ambiguous: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Minutes since midnight for "HH:MM", or null. */
function hm(t: string | null): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** First-in → last-out span in minutes, handling a shift crossing midnight. */
export function spanMinutes(inT: string | null, outT: string | null): number | null {
  const a = hm(inT);
  const b = hm(outT);
  if (a == null || b == null) return null;
  let s = b - a;
  if (s < 0) s += 24 * 60; // out before in ⇒ crossed midnight
  return s;
}

/**
 * Decide the day's worked minutes and the meal to record against it.
 *
 * The rule, in order:
 *   1. No usable In/Out span      → trust the summed Regular Tot as-is.
 *   2. Split shift (>1 Reg line)  → trust the summed Regular Tot; the gaps
 *                                   between segments are already unpaid, so
 *                                   subtracting the meal again would double-count.
 *   3. No meal punched            → trust the summed Regular Tot. We do NOT
 *                                   invent a default deduction: an employee who
 *                                   genuinely worked through gets paid for it.
 *   4. Meal punched, gap ≈ meal   → Tot was NET. worked = Tot.
 *   5. Meal punched, gap < meal   → Tot was GROSS. worked = Tot − meal.
 */
export function resolveWorkedMinutes(day: DayPunchAggregate): WorkedResolution {
  const regMin = Math.max(0, day.regMin);
  const mealMin = Math.max(0, day.mealMin);
  const span = spanMinutes(day.in, day.out);

  // Store lunch_min as the leftover of the span, so the grid's own
  // `span − lunch_min` derivation reproduces workedMin exactly instead of
  // re-applying the 30-minute default on top.
  const lunchFor = (worked: number) =>
    span == null ? null : Math.max(0, Math.round(span - worked));

  // 1 — nothing to reconcile against.
  if (span == null) {
    return { workedMin: regMin, lunchMin: null, basis: "no-span", ambiguous: false };
  }

  // 2 — split shift: the summed segments already exclude the between-segment gap.
  if (day.regLines > 1) {
    return {
      workedMin: regMin,
      lunchMin: lunchFor(regMin),
      basis: "split-shift",
      // Flag if the segments somehow exceed the outer span — impossible in
      // clean data, so it means the line items disagree with the punches.
      ambiguous: regMin > span + RECONCILE_TOLERANCE_MIN,
    };
  }

  // 3 — no meal was punched; there is nothing to deduct.
  if (mealMin <= 0) {
    return {
      workedMin: regMin,
      lunchMin: lunchFor(regMin),
      basis: "no-meal",
      ambiguous: regMin > span + RECONCILE_TOLERANCE_MIN,
    };
  }

  // 4 / 5 — a meal was punched. How much of it is already excluded from Tot?
  const gap = span - regMin;

  if (gap >= mealMin - RECONCILE_TOLERANCE_MIN) {
    // The meal is already carved out of Tot.
    return { workedMin: regMin, lunchMin: lunchFor(regMin), basis: "net", ambiguous: false };
  }

  // Tot still contains some or all of the meal. Subtract what is not yet
  // accounted for, so this is right at both extremes and in between.
  const worked = Math.max(0, regMin - (mealMin - Math.max(0, gap)));
  return {
    workedMin: worked,
    lunchMin: lunchFor(worked),
    basis: "gross",
    // A partial overlap (some of the meal excluded, some not) is not a shape we
    // have ever seen documented — take the safe number but flag it for review.
    ambiguous: gap > RECONCILE_TOLERANCE_MIN,
  };
}

/** Worked minutes as decimal hours, rounded the way the timecard grid rounds. */
export function workedHours(day: DayPunchAggregate): number {
  return round2(resolveWorkedMinutes(day).workedMin / 60);
}
