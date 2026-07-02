// uAttend (WorkwellTech) API contract.
//
// This file is the SINGLE source of truth for the documented uAttend API
// shape. It is dependency-free (no server-only imports) so both the live
// adapter and the mock adapter, and any test, can import it.
//
// Documented contract (from the Rocio call):
//   * Base URL  : https://api.workwelltech.com
//   * Auth      : header `x-api-key: <key>`
//   * Endpoints : /employee, /timecards, /reports/punch
//
// ⚠️ DATA-SHAPE ASSUMPTIONS (confirm against the real API before the live
// pull). The RAW types below encode our best guess at the field names the
// endpoints return. The normalizers are deliberately tolerant of common
// alternate spellings (camelCase / snake_case, id vs employeeId, etc.) so a
// minor naming mismatch is a one-line fix in the normalizer, not a rewrite.
// Everything downstream of this file consumes the NORMALIZED domain types, so
// the live ↔ mock swap and any field correction stay isolated here.

export const UATTEND_BASE = "https://api.workwelltech.com";
export const UATTEND_API_KEY_HEADER = "x-api-key";

export const UATTEND_ENDPOINTS = {
  // Corrected 2026-07-02 against the official uAttend "Exposed API" docs +
  // an empirical probe: the real endpoints are /user, /timecard, /reports/punch
  // (POST, JSON body, header x-api-key). Previously /employee + /timecards (GET)
  // which do not exist on api.workwelltech.com.
  employees: "/user",
  timecards: "/timecard",
  punchReport: "/reports/punch",
} as const;

// ---------------------------------------------------------------------------
// Normalized DOMAIN types — what the engine consumes. Stable regardless of the
// raw API shape.
// ---------------------------------------------------------------------------

export type UattendEmployee = {
  uattendId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string | null;
  department: string | null;
  /** Maps to a DT client — by client slug or short code. Null if not provided. */
  clientCode: string | null;
  payRate: number | null;
  active: boolean;
  badge: string | null;
};

export type UattendDayHours = {
  date: string; // YYYY-MM-DD
  regular: number;
  overtime: number;
  holiday: number;
  in: string | null; // HH:MM (24h)
  out: string | null;
};

export type UattendTimecard = {
  uattendId: string; // the employee's uAttend id
  weekStart: string; // Monday, YYYY-MM-DD
  department: string | null;
  clientCode: string | null;
  days: UattendDayHours[];
  regularHours: number;
  overtimeHours: number;
  holidayHours: number;
};

export type UattendPunch = {
  uattendId: string;
  date: string; // YYYY-MM-DD
  punchIn: string | null; // HH:MM
  punchOut: string | null;
  department: string | null;
  hours: number;
  paycodeId: number | null; // 1=Regular, 2=Vac, 3=Sick, 4=Holiday, 5=Other, 6=break, 7=lunch
};

export type UattendDateRange = { startDate: string; endDate: string };

// ---------------------------------------------------------------------------
// RAW types — the assumed wire shape. Loose by design (every field optional /
// multi-typed) so the normalizers can absorb naming variance.
// ---------------------------------------------------------------------------

export type RawUattendEmployee = Record<string, unknown>;
export type RawUattendTimecard = Record<string, unknown>;
export type RawUattendPunch = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Response unwrapping — uAttend responses vary by plan: a bare array, or
// wrapped under { data }, { employees }, { timecards }, { punches }, { results }.
// ---------------------------------------------------------------------------

