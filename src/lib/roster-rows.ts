import type {
  AttendanceEntry,
  Client,
  Employee,
  EmployeeAssignment,
} from "./supabase/types";
import { weightedAttendancePct, countAttendance } from "./staffing";

// Roster row construction — the Active Employees table's shape.
//
// PURE on purpose: this is the half of listRoster that had the defect, and a
// server-only module cannot be exercised by the logic suite.
//
// THE DEFECT THIS FIXES (2026-09-10)
// listRoster INNER-joined employee_assignments, so an employee with no active
// placement produced no rows at all and vanished from the roster. advanceToPlacement
// deliberately creates the employee with NO assignment — the operator adds one
// afterwards — so every fresh hire was invisible on the exact screen the team uses
// to place them. Measured against production: 11 non-inactive employees had no
// active assignment, including Juan Duran (hired 2026-06-23, status 'active'),
// which is the case Estefany reported.
//
// The rule now: every employee yields at least one row. No placement yields one
// row with a null assignment, which the table renders as "Unassigned".

export type RosterEmployee = Employee & {
  employee_assignments: (EmployeeAssignment & { clients: Client })[];
  attendance_entries: AttendanceEntry[];
};

export type RosterRow = {
  employee: Employee;
  /** Null when the employee is on the roster but not placed with a client yet. */
  assignment: EmployeeAssignment | null;
  client: Client | null;
  assignmentCount: number;
  attendance30d: AttendanceEntry[];
  attendancePct: number;
  missedDays: number;
  noShows: number;
};

export function buildRosterRows(employees: RosterEmployee[]): RosterRow[] {
  const rows: RosterRow[] = [];

  for (const emp of employees) {
    const assignments = emp.employee_assignments ?? [];
    const attendance = emp.attendance_entries ?? [];
    const assignmentCount = assignments.length;

    if (assignmentCount === 0) {
      // Unplaced, but still on the roster. Attendance is unfiltered here because
      // there is no client to scope it to.
      const counts = countAttendance(attendance);
      rows.push({
        employee: emp,
        assignment: null,
        client: null,
        assignmentCount: 0,
        attendance30d: attendance,
        attendancePct: weightedAttendancePct(attendance),
        missedDays: counts.missed + counts.noShow,
        noShows: counts.noShow,
      });
      continue;
    }

    for (const a of assignments) {
      const att = attendance.filter((x) => x.client_id === a.client_id);
      const counts = countAttendance(att);
      rows.push({
        employee: emp,
        assignment: a,
        client: a.clients,
        assignmentCount,
        attendance30d: att,
        attendancePct: weightedAttendancePct(att),
        missedDays: counts.missed + counts.noShow,
        noShows: counts.noShow,
      });
    }
  }

  return rows;
}
