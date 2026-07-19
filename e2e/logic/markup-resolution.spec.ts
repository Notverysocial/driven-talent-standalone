import { test, expect } from "@playwright/test";
import {
  resolveMarkup,
  parseMarkupInput,
  summariseSources,
} from "../../src/lib/markup";

// Per-employee markup rates (Rocio, 2026-06-17 — "set the markup once per
// employee"). This suite is the gate on the billing arithmetic: it runs in the
// REQUIRED `logic` project, no server and no database, so a change that moves
// an invoice amount cannot merge without turning this red.
//
// The most important test in this file is the PARITY block at the bottom. It
// pins the resolver's output to the exact expression it replaced in
// payroll-invoicing.server.ts, which is what proves no existing rate moves.

test.describe("resolveMarkup — precedence", () => {
  test("explicit bill_rate wins over everything else", () => {
    const r = resolveMarkup({
      payRate: 20,
      assignmentBillRate: 33,
      employeeMarkupPct: 45,
      clientMarkupPct: 8,
    });
    expect(r.billRate).toBe(33);
    expect(r.source).toBe("assignment_bill_rate");
    expect(r.needsAttention).toBe(false);
  });

  test("employee markup wins over the client default", () => {
    const r = resolveMarkup({ payRate: 20, employeeMarkupPct: 45, clientMarkupPct: 8 });
    expect(r.billRate).toBeCloseTo(29, 10);
    expect(r.source).toBe("employee_markup");
    expect(r.markupPct).toBe(45);
    expect(r.label).toBe("Employee 45%");
  });

  test("client default applies when the employee has no markup", () => {
    const r = resolveMarkup({ payRate: 20, clientMarkupPct: 8 });
    expect(r.billRate).toBeCloseTo(21.6, 10);
    expect(r.source).toBe("client_default");
    expect(r.isFallback).toBe(true);
    expect(r.label).toBe("Client 8%");
  });

  test("nothing configured anywhere bills at cost and demands attention", () => {
    const r = resolveMarkup({ payRate: 20 });
    expect(r.billRate).toBe(20);
    expect(r.source).toBe("none");
    expect(r.needsAttention).toBe(true);
    expect(r.label).toBe("No markup");
  });

  test("a bill_rate of 0 is not an override — it falls through", () => {
    // Matches the pre-existing `bill_rate > 0` guard. A stored 0 is a data
    // artefact, not a decision to bill nothing.
    const r = resolveMarkup({ payRate: 20, assignmentBillRate: 0, clientMarkupPct: 8 });
    expect(r.source).toBe("client_default");
    expect(r.billRate).toBeCloseTo(21.6, 10);
  });
});

test.describe("resolveMarkup — zero and null are different things", () => {
  test("an employee markup of exactly 0 is honoured, not overridden by the client", () => {
    // Some placements are deliberately billed at cost. If 0 fell through to the
    // client default, the operator's explicit choice would be silently
    // overwritten with 8% and the client would be overbilled.
    const r = resolveMarkup({ payRate: 20, employeeMarkupPct: 0, clientMarkupPct: 8 });
    expect(r.billRate).toBe(20);
    expect(r.source).toBe("employee_markup");
    expect(r.markupPct).toBe(0);
    expect(r.needsAttention).toBe(false);
  });

  test("a null employee markup falls through to the client", () => {
    const r = resolveMarkup({ payRate: 20, employeeMarkupPct: null, clientMarkupPct: 8 });
    expect(r.source).toBe("client_default");
  });

  test("a blank-string employee markup reads as unset, not as 0", () => {
    const r = resolveMarkup({ payRate: 20, employeeMarkupPct: "", clientMarkupPct: 8 });
    expect(r.source).toBe("client_default");
  });

  test("a client default of 0 degrades to 'none' rather than posing as a chosen rate", () => {
    // service_fee_pct is nullable with a column default; a 0 there means nobody
    // set it. Billing at cost is then a gap to report, not a price.
    const r = resolveMarkup({ payRate: 20, clientMarkupPct: 0 });
    expect(r.source).toBe("none");
    expect(r.needsAttention).toBe(true);
    expect(r.billRate).toBe(20);
  });

  test("a negative employee markup is refused and falls through", () => {
    const r = resolveMarkup({ payRate: 20, employeeMarkupPct: -10, clientMarkupPct: 8 });
    expect(r.source).toBe("client_default");
    expect(r.billRate).toBeCloseTo(21.6, 10);
  });
});

test.describe("resolveMarkup — coercion and edge values", () => {
  test("string numerics from forms and imports coerce", () => {
    const r = resolveMarkup({ payRate: "20", employeeMarkupPct: "45" });
    expect(r.billRate).toBeCloseTo(29, 10);
    expect(r.source).toBe("employee_markup");
  });

  test("a zero pay rate yields a null percentage rather than a fake 0%", () => {
    const r = resolveMarkup({ payRate: 0, assignmentBillRate: 30 });
    expect(r.billRate).toBe(30);
    expect(r.markupPct).toBeNull();
  });

  test("non-numeric garbage never produces NaN money", () => {
    const r = resolveMarkup({ payRate: "abc", employeeMarkupPct: "xyz", clientMarkupPct: 8 });
    expect(Number.isFinite(r.billRate)).toBe(true);
    expect(r.billRate).toBe(0);
    expect(r.source).toBe("client_default");
  });

  test("bill_rate override reports the implied markup for display", () => {
    const r = resolveMarkup({ payRate: 20, assignmentBillRate: 29 });
    expect(r.markupPct).toBe(45);
  });

  test("fractional markups survive to the cent", () => {
    const r = resolveMarkup({ payRate: 18.75, employeeMarkupPct: 32.5 });
    expect(r.billRate).toBeCloseTo(24.84375, 10);
  });
});

