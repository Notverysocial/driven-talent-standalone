// Client-safe timecard helpers — pure functions, no Supabase imports.

import type { TimecardDays, TimecardStatus } from "./supabase/types";

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayKey = typeof DAYS[number];

export const DAY_LABEL: Record<DayKey, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
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

export function rollupTotals(days: TimecardDays) {
  let reg = 0, ot = 0, hol = 0;
  for (const k of DAYS) {
    const d = days[k];
    if (!d) continue;
    reg += Number(d.regular) || 0;
    ot  += Number(d.overtime) || 0;
    hol += Number(d.holiday) || 0;
  }
  return { reg_hours: reg, ot_hours: ot, holiday_hours: hol, total: reg + ot + hol };
}

// Federal-style auto-OT: if regular total > 40, push the excess into OT before
// submission. Operator's manual day-level OT entries are preserved; we only add
// to OT, never subtract. Locked days are skipped — operator marked them frozen.
export function autoOvertimeAdjustment(days: TimecardDays): TimecardDays {
  const { reg_hours } = rollupTotals(days);
  if (reg_hours <= 40) return days;
  let excess = reg_hours - 40;
  const next: TimecardDays = JSON.parse(JSON.stringify(days));
  const order: DayKey[] = ["sun", "sat", "fri", "thu", "wed", "tue", "mon"];
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

export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // ISO Monday = 1. JS Sunday = 0 → treat as 7.
  const day = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() - (day - 1));
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

export function isoWeekStart(d: Date = new Date()): string {
  return startOfWeek(d).toISOString().slice(0, 10);
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
