import { test, expect } from "@playwright/test";
import {
  DAYS,
  DAY_LABEL,
  autoOvertimeAdjustment,
  currentWeekStart,
  dayDate,
  dayRegularHours,
  emptyDays,
  rollupTotals,
  startOfWeek,
  ymdLocal,
} from "../../src/lib/timecards";
import {
  RECONCILE_TOLERANCE_MIN,
  resolveWorkedMinutes,
  workedHours,
  type DayPunchAggregate,
} from "../../src/lib/uattend/worked-hours";

// Regression cover for the two payroll bugs Antonio reported 2026-07-20:
//   1. "The pay period is still Mon - Sun it supposed to be Sun - Sat"
//   2. "it keeps counting the lunch time, see the example on Mon
//       It should be 7.95 no 8.47"
// Both feed invoicing, so these are money assertions, not display assertions.

// ---------------------------------------------------------------------------
// BUG 1 — the pay week runs Sunday → Saturday
// ---------------------------------------------------------------------------

test.describe("pay week boundary (Sun–Sat)", () => {
  test("DAYS is positional and starts on Sunday", () => {
    // The ingest and the CSV exports index into this array with "days since
    // week_start". If it ever goes back to Monday-first while week_start stays
    // a Sunday, every employee's hours shift one day without any visible error.
    expect([...DAYS]).toEqual(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]);
    expect(DAYS[0]).toBe("sun");
    expect(DAYS[6]).toBe("sat");
    expect(DAYS.map((k) => DAY_LABEL[k])).toEqual([
      "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat",
    ]);
  });

  test("startOfWeek returns the Sunday, not the ISO Monday", () => {
    // The window in Antonio's screenshot read "Jul 13 – Jul 19" (Mon–Sun).
    // Jul 13 2026 is a Monday; its pay week actually opened Sunday Jul 12.
    expect(ymdLocal(startOfWeek(new Date("2026-07-13T12:00:00")))).toBe("2026-07-12");
    // Every day of that pay week resolves to the same Sunday.
    for (const [d, expected] of [
      ["2026-07-12", "2026-07-12"], // Sun — its own start
      ["2026-07-15", "2026-07-12"], // Wed
      ["2026-07-18", "2026-07-12"], // Sat — closes the week
      ["2026-07-19", "2026-07-19"], // Sun — opens the NEXT week
    ] as const) {
      expect(ymdLocal(startOfWeek(new Date(`${d}T12:00:00`)))).toBe(expected);
    }
  });

  test("a SUNDAY punch lands in the week it opens, not the previous one", () => {
    // This is the case the Monday bug got wrong: under ISO, Sunday Jul 19 was
    // pulled BACK into the Jul 13 week — a day of work billed to the wrong week.
    const sunday = new Date("2026-07-19T09:00:00");
    expect(ymdLocal(startOfWeek(sunday))).toBe("2026-07-19");
    expect(ymdLocal(startOfWeek(sunday))).not.toBe("2026-07-13");
  });

  test("the boundary holds across month and year edges", () => {
    // Wed 2026-07-01 → Sunday 2026-06-28 (previous month).
    expect(ymdLocal(startOfWeek(new Date("2026-07-01T12:00:00")))).toBe("2026-06-28");
    // Sat 2026-02-28 in a non-leap-adjacent month → Sunday 2026-02-22.
    expect(ymdLocal(startOfWeek(new Date("2026-02-28T12:00:00")))).toBe("2026-02-22");
    // Fri 2027-01-01 → Sunday 2026-12-27 (previous year).
    expect(ymdLocal(startOfWeek(new Date("2027-01-01T12:00:00")))).toBe("2026-12-27");
    // Leap day: Mon 2028-02-29 → Sunday 2028-02-27.
    expect(ymdLocal(startOfWeek(new Date("2028-02-29T12:00:00")))).toBe("2028-02-27");
  });

  test("dayDate maps each key to the right calendar date from a Sunday start", () => {
    // week_start 2026-07-12 is a Sunday; Monday must be Jul 13, Saturday Jul 18.
    expect(dayDate("2026-07-12", "sun")).toBe("Jul 12");
    expect(dayDate("2026-07-12", "mon")).toBe("Jul 13");
    expect(dayDate("2026-07-12", "sat")).toBe("Jul 18");
  });

  test("currentWeekStart is always a Sunday and never shifts a day via UTC", () => {
    // ymdLocal reads local calendar fields; toISOString() would re-project
    // local midnight into UTC and can land on the previous day.
    for (const iso of ["2026-07-12", "2026-07-15", "2026-12-31", "2027-01-01"]) {
      const s = currentWeekStart(new Date(`${iso}T00:30:00`));
      expect(new Date(`${s}T12:00:00`).getDay()).toBe(0); // 0 = Sunday
    }
  });

  test("auto-OT rolls the >40h excess off SATURDAY, the last day of the pay week", () => {
    const days = emptyDays();
    for (const k of DAYS) days[k] = { regular: 7, overtime: 0, holiday: 0, in: null, out: null, locked: false };
    // 7 × 7 = 49 regular hours ⇒ 9 hours of excess.
    const adj = autoOvertimeAdjustment(days);
    // Saturday closes the week, so it absorbs OT first — Sunday opens it and
    // must be the LAST to be touched.
    expect(adj.sat!.overtime).toBe(7);
    expect(adj.sat!.regular).toBe(0);
    expect(adj.fri!.overtime).toBe(2);
    expect(adj.sun!.overtime).toBe(0);
    expect(adj.sun!.regular).toBe(7);
    expect(rollupTotals(adj).ot_hours).toBe(9);
    expect(rollupTotals(adj).total).toBe(49);
  });
});

