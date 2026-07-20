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
  resolveWorkedMinutes,
  spanMinutes,
  workedHours,
  type PunchLine,
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
//
// Pinned to what live prod actually returns, measured 2026-07-20:
//   * paycode 1: Tot == (OutTime − InTime) on 772 of 772 rows, max diff 0.00
//   * paycode 7: same, on all 656 rows
//   * meal lines present on 328 of 377 employee-days, averaging 1.031 h
//   * days routinely carry MULTIPLE Regular lines with the meal nested inside
// ---------------------------------------------------------------------------

/** A Regular line whose Tot is its own raw span — the proven prod shape. */
const reg = (inT: string, outT: string): PunchLine => ({
  paycodeId: 1,
  hours: spanMinutes(inT, outT)! / 60,
  punchIn: inT,
  punchOut: outT,
});
/** A paycode-7 meal line of `hours` duration. */
const meal = (hours: number, inT = "12:00", outT: string | null = null): PunchLine => ({
  paycodeId: 7,
  hours,
  punchIn: inT,
  punchOut: outT,
});

test.describe("worked hours = Σ Regular Tot − Σ punched meal", () => {
  test("THE REPORTED BUG: Antonio's Monday reads 7.95, not 8.47", () => {
    // In 08:00 → Out 16:28 = 508 min = 8.47 h of raw span, one 31-min meal.
    const lines = [reg("08:00", "16:28"), meal(31 / 60)];
    expect(workedHours(lines)).toBe(7.95);
    expect(workedHours(lines)).not.toBe(8.47);
    const r = resolveWorkedMinutes(lines);
    expect(r.grossMin).toBeCloseTo(508, 6); // Tot IS the raw span
    expect(r.mealMin).toBeCloseTo(31, 6);
    expect(r.ambiguous).toBe(false);
  });

  test("the residual the old code used is ZERO on real data — the silent failure", () => {
    // This is the arithmetic that shipped: span − regularTot. Production says
    // Tot == span on 772/772 rows, so this is identically 0 and deducts nothing.
    const line = reg("08:00", "16:28");
    const residual = spanMinutes(line.punchIn, line.punchOut)! - line.hours * 60;
    expect(residual).toBe(0);
    // Which is why the meal has to be SUBTRACTED, not reconstructed.
    expect(workedHours([line, meal(31 / 60)])).toBe(7.95);
  });

  // The four real prod rows from Mon 2026-06-22. These are MULTI-PUNCH days:
  // treating >1 Regular line as a "split shift" and skipping the deduction
  // would leave every one of them overstated.
  const REAL_ROWS: [string, number, number, number][] = [
    // name,            Σ Regular Tot, meal hours, expected worked
    ["Aide Clemente",   17.0,  1.0,  16.0],
    ["Alexis Garcia",   17.06, 1.06, 16.0],
    ["Alondra Barajas", 16.86, 1.06, 15.8],
    ["Audiel Montiel",  17.04, 1.0,  16.04],
  ];

  for (const [name, gross, mealHrs, expected] of REAL_ROWS) {
    test(`real prod row — ${name}: ${gross} − ${mealHrs} = ${expected}`, () => {
      // Split the gross across two Regular lines, as the real days are.
      const half = gross / 2;
      const lines: PunchLine[] = [
        { paycodeId: 1, hours: half, punchIn: null, punchOut: null },
        { paycodeId: 1, hours: gross - half, punchIn: null, punchOut: null },
        meal(mealHrs),
      ];
      expect(workedHours(lines)).toBe(expected);
      // And the same total as a single line — line count must not change money.
      expect(
        workedHours([{ paycodeId: 1, hours: gross, punchIn: null, punchOut: null }, meal(mealHrs)]),
      ).toBe(expected);
    });
  }

  test("MULTIPLE Regular lines still get the meal subtracted", () => {
    // The regression guard for the mistake this module originally made:
    // a >1-line day is NOT a split shift with the meal already in a gap.
    const lines = [reg("06:00", "12:00"), reg("12:00", "17:00"), meal(1)];
    expect(resolveWorkedMinutes(lines).grossMin).toBe(11 * 60);
    expect(workedHours(lines)).toBe(10); // 11 − 1, not 11
  });

  test("the meal is NOT 30 minutes — no default is ever applied", () => {
    // Real meals average 1.031 h and vary per row, so a hardcoded default
    // would be wrong in both directions.
    expect(workedHours([reg("08:00", "17:00"), meal(1.031)])).toBe(7.97);
    expect(workedHours([reg("08:00", "17:00"), meal(0.5)])).toBe(8.5);
    expect(workedHours([reg("08:00", "17:00"), meal(1.06)])).toBe(7.94);
  });

  test("NO meal line: the full span is paid — no phantom 30-min haircut", () => {
    // 49 of 377 employee-days have no paycode-7 line. They must not lose time.
    const lines = [reg("08:00", "16:00")];
    expect(workedHours(lines)).toBe(8);
    expect(resolveWorkedMinutes(lines).mealMin).toBe(0);
  });

  test("BREAK lines (paycode 6) are deducted alongside lunch", () => {
    const lines = [reg("08:00", "17:00"), meal(1), { paycodeId: 6, hours: 0.25, punchIn: "15:00", punchOut: "15:15" }];
    expect(workedHours(lines)).toBe(7.75);
  });

  test("vacation / sick / holiday are neither worked nor deducted", () => {
    const lines: PunchLine[] = [
      reg("08:00", "16:00"),
      { paycodeId: 2, hours: 8, punchIn: null, punchOut: null }, // vacation
      { paycodeId: 3, hours: 8, punchIn: null, punchOut: null }, // sick
      { paycodeId: 4, hours: 8, punchIn: null, punchOut: null }, // holiday
    ];
    expect(workedHours(lines)).toBe(8);
  });

  test("a missing paycode is treated as Regular, matching the normalizer", () => {
    expect(workedHours([{ paycodeId: null, hours: 8, punchIn: "08:00", punchOut: "16:00" }])).toBe(8);
  });

  test("overnight shift: the span wraps midnight", () => {
    expect(spanMinutes("22:00", "06:30")).toBe(510);
    expect(workedHours([reg("22:00", "06:30"), meal(0.5)])).toBe(8);
  });

  test("earliest in / latest out, regardless of row order", () => {
    // The punch report's ordering is not guaranteed; "last row wins" could
    // otherwise record an earlier Out than the employee actually punched.
    const r = resolveWorkedMinutes([reg("13:00", "17:00"), reg("06:00", "12:00")]);
    expect(r.in).toBe("06:00");
    expect(r.out).toBe("17:00");
  });

  test("the stored lunch_min reproduces worked hours through the grid", () => {
    // The grid re-derives regular as (span − lunch_min). If lunch_min is wrong
    // the UI silently disagrees with the ingest — and the UI is what Antonio reads.
    const lines = [reg("08:00", "16:28"), meal(31 / 60)];
    const r = resolveWorkedMinutes(lines);
    expect(r.lunchMin).toBe(31);
    expect(
      dayRegularHours({
        regular: 0, overtime: 0, holiday: 0,
        in: r.in, out: r.out, locked: false, lunch_min: r.lunchMin!,
      }),
    ).toBe(7.95);
  });

  test("worked minutes can never go negative", () => {
    expect(resolveWorkedMinutes([reg("08:00", "08:20"), meal(1)]).workedMin).toBe(0);
  });

  test("CANARY: a Regular line whose Tot stops matching its span is flagged", () => {
    // Production proved Tot == span on 772/772 rows. If uAttend ever switches
    // to a NET Tot we would start double-subtracting the meal. That must
    // surface as a flagged day, not as a silent swing the other way.
    const netShaped: PunchLine = { paycodeId: 1, hours: 7.95, punchIn: "08:00", punchOut: "16:28" };
    const r = resolveWorkedMinutes([netShaped, meal(31 / 60)]);
    expect(r.ambiguous).toBe(true);
    expect(r.reasons.join(" ")).toContain("its own span");
  });

  test("a meal larger than the regular total is flagged, not silently zeroed", () => {
    const r = resolveWorkedMinutes([reg("08:00", "09:00"), meal(3)]);
    expect(r.workedMin).toBe(0);
    expect(r.ambiguous).toBe(true);
  });

  test("clean days are never flagged — the list stays worth reading", () => {
    for (const lines of [
      [reg("08:00", "16:28"), meal(31 / 60)],
      [reg("08:00", "16:00")],
      [reg("06:00", "12:00"), reg("12:00", "17:00"), meal(1)],
      [reg("22:00", "06:30"), meal(0.5)],
    ]) {
      expect(resolveWorkedMinutes(lines).ambiguous, JSON.stringify(lines)).toBe(false);
    }
  });

  test("SCALE: the 5.4% overstatement is removed", () => {
    // Prod-wide: 338.1 meal hours counted as worked against 6236.2 recorded.
    const RECORDED = 6236.2;
    const MEAL = 338.1;
    const corrected = RECORDED - MEAL;
    expect(Math.round((MEAL / RECORDED) * 1000) / 10).toBe(5.4);
    // One synthetic week reproduces the same direction and proportion.
    const lines = [
      { paycodeId: 1, hours: RECORDED, punchIn: null, punchOut: null },
      { paycodeId: 7, hours: MEAL, punchIn: null, punchOut: null },
    ];
    expect(workedHours(lines)).toBeCloseTo(corrected, 1);
  });
});