test.describe("parseMarkupInput — the editor cannot write a typo to a billing column", () => {
  test("blank clears the override", () => {
    expect(parseMarkupInput("")).toBeNull();
    expect(parseMarkupInput("   ")).toBeNull();
    expect(parseMarkupInput(null)).toBeNull();
  });

  test("plain and percent-suffixed numbers both parse", () => {
    expect(parseMarkupInput("45")).toBe(45);
    expect(parseMarkupInput("45%")).toBe(45);
    expect(parseMarkupInput(" 32.5 ")).toBe(32.5);
  });

  test("zero is a valid, storable choice", () => {
    expect(parseMarkupInput("0")).toBe(0);
  });

  test("negative is rejected — it would bill below cost", () => {
    expect(() => parseMarkupInput("-5")).toThrow(/negative/i);
  });

  test("a fat-fingered multiplier is rejected", () => {
    // 4500 typed when 45 was meant would 45× an invoice. Refuse it.
    expect(() => parseMarkupInput("4500")).toThrow(/typo/i);
  });

  test("non-numeric is rejected", () => {
    expect(() => parseMarkupInput("forty five")).toThrow(/not a valid/i);
  });

  test("rounds to the two decimals the column stores", () => {
    expect(parseMarkupInput("45.678")).toBe(45.68);
  });
});

test.describe("summariseSources — the visibility strip", () => {
  test("counts each provenance so the UI can report the mix", () => {
    const rows = [
      resolveMarkup({ payRate: 20, employeeMarkupPct: 45 }),
      resolveMarkup({ payRate: 20, employeeMarkupPct: 40 }),
      resolveMarkup({ payRate: 20, assignmentBillRate: 30 }),
      resolveMarkup({ payRate: 20, clientMarkupPct: 8 }),
      resolveMarkup({ payRate: 20 }),
    ];
    expect(summariseSources(rows)).toEqual({
      employee: 2,
      fixedRate: 1,
      clientDefault: 1,
      missing: 1,
    });
  });
});

// ---------------------------------------------------------------------------
// PARITY WITH THE PRE-CHANGE ENGINE
//
// This is the guarantee that matters: for every input shape that existed before
// per-employee markup, the resolver returns the identical bill rate the old
// expression returned. Any invoice generated from data with no markup_percent
// set therefore totals to exactly what it totalled before.
// ---------------------------------------------------------------------------

// Verbatim copy of the expression removed from payroll-invoicing.server.ts:
//   const billRate =
//     a?.bill_rate != null && Number(a.bill_rate) > 0
//       ? Number(a.bill_rate)
//       : payRate * (1 + Number(t.clients.service_fee_pct ?? 0) / 100);
function legacyBillRate(
  payRate: number,
  billRate: number | null,
  serviceFeePct: number | null,
): number {
  return billRate != null && Number(billRate) > 0
    ? Number(billRate)
    : payRate * (1 + Number(serviceFeePct ?? 0) / 100);
}

test.describe("historical parity — no pre-existing amount can move", () => {
  const payRates = [0, 12.5, 18.75, 20, 23.4, 41.06];
  const billRates: Array<number | null> = [null, 0, 22, 29.5, 33.13];
  const feePcts: Array<number | null> = [null, 0, 3, 8, 12.75, 45];

  test("resolver matches the legacy expression on every legacy input combination", () => {
    let checked = 0;
    for (const pay of payRates) {
      for (const bill of billRates) {
        for (const fee of feePcts) {
          const legacy = legacyBillRate(pay, bill, fee);
          // No markup_percent — this is exactly the state of every row in the
          // database today, since the column has never been written by the app.
          const resolved = resolveMarkup({
            payRate: pay,
            assignmentBillRate: bill,
            employeeMarkupPct: null,
            clientMarkupPct: fee,
          });
          expect(
            resolved.billRate,
            `pay=${pay} bill=${bill} fee=${fee}`,
          ).toBe(legacy);
          checked++;
        }
      }
    }
    expect(checked).toBe(payRates.length * billRates.length * feePcts.length);
  });

  test("a full reg + OT line total is unchanged when no markup is set", () => {
    // Mirrors buildGroupLineItems: reg = hours × rate, OT = hours × rate × 1.5.
    const pay = 20;
    const fee = 8;
    const regHours = 38.5;
    const otHours = 6.25;

    const legacy = legacyBillRate(pay, null, fee);
    const resolved = resolveMarkup({ payRate: pay, clientMarkupPct: fee }).billRate;

    const total = (rate: number) =>
      round2(regHours * rate) + round2(otHours * rate * 1.5);

    expect(total(resolved)).toBe(total(legacy));
  });

  test("setting a markup only changes rows that have one", () => {
    const withMarkup = resolveMarkup({ payRate: 20, employeeMarkupPct: 45, clientMarkupPct: 8 });
    const without = resolveMarkup({ payRate: 20, employeeMarkupPct: null, clientMarkupPct: 8 });
    expect(withMarkup.billRate).not.toBe(without.billRate);
    expect(without.billRate).toBe(legacyBillRate(20, null, 8));
  });
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
