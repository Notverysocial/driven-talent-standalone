import { EMPLOYEES, type Employee } from "./employees";

export type AttendanceStatus = "present" | "missed" | "late" | "excused";

export type AttendanceRecord = {
  employeeId: string;
  date: string;
  status: AttendanceStatus;
  notes?: string;
};

export type PerformanceTier = "green" | "yellow" | "red";

const SEED_DAYS = 30;

function seededInt(seed: string, salt: number): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= salt;
  h = Math.imul(h, 16777619);
  return Math.abs(h);
}

function pickStatus(emp: Employee, dayIndex: number): AttendanceStatus {
  const r = seededInt(emp.id, dayIndex) % 100;
  const baseMissBudget = Math.max(0, Math.round((100 - emp.score) / 6));
  const slot = (dayIndex + seededInt(emp.id, 99)) % 30;
  if (slot < baseMissBudget) {
    const flavor = seededInt(emp.id, dayIndex + 7) % 10;
    if (flavor < 2) return "excused";
    if (flavor < 5) return "late";
    return "missed";
  }
  if (r < 4) return "late";
  return "present";
}

const REFERENCE_DATE = new Date("2026-05-02T00:00:00Z");

function isoDay(offsetFromToday: number): string {
  const d = new Date(REFERENCE_DATE);
  d.setUTCDate(d.getUTCDate() - offsetFromToday);
  return d.toISOString().slice(0, 10);
}

export function seedAttendance(): AttendanceRecord[] {
  const records: AttendanceRecord[] = [];
  for (const emp of EMPLOYEES) {
    for (let i = 0; i < SEED_DAYS; i++) {
      const status = pickStatus(emp, i);
      records.push({
        employeeId: emp.id,
        date: isoDay(i),
        status,
      });
    }
  }
  return records;
}

export type AttendanceSummary = {
  total: number;
  present: number;
  missed: number;
  late: number;
  excused: number;
  attendanceRate: number;
};

export function summarize(records: AttendanceRecord[]): AttendanceSummary {
  const total = records.length;
  let present = 0;
  let missed = 0;
  let late = 0;
  let excused = 0;
  for (const r of records) {
    if (r.status === "present") present++;
    else if (r.status === "missed") missed++;
    else if (r.status === "late") late++;
    else if (r.status === "excused") excused++;
  }
  const attendanceRate = total === 0 ? 0 : (present + late) / total;
  return { total, present, missed, late, excused, attendanceRate };
}

export function summarizeFor(
  records: AttendanceRecord[],
  employeeId: string
): AttendanceSummary {
  return summarize(records.filter((r) => r.employeeId === employeeId));
}

export function performanceTier(
  score: number,
  missedDays: number
): PerformanceTier {
  if (score >= 85 && missedDays <= 1) return "green";
  if (score < 65 || missedDays >= 4) return "red";
  return "yellow";
}

export const TIER_LABEL: Record<PerformanceTier, string> = {
  green: "On Track",
  yellow: "Watch",
  red: "At Risk",
};

export function statusLabel(s: AttendanceStatus): string {
  switch (s) {
    case "present":
      return "Present";
    case "missed":
      return "Missed";
    case "late":
      return "Late";
    case "excused":
      return "Excused";
  }
}
