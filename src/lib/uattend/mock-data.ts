// Realistic mock uAttend data — RAW-shaped (assumed wire format) so it flows
// through the exact same normalizers the live adapter uses. Swapping to the
// live key changes only WHERE the raw rows come from, never how they're parsed.
//
// Aligned to the seed clients (fafixon, pacific-vines, sonoma-senior, …) and
// some seed employee emails so the ingest step maps them onto real DT rows.
// Includes one NEW hire (not in seed) and one termination so the roster
// auto add/remove sync has something to act on.

import type { RawUattendEmployee } from "./contract";

// uAttend employees. `clientCode` is the DT client slug; `email` is the join key.
export const MOCK_RAW_EMPLOYEES: RawUattendEmployee[] = [
  // — existing seed employees (matched by email) —
  { employeeId: "UA-1001", firstName: "Carlos", lastName: "Mendez", email: "carlos.mendez@drivenpool.com", department: "Warehouse", clientCode: "fafixon", payRate: 24.5, active: true, badge: "1001" },
  { employeeId: "UA-1002", firstName: "Yolanda", lastName: "Foster", email: "y.foster@drivenpool.com", department: "Inventory", clientCode: "abc-logistics", payRate: 28.0, active: true, badge: "1002" },
  { employeeId: "UA-1005", firstName: "Maria", lastName: "Hernandez", email: "maria.h@drivenpool.com", department: "Hospitality", clientCode: "pacific-vines", payRate: 23.0, active: true, badge: "1005" },
  { employeeId: "UA-1013", firstName: "Devon", lastName: "Carter", email: "devon.c@drivenpool.com", department: "Warehouse", clientCode: "metro-distribution", payRate: 21.5, active: true, badge: "1013" },
  // — NEW hire (not in DT seed → roster auto-ADD) —
  { employeeId: "UA-1099", firstName: "Priya", lastName: "Anand", email: "priya.anand@drivenpool.com", department: "Healthcare", clientCode: "sonoma-senior", payRate: 23.0, active: true, badge: "1099" },
  // — TERMINATION signal (active=false → roster auto-REMOVE / flag) —
  { employeeId: "UA-1006", firstName: "Marcus", lastName: "Webb", email: "marcus.w@drivenpool.com", department: "Hospitality", clientCode: "pacific-vines", payRate: 20.0, active: false, badge: "1006" },
];

// Per-employee weekly shape: how many hours land on each weekday (Mon–Sun).
// A couple of employees cross 40h to exercise the overtime split.
const WEEK_PATTERN: Record<string, { hours: number[]; in: string; out: string }> = {
  // 5×8.5 = 42.5h → 40 reg + 2.5 OT
  "UA-1001": { hours: [8.5, 8.5, 8.5, 8.5, 8.5, 0, 0], in: "06:00", out: "14:30" },
  // 5×8 = 40h
  "UA-1002": { hours: [8, 8, 8, 8, 8, 0, 0], in: "06:00", out: "14:00" },
  // 6×8 = 48h → 40 reg + 8 OT (weekend shift)
  "UA-1005": { hours: [8, 8, 8, 8, 8, 8, 0], in: "14:00", out: "22:00" },
  // 4×9 = 36h
  "UA-1013": { hours: [9, 9, 9, 9, 0, 0, 0], in: "14:00", out: "23:00" },
  // new hire, partial first week: 3×8 = 24h
  "UA-1099": { hours: [0, 0, 8, 8, 8, 0, 0], in: "06:00", out: "14:30" },
  // terminated — no hours this week (drives removal)
  "UA-1006": { hours: [0, 0, 0, 0, 0, 0, 0], in: "14:00", out: "22:00" },
};

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Split a day's hours into regular/overtime using a simple weekly-40 rule so
// the mock timecards already carry the reg/OT split the engine expects.
function buildDays(weekStart: string, pattern: number[]) {
  const meta = pattern;
  let cumulative = 0;
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < 7; i++) {
    const h = meta[i] ?? 0;
    if (h <= 0) continue;
    const beforeOt = Math.max(0, 40 - cumulative);
    const regular = Math.min(h, beforeOt);
    const overtime = h - regular;
    cumulative += h;
    out.push({ date: addDays(weekStart, i), regular, overtime, holiday: 0 });
  }
  return out;
}

// Raw timecards for the given Monday. The `in`/`out` come from the pattern so
// each day carries punch times too.
export function mockRawTimecards(weekStart: string): Record<string, unknown>[] {
  return MOCK_RAW_EMPLOYEES.filter((e) => {
    const id = e.employeeId as string;
    const p = WEEK_PATTERN[id];
    return p && p.hours.some((h) => h > 0);
  }).map((e) => {
    const id = e.employeeId as string;
    const p = WEEK_PATTERN[id];
    const days = buildDays(weekStart, p.hours).map((d) => ({
      ...d,
      in: (d.regular as number) + (d.overtime as number) > 0 ? p.in : null,
      out: (d.regular as number) + (d.overtime as number) > 0 ? p.out : null,
    }));
    return {
      employeeId: id,
      weekStart,
      department: e.department,
      clientCode: e.clientCode,
      days,
    };
  });
}

// Raw punch report rows for the given Monday (one punch pair per worked day).
export function mockRawPunches(weekStart: string): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const e of MOCK_RAW_EMPLOYEES) {
    const id = e.employeeId as string;
    const p = WEEK_PATTERN[id];
    if (!p) continue;
    for (let i = 0; i < 7; i++) {
      const h = p.hours[i] ?? 0;
      if (h <= 0) continue;
      rows.push({
        employeeId: id,
        date: addDays(weekStart, i),
        punchIn: p.in,
        punchOut: p.out,
        department: e.department,
        hours: h,
      });
    }
  }
  return rows;
}
