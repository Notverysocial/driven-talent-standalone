// Client-safe payroll helpers — pure functions, no Supabase imports.

import { DAYS } from "./timecards";
import type { PayrollPeriodStatus, TimecardDays, TimecardFlags } from "./supabase/types";

export const PAYROLL_PERIOD_STATUSES: {
  id: PayrollPeriodStatus;
  label: string;
  tone: "warm" | "amber" | "gold" | "green" | "dark";
}[] = [
  { id: "open",      label: "Open · Auditing",      tone: "warm" },
  { id: "audited",   label: "Audited",              tone: "amber" },
  { id: "submitted", label: "Sent to Clients",      tone: "gold" },
  { id: "approved",  label: "Client Approved",      tone: "green" },
  { id: "closed",    label: "Closed · Invoiced",    tone: "dark" },
];

export const FLAG_LABELS: Record<keyof TimecardFlags, string> = {
  missed_punch: "Missed punch",
  punch_day: "Day",
  hours_mismatch: "Hours mismatch",
  reason: "Reason",
};

// Compute flags from a timecard's day grid. Run on submit so audit pages
// see consistent flagging without trusting whatever was saved on the
// row. Operators can override via notes.
export function computeFlags(days: TimecardDays): TimecardFlags {
  const flags: TimecardFlags = {};
  // Iterate in PAY-WEEK order (Sun–Sat) using the shared array, not a local
  // Monday-first literal. This reads days[k] by key so it can never misattribute
  // hours, but it `break`s on the first missed punch — so a Monday-first order
  // reported the wrong day as `punch_day` when a Sunday and a later weekday were
  // both missing. Found during the pre-merge boundary audit, 2026-07-20: it was
  // the last hardcoded day array left in src.
  for (const k of DAYS) {
    const d = days[k];
    if (!d) continue;
    const hasHours = (Number(d.regular) || 0) + (Number(d.overtime) || 0) + (Number(d.holiday) || 0) > 0;
    if (hasHours && (!d.in || !d.out)) {
      flags.missed_punch = true;
      flags.punch_day = k;
      break;
    }
  }
  return flags;
}

export function fmtPeriodRange(start: string, end: string): string {
  const s = new Date(start + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const e = new Date(end + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${s} — ${e}`;
}

export function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Federal-style billable cost (what client pays before service fee).
// Regular at hourly rate; OT at 1.5×; holiday at hourly rate.
export function billableCost(reg: number, ot: number, holiday: number, rate: number): number {
  return reg * rate + ot * rate * 1.5 + holiday * rate;
}
