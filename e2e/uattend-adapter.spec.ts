import { test, expect } from "@playwright/test";
import {
  normalizeEmployee,
  normalizeTimecard,
  mondayOf,
  unwrapList,
} from "../src/lib/uattend/contract";
import { MockUattendAdapter } from "../src/lib/uattend/adapter";

// Unit coverage for the uAttend (WorkwellTech) data adapter. Pure — no DB, no
// network. Locks down the contract so swapping to the live key is a config
// step: the same normalizers and the same MockUattendAdapter shape are what the
// live adapter feeds into.

test.describe("uAttend contract normalizers", () => {
  test("normalizeEmployee tolerates snake_case + alternate field names", () => {
    const e = normalizeEmployee({
      employee_id: 4021,
      first_name: "Ana",
      last_name: "Reyes",
      email_address: "ana@x.com",
      department_name: "Warehouse",
      pay_rate: "22.5",
      status: "active",
    });
    expect(e).not.toBeNull();
    expect(e!.uattendId).toBe("4021");
    expect(e!.fullName).toBe("Ana Reyes");
    expect(e!.email).toBe("ana@x.com");
    expect(e!.department).toBe("Warehouse");
    expect(e!.payRate).toBe(22.5);
    expect(e!.active).toBe(true);
  });

  test("normalizeEmployee returns null without an id", () => {
    expect(normalizeEmployee({ firstName: "NoId" })).toBeNull();
  });

  test("mondayOf snaps any weekday to the ISO Monday", () => {
    // 2026-06-24 is a Wednesday → Monday is 2026-06-22.
    expect(mondayOf("2026-06-24")).toBe("2026-06-22");
    expect(mondayOf("2026-06-22")).toBe("2026-06-22");
    // Sunday 2026-06-28 → Monday 2026-06-22.
    expect(mondayOf("2026-06-28")).toBe("2026-06-22");
  });

  test("unwrapList handles bare arrays and common envelopes", () => {
    expect(unwrapList([{ a: 1 }]).length).toBe(1);
    expect(unwrapList({ employees: [{ a: 1 }, { b: 2 }] }, "employees").length).toBe(2);
    expect(unwrapList({ data: [{ a: 1 }] }).length).toBe(1);
    expect(unwrapList({ nope: 5 }).length).toBe(0);
  });

  test("normalizeTimecard derives weekStart + sums day hours", () => {
    const tc = normalizeTimecard({
      employeeId: "UA-1",
      department: "Warehouse",
      days: [
        { date: "2026-06-22", regular: 8, overtime: 0 },
        { date: "2026-06-23", regular: 8, overtime: 2 },
      ],
    });
    expect(tc).not.toBeNull();
    expect(tc!.weekStart).toBe("2026-06-22");
    expect(tc!.regularHours).toBe(16);
    expect(tc!.overtimeHours).toBe(2);
  });
});

test.describe("MockUattendAdapter", () => {
  const adapter = new MockUattendAdapter();

  test("reports mock mode", () => {
    expect(adapter.mode).toBe("mock");
  });

  test("getEmployees returns the seed roster incl. a new hire + a termination", async () => {
    const emps = await adapter.getEmployees();
    expect(emps.length).toBeGreaterThanOrEqual(5);
    const priya = emps.find((e) => e.email === "priya.anand@drivenpool.com");
    expect(priya?.active).toBe(true); // new hire → roster add
    const marcus = emps.find((e) => e.email === "marcus.w@drivenpool.com");
    expect(marcus?.active).toBe(false); // termination → roster remove/flag
  });

  test("getTimecards splits >40h into regular + overtime", async () => {
    const cards = await adapter.getTimecards({
      startDate: "2026-06-24",
      endDate: "2026-06-30",
    });
    // Maria (UA-1005) works 6×8 = 48h this week → 40 reg + 8 OT.
    const maria = cards.find((c) => c.uattendId === "UA-1005");
    expect(maria).toBeTruthy();
    expect(maria!.regularHours).toBe(40);
    expect(maria!.overtimeHours).toBe(8);
    // All timecards snap to the same Monday.
    expect(cards.every((c) => c.weekStart === "2026-06-22")).toBe(true);
  });

  test("getPunchReport returns one punch row per worked day", async () => {
    const punches = await adapter.getPunchReport({
      startDate: "2026-06-22",
      endDate: "2026-06-28",
    });
    expect(punches.length).toBeGreaterThan(0);
    expect(punches.every((p) => p.punchIn && p.punchOut)).toBe(true);
  });
});
