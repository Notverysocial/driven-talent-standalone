import { test, expect } from "@playwright/test";
import {
  resolvePrismHrAdapter,
  LivePrismHrAdapter,
  MockPrismHrAdapter,
} from "../src/lib/prismhr/adapter";
import type { PrismHrPayrollBatch } from "../src/lib/prismhr/contract";

// Pure coverage for the PrismHR scaffold. Proves: mock-until-connected, and the
// live adapter NEVER makes a call (methods throw not-implemented). No network.

const batch: PrismHrPayrollBatch = {
  peoId: "PEO-1",
  periodStart: "2026-06-15",
  periodEnd: "2026-06-28",
  lines: [
    { externalId: "PEO-1001", prismEmployeeId: null, regHours: 80, otHours: 5, holidayHours: 0, sickHours: 2 },
  ],
};

test.describe("prismhr scaffold", () => {
  test("resolves to MOCK when credentials are absent", () => {
    expect(resolvePrismHrAdapter().mode).toBe("mock");
    expect(resolvePrismHrAdapter({ apiKey: "k" }).mode).toBe("mock"); // no PEO id
    expect(resolvePrismHrAdapter({ peoId: "p" }).mode).toBe("mock"); // no key
    expect(resolvePrismHrAdapter({}) instanceof MockPrismHrAdapter).toBe(true);
  });

  test("resolves to LIVE only with both credential + PEO id", () => {
    const a = resolvePrismHrAdapter({ apiKey: "k", peoId: "p" });
    expect(a.mode).toBe("live");
    expect(a instanceof LivePrismHrAdapter).toBe(true);
  });

  test("LIVE adapter never calls out — methods throw not-implemented", async () => {
    const live = resolvePrismHrAdapter({ apiKey: "k", peoId: "p" });
    await expect(live.getEmployeeStatuses()).rejects.toThrow(/scaffold|not implemented/i);
    await expect(live.submitPayrollHours(batch)).rejects.toThrow(/scaffold|not implemented/i);
  });

  test("MOCK adapter returns sample data + accepts a batch", async () => {
    const mock = resolvePrismHrAdapter();
    const emps = await mock.getEmployeeStatuses();
    expect(emps.length).toBeGreaterThan(0);
    expect(emps.some((e) => e.status === "active")).toBe(true);
    expect(emps.some((e) => e.status === "inactive")).toBe(true);
    const res = await mock.submitPayrollHours(batch);
    expect(res.ok).toBe(true);
    expect(res.accepted).toBe(1);
  });
});