export function unwrapList(json: unknown, ...keys: string[]): Record<string, unknown>[] {
  if (Array.isArray(json)) return json as Record<string, unknown>[];
  if (json && typeof json === "object") {
    const obj = json as Record<string, unknown>;
    for (const k of [...keys, "data", "results"]) {
      if (Array.isArray(obj[k])) return obj[k] as Record<string, unknown>[];
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Field coercion helpers
// ---------------------------------------------------------------------------

function s(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

function n(...vals: unknown[]): number | null {
  for (const v of vals) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

function bool(...vals: unknown[]): boolean | null {
  for (const v of vals) {
    if (typeof v === "boolean") return v;
    if (typeof v === "string") {
      const t = v.trim().toLowerCase();
      if (["true", "active", "1", "yes", "y"].includes(t)) return true;
      if (["false", "inactive", "terminated", "0", "no", "n"].includes(t)) return false;
    }
    if (typeof v === "number") return v !== 0;
  }
  return null;
}

function ymd(v: unknown): string | null {
  const str = s(v);
  if (!str) return null;
  const d = new Date(str.length <= 10 ? `${str}T00:00:00` : str);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function hm(v: unknown): string | null {
  const str = s(v);
  if (!str) return null;
  // Accept "HH:MM", "HH:MM:SS", or an ISO timestamp; emit HH:MM.
  const m = str.match(/(\d{1,2}):(\d{2})/);
  if (m) return `${m[1].padStart(2, "0")}:${m[2]}`;
  const d = new Date(str);
  if (!Number.isNaN(d.getTime())) {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  return null;
}

// Monday-of-week for a YYYY-MM-DD date (matches the DB timecards.week_start rule).
export function mondayOf(dateYmd: string): string {
  const d = new Date(`${dateYmd}T00:00:00`);
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - dow);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Normalizers RAW → DOMAIN
// ---------------------------------------------------------------------------

export function normalizeEmployee(raw: RawUattendEmployee): UattendEmployee | null {
  const id = s(raw.UserId, raw.employeeId, raw.employee_id, raw.id, raw.userId, raw.user_id);
  if (!id) return null;
  const first = s(raw.FirstName, raw.firstName, raw.first_name, raw.fname) ?? "";
  const last = s(raw.LastName, raw.lastName, raw.last_name, raw.lname) ?? "";
  const fullName = s(raw.fullName, raw.full_name, raw.name) ?? `${first} ${last}`.trim();
  return {
    uattendId: id,
    firstName: first,
    lastName: last,
    fullName: fullName || id,
    email: s(raw.Email, raw.email, raw.emailAddress, raw.email_address),
    department: s(raw.DepartmentName, raw.DepartmentId, raw.department, raw.departmentName, raw.department_name, raw.dept),
    clientCode: s(raw.clientCode, raw.client_code, raw.company, raw.companyCode, raw.location, raw.DepartmentName),
    payRate: n(raw.payRate, raw.pay_rate, raw.wage, raw.hourlyRate, raw.hourly_rate),
    active: bool(raw.IsActive, raw.active, raw.status, raw.isActive, raw.is_active) ?? true,
    badge: s(raw.PayrollNumber, raw.badge, raw.pin, raw.badgeNumber, raw.badge_number),
  };
}

export function normalizeDay(raw: Record<string, unknown>): UattendDayHours | null {
  const date = ymd(raw.date ?? raw.workDate ?? raw.work_date ?? raw.day);
  if (!date) return null;
  return {
    date,
    regular: n(raw.regular, raw.regularHours, raw.regular_hours, raw.reg) ?? 0,
    overtime: n(raw.overtime, raw.overtimeHours, raw.overtime_hours, raw.ot) ?? 0,
    holiday: n(raw.holiday, raw.holidayHours, raw.holiday_hours, raw.hol) ?? 0,
    in: hm(raw.in ?? raw.punchIn ?? raw.punch_in ?? raw.timeIn ?? raw.clockIn),
    out: hm(raw.out ?? raw.punchOut ?? raw.punch_out ?? raw.timeOut ?? raw.clockOut),
  };
}

export function normalizeTimecard(raw: RawUattendTimecard): UattendTimecard | null {
  const id = s(raw.employeeId, raw.employee_id, raw.id, raw.userId);
  if (!id) return null;

  const rawDays = Array.isArray(raw.days)
    ? (raw.days as Record<string, unknown>[])
    : Array.isArray(raw.dailyHours)
      ? (raw.dailyHours as Record<string, unknown>[])
      : [];
  const days = rawDays.map(normalizeDay).filter((d): d is UattendDayHours => d !== null);

  // weekStart: explicit, else derived from the first day, else the period start.
  const explicitWeek = ymd(raw.weekStart ?? raw.week_start ?? raw.periodStart ?? raw.period_start);
  const weekStart = explicitWeek ?? (days[0] ? mondayOf(days[0].date) : null);
  if (!weekStart) return null;

  const reg = n(raw.regularHours, raw.regular_hours, raw.regular) ?? days.reduce((a, d) => a + d.regular, 0);
  const ot = n(raw.overtimeHours, raw.overtime_hours, raw.overtime) ?? days.reduce((a, d) => a + d.overtime, 0);
  const hol = n(raw.holidayHours, raw.holiday_hours, raw.holiday) ?? days.reduce((a, d) => a + d.holiday, 0);

  return {
    uattendId: id,
    weekStart,
    department: s(raw.department, raw.departmentName, raw.department_name, raw.dept),
    clientCode: s(raw.clientCode, raw.client_code, raw.company, raw.location),
    days,
    regularHours: reg,
    overtimeHours: ot,
    holidayHours: hol,
  };
}

export function normalizePunch(raw: RawUattendPunch): UattendPunch | null {
  const id = s(raw.UserId, raw.employeeId, raw.employee_id, raw.id, raw.userId);
  const date = ymd(raw.PunchDate ?? raw.date ?? raw.workDate ?? raw.punchDate ?? raw.InDate);
  if (!id || !date) return null;
  return {
    uattendId: id,
    date,
    punchIn: hm(raw.InTime ?? raw.punchIn ?? raw.punch_in ?? raw.in ?? raw.timeIn),
    punchOut: hm(raw.OutTime ?? raw.punchOut ?? raw.punch_out ?? raw.out ?? raw.timeOut),
    department: s(raw.DepartmentName, raw.department, raw.departmentName, raw.dept),
    // "Tot" is decimal hours in the real /reports/punch line item (e.g. "8.37").
    hours: n(raw.Tot, raw.hours, raw.totalHours, raw.total_hours) ?? 0,
    paycodeId: n(raw.PaycodeId, raw.paycodeId, raw.paycode_id),
  };
}
