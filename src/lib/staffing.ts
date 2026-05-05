// Client-safe staffing helpers — pure functions, no Supabase imports.
// Both server pages and client components can import from here.

import type { AttendanceEntry, AttendanceStatus, ScoreBand } from "./supabase/types";

export const POSITIONS = [
  "Forklift Driver",
  "Inventory Control",
  "Receiving Clerk",
  "Shipping Clerk",
  "Pick / Pack",
  "Warehouse Associate",
  "Lead",
  "Lead Line Cook",
  "Front Desk Lead",
  "Banquet Server",
] as const;

export const DEPARTMENTS = [
  "Warehouse",
  "Inventory",
  "Receiving",
  "Shipping",
  "Logistics",
  "Hospitality",
] as const;

export const SHIFTS = [
  "1st (6a–2p)",
  "2nd (2p–10p)",
  "3rd (10p–6a)",
] as const;

export type Position = typeof POSITIONS[number];
export type Department = typeof DEPARTMENTS[number];
export type Shift = typeof SHIFTS[number];

export type AttendanceCounts = {
  present: number;
  late: number;
  missed: number;
  noShow: number;
  excused: number;
  total: number;
};

export function countAttendance(records: AttendanceEntry[]): AttendanceCounts {
  let present = 0, late = 0, missed = 0, noShow = 0, excused = 0;
  for (const r of records) {
    if (r.status === "present") present++;
    else if (r.status === "late") late++;
    else if (r.status === "missed") missed++;
    else if (r.status === "no_show") noShow++;
    else if (r.status === "excused") excused++;
  }
  return { present, late, missed, noShow, excused, total: present + late + missed + noShow + excused };
}

// Weighted attendance %: (present + 0.5×late) / scoreable × 100.
// Excused days don't count against the rate (protected leave).
export function weightedAttendancePct(records: AttendanceEntry[]): number {
  const c = countAttendance(records);
  const scoreable = c.present + c.late + c.missed + c.noShow;
  if (scoreable === 0) return 0;
  return Math.round(((c.present + c.late * 0.5) / scoreable) * 1000) / 10;
}

export function lastNDays(records: AttendanceEntry[], n: number): AttendanceEntry[] {
  return [...records].sort((a, b) => b.date.localeCompare(a.date)).slice(0, n);
}

export function bandFromScore(score: number): ScoreBand | null {
  if (score === 0) return null;
  if (score >= 85) return "green";
  if (score >= 70) return "yellow";
  return "red";
}

export function bandColor(b: ScoreBand | null): {
  fg: string;
  bg: string;
  tone: "green" | "amber" | "red" | "warm";
  label: string;
} {
  if (b === "green") return { fg: "var(--dt-success)", bg: "var(--dt-success-bg)", tone: "green", label: "Green" };
  if (b === "yellow") return { fg: "var(--dt-warning)", bg: "var(--dt-warning-bg)", tone: "amber", label: "Yellow" };
  if (b === "red") return { fg: "var(--dt-danger)", bg: "var(--dt-danger-bg)", tone: "red", label: "Red" };
  return { fg: "var(--dt-warm-500)", bg: "var(--dt-warm-100)", tone: "warm", label: "Onboarding" };
}

export const ATTENDANCE_DOT_COLOR: Record<AttendanceStatus, string> = {
  present: "var(--dt-success)",
  late: "var(--dt-warning)",
  missed: "var(--dt-danger)",
  no_show: "var(--dt-danger)",
  excused: "var(--dt-warm-300)",
};

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  present: "Present",
  late: "Late",
  missed: "Missed",
  no_show: "No-Show",
  excused: "Excused",
};

export function attendanceColor(pct: number): string {
  if (pct >= 95) return "var(--dt-success)";
  if (pct >= 85) return "var(--dt-gold-deep)";
  if (pct >= 70) return "#C28B1E";
  return "var(--dt-danger)";
}

export function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}
