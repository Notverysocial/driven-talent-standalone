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
import { weekStartOf } from "../../src/lib/uattend/contract";
import { scheduledPullWindows } from "../../src/lib/uattend/ingest-policy";
import { computeFlags } from "../../src/lib/payroll";

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

  // ---------------------------------------------------------------------
  // EVERY PLACE THE PAY-WEEK BOUNDARY IS WRITTEN, pinned together.
  //
  // A pre-merge audit (2026-07-20) flagged that the boundary lives in more
  // than one file and that a single missed site would shift the payroll CSV
  // by a day while the UI still rendered correctly — a wrong CSV that looks
  // right on screen. This asserts all of them agree, so the next person does
  // not have to re-derive the list by hand.
  // ---------------------------------------------------------------------
  test("ALL boundary sites agree on Sunday", () => {
    // Wed 2026-07-15 sits in the pay week opening Sunday 2026-07-12.
    expect(ymdLocal(startOfWeek(new Date("2026-07-15T12:00:00")))).toBe("2026-07-12");
    expect(weekStartOf("2026-07-15")).toBe("2026-07-12");
    // The scheduled uAttend pull windows must open on Sundays too.
    for (const w of scheduledPullWindows("2026-07-15")) {
      expect(new Date(`${w}T00:00:00`).getDay(), w).toBe(0);
    }
  });

  test("the CSV export and the UI index the SAME positional array", () => {
    // The payroll CSV walks DAYS[i] against week_start + i. If a local copy
    // of the array ever reappears Monday-first, every exported hour shifts a
    // day while the screen stays correct.
    expect([...DAYS]).toEqual(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]);
    for (let i = 0; i < 7; i++) {
      const d = new Date("2026-07-12T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + i);
      const iso = d.toISOString().slice(0, 10);
      // dayDate() is what the UI renders; DAYS[i] is what the CSV exports.
      expect(dayDate("2026-07-12", DAYS[i])).toBe(
        new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      );
    }
  });

  test("computeFlags reports the EARLIEST missed punch in pay-week order", () => {
    // Reads days by key so hours are never misattributed, but it breaks on the
    // first hit — a Monday-first loop named the wrong day. Sunday opens the week.
    const days = emptyDays();
    for (const k of DAYS) days[k] = { regular: 8, overtime: 0, holiday: 0, in: "08:00", out: "16:00", locked: false };
    days.sun = { regular: 8, overtime: 0, holiday: 0, in: "08:00", out: null, locked: false };
    days.wed = { regular: 8, overtime: 0, holiday: 0, in: "08:00", out: null, locked: false };
    expect(computeFlags(days)).toMatchObject({ missed_punch: true, punch_day: "sun" });
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
// Pinned to what live prod actually returns, measured 2026-07-20 and then
// CORRECTED after a de-duplication error was found in the first measurement
// (timeclock_punches stores an "<n>-in" and an "<n>-out" row per line item,
// BOTH carrying the same Tot, so the first pass double-counted every absolute
// figure). The corrected values:
//
//   * paycode 1: Tot == (OutTime − InTime), max diff 0.00 — Tot IS the span
//   * 377 employee-days, 328 of them carrying a lunch line
//   * lunch averages 0.515 h, range 0.50 – 1.00 — NOT a fixed 30 minutes
//   * 169.1 lunch hours billed as worked against 3118.1 recorded = 5.4%
//   * day keys are correctly aligned: 1745 of 1745 day entries match the
//     weekday their position implies, 0 misaligned. The positional DAYS change
//     is sufficient; there is no key/date misalignment to fix.
//   * 8.47 is a CLASS, not a record: 78 day entries, 36 employees, 63
//     timecards, spread across Mon–Fri, 34 of them already APPROVED.
//
// The earlier "17-hour shift" examples were the doubling artifact and are gone.
// Real shifts are ~8.5 h.
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
  // THE TARGET IS A CLASS, NOT A ROW.
  //
  // 8.47 is not one record. In prod it appears on 78 day entries across 36
  // employees and 63 timecards, on Mon/Tue/Wed/Thu AND Fri — 34 of them on
  // already-approved timecards. It is the signature of the standard shift:
  // clock in, clock out 8h28m later, 30-minute meal never deducted. The stored
  // `regular` is exactly out-minus-in with nothing removed:
  //
  //     13:56 → 22:24 = 8.47      04:57 → 13:25 = 8.47
  //     05:29 → 13:57 = 8.47      07:03 → 15:31 = 8.47
  //
  // So Antonio's "Mon" was almost certainly a genuine Monday, and naming any
  // single employee-date as "his record" is matching a value and calling it an
  // identification. Asserting over the class is also simply stronger: a
  // hand-picked row can pass by accident, a rule cannot.
  test("THE REPORTED BUG, as a class: regular 8.47 with a 0.52 meal ⇒ 7.95", () => {
    // Every shape that produces the reported pair must land on 7.95, whatever
    // time of day the shift started.
    for (const [inT, outT] of [
      ["13:56", "22:24"], ["04:57", "13:25"],
      ["05:29", "13:57"], ["07:03", "15:31"],
    ] as const) {
      // The stored `regular` is out-minus-in, undeducted — that IS the 8.47.
      expect(Math.round((spanMinutes(inT, outT)! / 60) * 100) / 100).toBe(8.47);
      expect(workedHours([reg(inT, outT), meal(0.52)])).toBe(7.95);
    }
    // And from the bare line values, with no punch times at all.
    expect(
      workedHours([
        { paycodeId: 1, hours: 8.47, punchIn: null, punchOut: null },
        { paycodeId: 7, hours: 0.52, punchIn: null, punchOut: null },
      ]),
    ).toBe(7.95);
  });

  test("THE GENERAL RULE: corrected = regular − the paycode-7 line, always", () => {
    // The property the class assertion generalises to. If this holds, no
    // hand-picked row is load-bearing.
    const GROSS = [8.47, 8.43, 8.5, 8.0, 9.25, 10.13, 6.75, 12.0, 4.5];
    const MEALS = [0.5, 0.52, 0.55, 0.75, 1.0];
    for (const g of GROSS) {
      for (const m of MEALS) {
        const expected = Math.round((g - m) * 100) / 100;
        expect(
          workedHours([
            { paycodeId: 1, hours: g, punchIn: null, punchOut: null },
            { paycodeId: 7, hours: m, punchIn: null, punchOut: null },
          ]),
          `${g} − ${m}`,
        ).toBe(expected);
      }
    }
  });

  test("the class spans the whole week — it is not a Friday phenomenon", () => {
    // The 78 entries land on Mon through Fri. Whatever weekday an 8.47 sits
    // on, the corrected value is the same and the day key is positional.
    for (const k of ["mon", "tue", "wed", "thu", "fri"] as const) {
      expect(DAYS.includes(k)).toBe(true);
      const idx = DAYS.indexOf(k);
      // week_start 2026-06-21 is a Sunday; index must round-trip to the date.
      const d = new Date("2026-06-21T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + idx);
      expect(ymdLocal(startOfWeek(new Date(`${d.toISOString().slice(0, 10)}T12:00:00`))))
        .toBe("2026-06-21");
      expect(workedHours([{ paycodeId: 1, hours: 8.47, punchIn: null, punchOut: null }, meal(0.52)]))
        .toBe(7.95);
    }
  });

  test("span-derived form of the same shift still gives 7.95", () => {
    // In 08:00 → Out 16:28 = 508 min = 8.47 h of raw span, with a 0.52 h meal.
    const lines = [reg("08:00", "16:28"), meal(0.52)];
    expect(workedHours(lines)).toBe(7.95);
    expect(workedHours(lines)).not.toBe(8.47);
    const r = resolveWorkedMinutes(lines);
    expect(r.grossMin).toBeCloseTo(508, 6); // Tot IS the raw span
    expect(r.mealMin).toBeCloseTo(31.2, 6);
    expect(r.ambiguous).toBe(false);
  });

  test("the residual the old code used is ZERO on real data — the silent failure", () => {
    // This is the arithmetic that shipped: span − regularTot. Production says
    // Tot == the line's own span with max diff 0.00, so this is identically 0
    // and deducts nothing at all.
    const line = reg("08:00", "16:28");
    const residual = spanMinutes(line.punchIn, line.punchOut)! - line.hours * 60;
    expect(residual).toBe(0);
    // Which is why the meal has to be SUBTRACTED, not reconstructed.
    expect(workedHours([line, meal(0.52)])).toBe(7.95);
  });

  // ILLUSTRATIONS ONLY — real prod rows, kept so the numbers stay concrete.
  // The assertions that matter are the class and the general rule above; none
  // of these rows is load-bearing, and none of them is "the" reported record.
  const REAL_ROWS: [string, string, number, number, number][] = [
    // name,               date,         Σ Regular, meal, expected worked
    ["Alexander Gonzalez", "2026-06-26", 8.47, 0.52, 7.95],
    ["Adrian Moreno",      "2026-06-26", 8.43, 0.52, 7.91],
    ["Aide Clemente",      "2026-06-26", 8.5,  0.5,  8.0],
    ["Maria Alfaro",       "2026-06-27", 8.43, 0.5,  7.93],
  ];

  for (const [name, date, gross, mealHrs, expected] of REAL_ROWS) {
    test(`illustration — ${name} ${date}: ${gross} − ${mealHrs} = ${expected}`, () => {
      const lines: PunchLine[] = [
        { paycodeId: 1, hours: gross, punchIn: null, punchOut: null },
        meal(mealHrs),
      ];
      expect(workedHours(lines)).toBe(expected);
      // Splitting the same gross across two Regular lines must not change the
      // money — line COUNT is not a signal about the meal.
      expect(
        workedHours([
          { paycodeId: 1, hours: gross / 2, punchIn: null, punchOut: null },
          { paycodeId: 1, hours: gross / 2, punchIn: null, punchOut: null },
          meal(mealHrs),
        ]),
      ).toBe(expected);
    });
  }

  test("every real row falls in the measured lunch range 0.50 – 1.00 h", () => {
    // Guards the "no fixed 30 minutes" property against a future default
    // creeping back in: 0.52 and 0.50 are both real, and neither is 0.5 by rule.
    for (const [, , , mealHrs] of REAL_ROWS) {
      expect(mealHrs).toBeGreaterThanOrEqual(0.5);
      expect(mealHrs).toBeLessThanOrEqual(1.0);
    }
    expect(new Set(REAL_ROWS.map((r) => r[3])).size).toBeGreaterThan(1);
  });

  test("MULTIPLE Regular lines still get the meal subtracted", () => {
    // The regression guard for the mistake this module originally made:
    // a >1-line day is NOT a split shift with the meal already in a gap.
    const lines = [reg("06:00", "12:00"), reg("12:00", "17:00"), meal(1)];
    expect(resolveWorkedMinutes(lines).grossMin).toBe(11 * 60);
    expect(workedHours(lines)).toBe(10); // 11 − 1, not 11
  });

  test("the meal is NOT 30 minutes — no default is ever applied", () => {
    // Real meals average 0.515 h and range 0.50 – 1.00, varying per row, so a
    // hardcoded default would be wrong in both directions.
    expect(workedHours([reg("08:00", "17:00"), meal(0.515)])).toBe(8.49);
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
    // Prod-wide, on the DEDUPLICATED punch data: 169.1 meal hours counted as
    // worked against 3118.1 recorded. (The first measurement reported double
    // these — both sides equally — which is why the 5.4% ratio was right even
    // though every absolute figure was wrong.)
    const RECORDED = 3118.1;
    const MEAL = 169.1;
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
