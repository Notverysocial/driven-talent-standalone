// Client-safe timecard helpers — pure functions, no Supabase imports.

import type { TimecardDay, TimecardDays, TimecardStatus } from "./supabase/types";

// ---------------------------------------------------------------------------
// THE PAY WEEK RUNS SUNDAY → SATURDAY.
//
// This array is POSITIONAL: index i is the offset in days from a timecard's
// `week_start`. `dayDate()`, `dayKeyFor()` in the uAttend ingest, and the
// per-day CSV exports all index into it. Reordering the labels without
// reordering this array shifts every employee's hours by one day, which is why
// the Sunday change had to be made here rather than at the display layer.
//
// Corrected 2026-07-20: was ["mon"…"sun"] with an ISO/Monday `startOfWeek`,
// which put the window a day off from DT's actual Sun–Sat pay period and fed
// wrong week boundaries into payroll periods and invoices.
// ---------------------------------------------------------------------------
export const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type DayKey = typeof DAYS[number];

export const DAY_LABEL: Record<DayKey, string> = {
  sun: "Sun",
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
};

export const TIMECARD_STATUSES: { id: TimecardStatus; label: string; tone: "warm" | "amber" | "green" | "red" | "dark" }[] = [
  { id: "draft",     label: "Draft",     tone: "warm" },
  { id: "submitted", label: "Submitted", tone: "amber" },
  { id: "approved",  label: "Approved",  tone: "green" },
  { id: "rejected",  label: "Rejected",  tone: "red" },
];

export function emptyDays(): TimecardDays {
  const d: TimecardDays = {};
  for (const k of DAYS) {
    d[k] = { regular: 0, overtime: 0, holiday: 0, in: null, out: null, locked: false };
  }
  return d;
}

// ---------------------------------------------------------------------------
// Lunch / worked-hours computation
//
// When a day has both an In and an Out punch, worked hours are computed from
// the span minus an unpaid lunch break (default 30 min, editable per day).
// Regular hours are then derived as worked − overtime − holiday, so the daily
// total always equals worked hours net of lunch. Days with no In/Out fall back
// to the manually entered `regular` value (backward compatible).
// ---------------------------------------------------------------------------

export const LUNCH_DEFAULT_MIN = 30;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Minutes since midnight from an "HH:MM" string, or null if unparseable.
export function hmToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

// The unpaid lunch (in minutes) for a day: the day's own value, or the
// standard default when unset. Never negative.
export function dayLunchMin(d: { lunch_min?: number } | undefined): number {
  const v = d?.lunch_min;
  if (v == null || !Number.isFinite(Number(v))) return LUNCH_DEFAULT_MIN;
  return Math.max(0, Number(v));
}

// Total minutes between In and Out (handles a shift crossing midnight).
// Returns null when either punch is missing/unparseable.
export function punchSpanMinutes(
  inT: string | null | undefined,
  outT: string | null | undefined,
): number | null {
  const a = hmToMinutes(inT);
  const b = hmToMinutes(outT);
  if (a == null || b == null) return null;
  let span = b - a;
  if (span < 0) span += 24 * 60; // out before in → shift crossing midnight
  return span;
}

// Worked hours from In/Out minus the unpaid lunch. Returns null when In/Out
// are not both parseable, signalling "fall back to manual regular hours".
export function workedHoursFromPunch(
  inT: string | null | undefined,
  outT: string | null | undefined,
  lunchMin: number,
): number | null {
  const span = punchSpanMinutes(inT, outT);
  if (span == null) return null;
  const worked = span - Math.max(0, lunchMin || 0);
  return round2(Math.max(0, worked) / 60);
}

// Regular hours for a single day. When In/Out are present, derive from worked
// hours (net of lunch) minus OT and holiday. Otherwise use manual `regular`.
export function dayRegularHours(d: TimecardDay | undefined): number {
  if (!d) return 0;
  const worked = workedHoursFromPunch(d.in, d.out, dayLunchMin(d));
  if (worked == null) return Math.max(0, Number(d.regular) || 0);
  const ot = Math.max(0, Number(d.overtime) || 0);
  const hol = Math.max(0, Number(d.holiday) || 0);
  return round2(Math.max(0, worked - ot - hol));
}

// Return a copy of the week with each day's stored `regular` replaced by the
// derived value, so the persisted grid and the rolled-up columns stay in sync.
export function normalizeDays(days: TimecardDays): TimecardDays {
  const next: TimecardDays = {};
  for (const k of DAYS) {
    const d = days[k];
    if (!d) continue;
    next[k] = { ...d, regular: dayRegularHours(d) };
  }
  return next;
}

export function rollupTotals(days: TimecardDays) {
  let reg = 0, ot = 0, hol = 0;
  for (const k of DAYS) {
    const d = days[k];
    if (!d) continue;
    reg += dayRegularHours(d);
    ot  += Number(d.overtime) || 0;
    hol += Number(d.holiday) || 0;
  }
  return {
    reg_hours: round2(reg),
    ot_hours: round2(ot),
    holiday_hours: round2(hol),
    total: round2(reg + ot + hol),
  };
}

// Federal-style auto-OT: if regular total > 40, push the excess into OT before
// submission. Operator's manual day-level OT entries are preserved; we only add
// to OT, never subtract. Locked days are skipped — operator marked them frozen.
export function autoOvertimeAdjustment(days: TimecardDays): TimecardDays {
  const { reg_hours } = rollupTotals(days);
  if (reg_hours <= 40) return days;
  let excess = reg_hours - 40;
  const next: TimecardDays = JSON.parse(JSON.stringify(days));
  // Latest day first, so the >40h excess rolls off the END of the pay week.
  // Sun–Sat week ⇒ Saturday is the last day, Sunday the first.
  const order: DayKey[] = ["sat", "fri", "thu", "wed", "tue", "mon", "sun"];
  for (const k of order) {
    if (excess <= 0) break;
    const d = next[k];
    if (!d || d.locked) continue;
    const r = Number(d.regular) || 0;
    if (r <= 0) continue;
    const move = Math.min(r, excess);
    d.regular = r - move;
    d.overtime = (Number(d.overtime) || 0) + move;
    excess -= move;
  }
  return next;
}

// The SUNDAY that opens the pay week containing `date`. DT's pay period is
// Sun–Sat, so this is deliberately NOT the ISO/Monday week: JS getDay() is
// already 0 = Sunday, so the offset is the raw day number.
export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // getDay(): 0 = Sunday
  return d;
}

export function fmtWeekRange(weekStart: string): string {
  const d = new Date(weekStart + "T00:00:00");
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  const fmt = (x: Date) =>
    x.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(d)} — ${fmt(end)}`;
}

// "YYYY-MM-DD" for a Date, read off its LOCAL calendar fields. `toISOString()`
// would re-project local midnight into UTC and can land on the previous day.
export function ymdLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// The Sunday opening the current pay week, as "YYYY-MM-DD".
export function currentWeekStart(d: Date = new Date()): string {
  return ymdLocal(startOfWeek(d));
}

export function dayDate(weekStart: string, key: DayKey): string {
  const idx = DAYS.indexOf(key);
  const d = new Date(weekStart + "T00:00:00");
  d.setDate(d.getDate() + idx);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function estimatedGross(days: TimecardDays, rate: number): number {
  const { reg_hours, ot_hours, holiday_hours } = rollupTotals(days);
  return reg_hours * rate + ot_hours * rate * 1.5 + holiday_hours * rate;
}