// ---------------------------------------------------------------------------
// BUG 2 — the unpaid meal must not be billed
// ---------------------------------------------------------------------------

const day = (o: Partial<DayPunchAggregate>): DayPunchAggregate => ({
  regMin: 0, mealMin: 0, regLines: 1, in: null, out: null, ...o,
});

test.describe("worked hours net of the punched meal", () => {
  // Antonio's reported Monday: In 08:00, Out 16:28 (508 min span), one 31-min
  // punched meal. The invoice must be built on 7.95 h, not 8.47 h.
  const REPORTED_IN = "08:00";
  const REPORTED_OUT = "16:28";

  test("GROSS shape: Regular Tot still contains the meal → 7.95, not 8.47", () => {
    // This is the shape that produced the bug: Tot == the raw In→Out span, so
    // the old residual (span − reg) evaluated to 0 and the meal was billed.
    const d = day({ regMin: 508, mealMin: 31, in: REPORTED_IN, out: REPORTED_OUT });
    const r = resolveWorkedMinutes(d);
    expect(r.basis).toBe("gross");
    expect(r.workedMin).toBe(477);
    expect(workedHours(d)).toBe(7.95);
    expect(workedHours(d)).not.toBe(8.47);
  });

  test("NET shape: Regular Tot already excludes the meal → still 7.95", () => {
    const d = day({ regMin: 477, mealMin: 31, in: REPORTED_IN, out: REPORTED_OUT });
    const r = resolveWorkedMinutes(d);
    expect(r.basis).toBe("net");
    expect(workedHours(d)).toBe(7.95);
  });

  test("both shapes agree — the result cannot depend on the vendor's Tot convention", () => {
    const gross = day({ regMin: 508, mealMin: 31, in: REPORTED_IN, out: REPORTED_OUT });
    const net = day({ regMin: 477, mealMin: 31, in: REPORTED_IN, out: REPORTED_OUT });
    expect(workedHours(gross)).toBe(workedHours(net));
  });

  test("the stored lunch_min reproduces worked hours through the timecard grid", () => {
    // The grid re-derives regular hours as (span − lunch_min). If lunch_min is
    // written wrong, the UI silently disagrees with the ingest.
    const d = day({ regMin: 508, mealMin: 31, in: REPORTED_IN, out: REPORTED_OUT });
    const r = resolveWorkedMinutes(d);
    expect(r.lunchMin).toBe(31);
    const derived = dayRegularHours({
      regular: 0, overtime: 0, holiday: 0,
      in: REPORTED_IN, out: REPORTED_OUT, locked: false,
      lunch_min: r.lunchMin!,
    });
    expect(derived).toBe(7.95);
  });

  test("NO lunch punch: the full span is paid — no phantom 30-min deduction", () => {
    // An employee who worked through must not lose half an hour to the default.
    const d = day({ regMin: 480, mealMin: 0, in: "08:00", out: "16:00" });
    const r = resolveWorkedMinutes(d);
    expect(r.basis).toBe("no-meal");
    expect(workedHours(d)).toBe(8);
    expect(r.lunchMin).toBe(0);
  });

  test("TWO breaks in a day: both are deducted, not just the first", () => {
    // 08:00 → 16:46 = 526 min, with a 31-min lunch and a 15-min break.
    const d = day({ regMin: 526, mealMin: 46, in: "08:00", out: "16:46" });
    const r = resolveWorkedMinutes(d);
    expect(r.basis).toBe("gross");
    expect(r.workedMin).toBe(480);
    expect(workedHours(d)).toBe(8);
  });

  test("SPLIT shift: the unworked gap is not double-deducted", () => {
    // Two Regular segments 08:00–12:00 and 13:00–17:00 = 480 worked min, but a
    // 540-min outer span. Subtracting a meal on top would underpay.
    const d = day({ regMin: 480, mealMin: 0, regLines: 2, in: "08:00", out: "17:00" });
    const r = resolveWorkedMinutes(d);
    expect(r.basis).toBe("split-shift");
    expect(workedHours(d)).toBe(8);
  });

  test("overnight shift: the span wraps midnight correctly", () => {
    // 22:00 → 06:30 = 510 min, 30-min meal ⇒ 8.00 h.
    const d = day({ regMin: 510, mealMin: 30, in: "22:00", out: "06:30" });
    expect(workedHours(d)).toBe(8);
  });

  test("no usable punches: fall back to the summed Regular total", () => {
    const d = day({ regMin: 450, mealMin: 0, in: null, out: null });
    const r = resolveWorkedMinutes(d);
    expect(r.basis).toBe("no-span");
    expect(workedHours(d)).toBe(7.5);
    expect(r.lunchMin).toBeNull();
  });

  test("rounding drift within tolerance is still read as the NET shape", () => {
    // Tot is 2dp hours, so a day can drift a minute or so from the punch span.
    const d = day({
      regMin: 477 + RECONCILE_TOLERANCE_MIN - 1,
      mealMin: 31, in: REPORTED_IN, out: REPORTED_OUT,
    });
    expect(resolveWorkedMinutes(d).basis).toBe("net");
  });

  test("a partly-excluded meal is flagged rather than silently guessed", () => {
    // Only 10 of the 31 meal minutes are carved out of Tot. We take the safe
    // number AND mark it, so a wrong rule surfaces as a list, not an invoice.
    const d = day({ regMin: 498, mealMin: 31, in: REPORTED_IN, out: REPORTED_OUT });
    const r = resolveWorkedMinutes(d);
    expect(r.ambiguous).toBe(true);
    expect(r.workedMin).toBe(477);
  });

  test("worked minutes can never go negative", () => {
    const d = day({ regMin: 20, mealMin: 60, in: "08:00", out: "08:20" });
    expect(resolveWorkedMinutes(d).workedMin).toBe(0);
  });

  test("a full Sun–Sat week reconciles to the sum of its days", () => {
    // Mon is the reported 7.95; the rest are clean 8h days with a 30-min meal.
    const week: Record<string, DayPunchAggregate> = {
      sun: day({ regMin: 0, mealMin: 0, in: null, out: null }),
      mon: day({ regMin: 508, mealMin: 31, in: "08:00", out: "16:28" }),
      tue: day({ regMin: 510, mealMin: 30, in: "08:00", out: "16:30" }),
      wed: day({ regMin: 510, mealMin: 30, in: "08:00", out: "16:30" }),
      thu: day({ regMin: 510, mealMin: 30, in: "08:00", out: "16:30" }),
      fri: day({ regMin: 480, mealMin: 0, in: "08:00", out: "16:00" }),
      sat: day({ regMin: 0, mealMin: 0, in: null, out: null }),
    };
    const total = Object.values(week).reduce((s, d) => s + workedHours(d), 0);
    // 0 + 7.95 + 8 + 8 + 8 + 8 + 0
    expect(Math.round(total * 100) / 100).toBe(39.95);
    // The old behaviour billed the meals: 8.47 + 8.5×3 + 8 = 41.97.
    expect(Math.round(total * 100) / 100).toBeLessThan(41.97);
  });
});
