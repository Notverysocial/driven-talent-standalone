import { test, expect } from "@playwright/test";
import {
  ELIGIBILITY_LABEL,
  ELIGIBILITY_TONE,
  resolveSeparationEligibility,
  type EmployeeSeparation,
} from "../../src/lib/team";

// A Do Not Return employee was rendering the GREEN "Eligible for rehire" badge
// on /team/terminated, and counting in the "eligible to return" stat tile.
//
// ---------------------------------------------------------------------------
// WHY IT HAPPENED — two writers, one reader, and a default that lies
//
// markDoNotReturn() (roster/actions.ts) writes the standalone `do_not_return`
// table and flips employees.status = 'do_not_return'. It never wrote an
// `employee_separations` row.
//
// /team/terminated reads listSeparatedEmployees(), which selects employees with
// status in ('terminated','do_not_return') — so the DNR employee DOES appear —
// and then derived the badge from the SEPARATION only:
//
//     const eligibility = separation?.eligibility ?? "eligible";
//
// No separation row, so the `?? "eligible"` fallback fired and the most
// dangerous state in the system rendered as the safest-looking one. The row was
// on the page the whole time; nobody read it as a bug because the badge looked
// deliberate.
//
// PR #73 fixed the same class of error on the CANDIDATE side
// (candidate-eligibility.ts). candidate-eligibility.ts is imported nowhere
// under team/ or roster/, so the employee side kept the old behaviour.
//
// THE RULE: the employee's own status is authoritative for the bar. A
// separation row can REFINE the picture (which reason, whose client, what
// note), but it can never downgrade a do_not_return employee to eligible, and
// its ABSENCE must never be read as "fine".
// ---------------------------------------------------------------------------

const sep = (over: Partial<EmployeeSeparation> = {}): EmployeeSeparation => ({
  id: "sep-1",
  employee_id: "emp-1",
  separation_date: "2026-07-01",
  reason: "conduct",
  eligibility: "eligible",
  client_id: null,
  last_position: null,
  detail: null,
  do_not_return_note: null,
  processed_by: null,
  final_check_issued: false,
  final_check_date: null,
  equipment_returned: false,
  exit_interview_done: false,
  rehire_allowed_clients: [],
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
  ...over,
});

test.describe("resolveSeparationEligibility — employee status is authoritative", () => {
  test("THE BUG: DNR employee with NO separation row is not 'eligible'", () => {
    // This is the exact production shape markDoNotReturn() leaves behind.
    const e = resolveSeparationEligibility({
      employeeStatus: "do_not_return",
      separation: null,
    });
    expect(e).toBe("do_not_return");
    expect(ELIGIBILITY_LABEL[e]).toBe("Do Not Return");
    expect(ELIGIBILITY_TONE[e]).toBe("red");
  });

  test("THE BUG, stated as the thing a recruiter sees", () => {
    const e = resolveSeparationEligibility({
      employeeStatus: "do_not_return",
      separation: null,
    });
    expect(ELIGIBILITY_LABEL[e]).not.toBe("Eligible for rehire");
    expect(ELIGIBILITY_TONE[e]).not.toBe("green");
  });

  test("a stale separation row cannot downgrade a DNR employee", () => {
    // Someone separated 'eligible', later flagged DNR through the roster
    // action. The newer, stronger bar wins.
    const e = resolveSeparationEligibility({
      employeeStatus: "do_not_return",
      separation: sep({ eligibility: "eligible" }),
    });
    expect(e).toBe("do_not_return");
  });

  test("a 'conditional' separation is also overridden by a DNR status", () => {
    expect(
      resolveSeparationEligibility({
        employeeStatus: "do_not_return",
        separation: sep({ eligibility: "conditional" }),
      }),
    ).toBe("do_not_return");
  });

  test("the separation row still wins when the employee is merely terminated", () => {
    // The fix must not flatten everything to DNR — a real separation record is
    // still the more specific answer for a normally-terminated employee.
    expect(
      resolveSeparationEligibility({
        employeeStatus: "terminated",
        separation: sep({ eligibility: "do_not_return" }),
      }),
    ).toBe("do_not_return");
    expect(
      resolveSeparationEligibility({
        employeeStatus: "terminated",
        separation: sep({ eligibility: "conditional" }),
      }),
    ).toBe("conditional");
    expect(
      resolveSeparationEligibility({
        employeeStatus: "terminated",
        separation: sep({ eligibility: "eligible" }),
      }),
    ).toBe("eligible");
  });

  test("terminated with no separation row stays 'eligible' — unchanged", () => {
    // Only the do_not_return status changes meaning. A plain termination with
    // no paperwork is not evidence of a bar, and inventing one would hide
    // genuinely rehireable people.
    expect(
      resolveSeparationEligibility({
        employeeStatus: "terminated",
        separation: null,
      }),
    ).toBe("eligible");
  });

  test("an active employee with no separation is 'eligible'", () => {
    expect(
      resolveSeparationEligibility({ employeeStatus: "active", separation: null }),
    ).toBe("eligible");
  });

  test("a null/unknown status degrades to the separation, then to eligible", () => {
    expect(
      resolveSeparationEligibility({ employeeStatus: null, separation: null }),
    ).toBe("eligible");
    expect(
      resolveSeparationEligibility({
        employeeStatus: null,
        separation: sep({ eligibility: "do_not_return" }),
      }),
    ).toBe("do_not_return");
  });

  test("the tile split: a DNR employee never lands in the eligible bucket", () => {
    // Mirrors the three filters on /team/terminated. The counts must partition
    // the rows exactly once — the old code put this row in `eligible`.
    const rows = [
      { employeeStatus: "do_not_return" as const, separation: null },
      { employeeStatus: "terminated" as const, separation: sep({ eligibility: "eligible" }) },
      { employeeStatus: "terminated" as const, separation: sep({ eligibility: "conditional" }) },
      { employeeStatus: "terminated" as const, separation: null },
    ];
    const resolved = rows.map(resolveSeparationEligibility);

    const dnr = resolved.filter((e) => e === "do_not_return");
    const conditional = resolved.filter((e) => e === "conditional");
    const eligible = resolved.filter((e) => e === "eligible");

    expect(dnr.length).toBe(1);
    expect(conditional.length).toBe(1);
    expect(eligible.length).toBe(2);
    expect(dnr.length + conditional.length + eligible.length).toBe(rows.length);
  });
});
