import { test, expect } from "@playwright/test";
import {
  punchLineToEvents,
  toIsoInstant,
  shiftDays,
  clampLookback,
} from "../../src/lib/uattend/punch-events";
import type { UattendPunch } from "../../src/lib/uattend/contract";
import type { ClockEvent } from "../../src/lib/uattend/punch-events";

// The uAttend punch feed pointed at `api.uattend.com`, a hostname that has
// never resolved, so it never synced once. The fix retires that hand-rolled
// client and derives punch events from the REAL /reports/punch response via
// LiveUattendAdapter.
//
// That response is DAY-LEVEL — one line item per (user, date, paycode) with
// InTime/OutTime/Tot/PaycodeId, no punch id and no device. `timeclock_punches`
// wants discrete events with a unique vendor id. These tests pin the
// translation, especially the two properties that decide whether re-running the
// cron is safe: synthetic ids must be deterministic, and wall-clock times must
// be placed in the account's zone rather than the server's.

const line = (over: Partial<UattendPunch> = {}): UattendPunch => ({
  uattendId: "1001",
  date: "2026-07-15",
  punchIn: "08:03",
  punchOut: "16:31",
  department: "Warehouse",
  hours: 8.03,
  paycodeId: 1,
  ...over,
});

const TZ = "America/Los_Angeles";

test.describe("punchLineToEvents — one day-level line becomes in + out", () => {
  test("derives an in and an out event", () => {
    const ev = punchLineToEvents(line(), TZ);
    expect(ev).toHaveLength(2);
    expect(ev[0].punchType).toBe("in");
    expect(ev[1].punchType).toBe("out");
    expect(ev[0].uattendId).toBe("1001");
  });

  test("IDEMPOTENCY: ids are deterministic, so a re-pull upserts", () => {
    // uattend_punch_id is UNIQUE. If these ids varied between runs, every cron
    // tick would insert duplicate punches for the same shift.
    const a = punchLineToEvents(line(), TZ).map((e: ClockEvent) => e.punchId);
    const b = punchLineToEvents(line(), TZ).map((e: ClockEvent) => e.punchId);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(2); // in and out are distinct
  });

  test("ids separate user, date and paycode", () => {
    const base = punchLineToEvents(line(), TZ)[0].punchId;
    expect(punchLineToEvents(line({ uattendId: "1002" }), TZ)[0].punchId).not.toBe(base);
    expect(punchLineToEvents(line({ date: "2026-07-16" }), TZ)[0].punchId).not.toBe(base);
    // Same user + day, but the lunch line must not collide with the shift line.
    expect(punchLineToEvents(line({ paycodeId: 7 }), TZ)[0].punchId).not.toBe(base);
  });

  test("lunch and break paycodes map to their own punch types", () => {
    // Table CHECK constraint allows only in/out/lunch_in/lunch_out/
    // break_in/break_out — an unmapped paycode would be a write failure.
    expect(punchLineToEvents(line({ paycodeId: 7 }), TZ).map((e: ClockEvent) => e.punchType))
      .toEqual(["lunch_in", "lunch_out"]);
    expect(punchLineToEvents(line({ paycodeId: 6 }), TZ).map((e: ClockEvent) => e.punchType))
      .toEqual(["break_in", "break_out"]);
  });

  test("non-worked paycodes still map to a legal punch type", () => {
    for (const paycodeId of [1, 2, 3, 4, 5, null]) {
      const types = punchLineToEvents(line({ paycodeId }), TZ).map((e: ClockEvent) => e.punchType);
      expect(types, `paycode ${paycodeId}`).toEqual(["in", "out"]);
    }
  });

  test("an open shift (no punch-out yet) yields only the in event", () => {
    const ev = punchLineToEvents(line({ punchOut: null }), TZ);
    expect(ev).toHaveLength(1);
    expect(ev[0].punchType).toBe("in");
  });

  test("a line with neither time yields nothing rather than a bogus row", () => {
    expect(punchLineToEvents(line({ punchIn: null, punchOut: null }), TZ)).toEqual([]);
  });

  test("the raw line is retained for audit", () => {
    const ev = punchLineToEvents(line(), TZ)[0];
    expect(ev.raw).toMatchObject({ uattendId: "1001", hours: 8.03, derived: true });
  });
});

test.describe("toIsoInstant — the account's zone, not the server's", () => {
  test("THE HAZARD: a wall-clock reading is not UTC", () => {
    // Vercel runs in UTC. `new Date("2026-07-15T08:03:00")` there would call
    // this 08:03 UTC and shift every punch by the account's offset — 7 hours in
    // July for Pacific. That would put a morning punch-in on the wrong side of
    // midnight for late shifts.
    const iso = toIsoInstant("2026-07-15", "08:03", TZ);
    expect(iso).toBe("2026-07-15T15:03:00.000Z"); // PDT = UTC-7
    expect(iso).not.toBe("2026-07-15T08:03:00.000Z");
  });

  test("DST is handled by the tz database, not a fixed offset", () => {
    // January is PST (UTC-8); July is PDT (UTC-7). A hardcoded offset would get
    // one of these wrong by an hour.
    expect(toIsoInstant("2026-01-15", "08:00", TZ)).toBe("2026-01-15T16:00:00.000Z");
    expect(toIsoInstant("2026-07-15", "08:00", TZ)).toBe("2026-07-15T15:00:00.000Z");
  });

  test("a different branch zone gives a different instant", () => {
    // DT has Chino CA and Eagan MN sites. Same reading, different timeline
    // position — which is why the zone is configurable per account.
    const pacific = toIsoInstant("2026-07-15", "08:00", "America/Los_Angeles");
    const central = toIsoInstant("2026-07-15", "08:00", "America/Chicago");
    expect(pacific).not.toBe(central);
  });

  test("malformed or missing times return null instead of Invalid Date", () => {
    for (const t of [null, "", "8:00", "0800", "25:00", "abc"]) {
      expect(toIsoInstant("2026-07-15", t, TZ), `time=${t}`).toBeNull();
    }
    expect(toIsoInstant("15-07-2026", "08:00", TZ)).toBeNull();
  });

  test("an unknown zone degrades to UTC rather than throwing", () => {
    expect(toIsoInstant("2026-07-15", "08:00", "Not/AZone")).toBe(
      "2026-07-15T08:00:00.000Z",
    );
  });
});

test.describe("window clamping — a long outage cannot pull a year", () => {
  test("shiftDays moves by whole days across a month boundary", () => {
    expect(shiftDays("2026-07-01", -7)).toBe("2026-06-24");
    expect(shiftDays("2026-07-15", 1)).toBe("2026-07-16");
  });

  test("a stale cursor is clamped to the 31-day floor", () => {
    // The real scenario: a cursor from before a seventeen-day outage, or from
    // an integration that was dark for months.
    expect(clampLookback("2025-01-01", "2026-07-19")).toBe("2026-06-18");
  });

  test("a recent cursor is respected", () => {
    expect(clampLookback("2026-07-15", "2026-07-19")).toBe("2026-07-15");
  });

  test("a future cursor collapses to today rather than an inverted range", () => {
    expect(clampLookback("2026-08-01", "2026-07-19")).toBe("2026-07-19");
  });
});
