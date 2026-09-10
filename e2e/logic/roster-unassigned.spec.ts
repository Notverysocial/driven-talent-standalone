import { test, expect } from "@playwright/test";
import { buildRosterRows, type RosterEmployee } from "../../src/lib/roster-rows";

// Guards the 2026-09-10 fix: the Active Employees roster used to INNER-join
// employee_assignments, so a hire with no placement produced zero rows and was
// invisible on the screen the team uses to place them.
//
// Measured against production before the fix: 11 non-inactive employees had no
// active assignment, including Juan Duran (hired 2026-06-23, status 'active') —
// the case Estefany reported.

function emp(over: Partial<RosterEmployee> = {}): RosterEmployee {
  return {
    id: "e1",
    full_name: "Test Person",
    status: "active",
    score: 0,
    rank: null,
    band: null,
    employee_assignments: [],
    attendance_entries: [],
    ...over,
  } as unknown as RosterEmployee;
}

function assignment(over: Record<string, unknown> = {}) {
  return {
    id: "a1",
    employee_id: "e1",
    client_id: "c1",
    active: true,
    position: "Picker",
    department: "Inventory Control",
    shift: "1st",
    hourly_rate: 19.5,
    clients: { id: "c1", name: "FabFitFun", city: "Chino" },
    ...over,
  };
}

test("THE JUAN DURAN CASE: an employee with no assignment still gets a row", () => {
  const rows = buildRosterRows([emp({ full_name: "Juan Duran" })]);
  expect(rows).toHaveLength(1);
  expect(rows[0].employee.full_name).toBe("Juan Duran");
  expect(rows[0].assignment).toBeNull();
  expect(rows[0].client).toBeNull();
  expect(rows[0].assignmentCount).toBe(0);
});

test("an assigned employee is unchanged — one row per active assignment", () => {
  const rows = buildRosterRows([
    emp({
      employee_assignments: [
        assignment(),
        assignment({ id: "a2", client_id: "c2", clients: { id: "c2", name: "ISC", city: "Ontario" } }),
      ],
    } as Partial<RosterEmployee>),
  ]);
  expect(rows).toHaveLength(2);
  expect(rows.every((r) => r.assignment !== null)).toBe(true);
  expect(rows.map((r) => r.client?.name).sort()).toEqual(["FabFitFun", "ISC"]);
  expect(rows[0].assignmentCount).toBe(2);
});

test("every employee yields at least one row — nobody can be dropped", () => {
  const input = [
    emp({ id: "e1", full_name: "Unplaced A" }),
    emp({ id: "e2", full_name: "Placed", employee_assignments: [assignment({ employee_id: "e2" })] } as Partial<RosterEmployee>),
    emp({ id: "e3", full_name: "Unplaced B" }),
  ];
  const rows = buildRosterRows(input);
  const seen = new Set(rows.map((r) => r.employee.id));
  expect(seen.size).toBe(3);
  expect(rows.filter((r) => !r.assignment)).toHaveLength(2);
});

test("attendance on an unassigned row is not silently dropped", () => {
  const rows = buildRosterRows([
    emp({
      attendance_entries: [
        { id: "x1", client_id: "c1", date: "2026-09-01", status: "present" },
        { id: "x2", client_id: "c1", date: "2026-09-02", status: "no_show" },
      ],
    } as unknown as Partial<RosterEmployee>),
  ]);
  expect(rows[0].attendance30d).toHaveLength(2);
  expect(rows[0].noShows).toBe(1);
});

test("a missing assignments array is treated as unassigned, not a crash", () => {
  const rows = buildRosterRows([
    { id: "e9", full_name: "No arrays", status: "active", score: 0 } as unknown as RosterEmployee,
  ]);
  expect(rows).toHaveLength(1);
  expect(rows[0].assignment).toBeNull();
});
