// Peoplease (PrismHR) payroll export — CONFIGURABLE column mapping.
//
// ⚠️ PROVISIONAL FORMAT. Peoplease has not yet confirmed their exact PrismHR
// payroll IMPORT spec (which columns, header labels, order). This file is the
// SINGLE place that defines the output: edit PEOPLEASE_PAYROLL_COLUMNS (rename
// headers, reorder, add/remove) and every export changes with it — no route or
// UI code needs to change. Once Peoplease confirms their spec, matching it is a
// one-file edit here.
//
// Two profiles ship:
//   * peoplease_payroll — the rich per-employee payroll file (default).
//   * standard_hours    — a plain uAttend-style hours export, in case Peoplease
//                         accepts a standard hours file rather than a custom
//                         import.
//
// Pure module (no server/db imports) so it can be unit-tested and imported
// anywhere. The per-period row data is assembled in peoplease-export.server.ts.

export const PEOPLEASE_EXPORT_PROVISIONAL_NOTE =
  "Provisional format: these columns/labels are a sensible payroll default. " +
  "They'll be matched to Peoplease's confirmed PrismHR payroll import spec in " +
  "one edit (src/lib/peoplease-export.ts) once they provide it.";

export type PeopleaseExportRow = {
  employeeName: string;
  externalId: string; // employees.legacy_id (PEO / external id); "" if none
  company: string; // primary client for the period; "" if none
  periodStart: string; // ISO yyyy-mm-dd
  periodEnd: string; // ISO yyyy-mm-dd
  regHours: number;
  otHours: number;
  holidayHours: number;
  sickHours: number;
  payRate: number | null; // employee wage from the timecard snapshot
  totalHours: number;
  grossPay: number | null; // reg*rate + ot*rate*1.5 + holiday*rate; null if no rate
};

export type PeopleaseColumn = {
  key: string;
  header: string;
  value: (r: PeopleaseExportRow) => string;
};

const hrs = (n: number) => n.toFixed(2);
const money = (n: number | null) => (n == null ? "" : n.toFixed(2));

// --- THE editable Peoplease payroll column set --------------------------
// Reorder / rename / add / remove here to match Peoplease's confirmed spec.
export const PEOPLEASE_PAYROLL_COLUMNS: PeopleaseColumn[] = [
  { key: "employee", header: "Employee Name", value: (r) => r.employeeName },
  { key: "peo_id", header: "PEO / Employee ID", value: (r) => r.externalId },
  { key: "company", header: "Company / Client", value: (r) => r.company },
  { key: "period_start", header: "Pay Period Start", value: (r) => r.periodStart },
  { key: "period_end", header: "Pay Period End", value: (r) => r.periodEnd },
  { key: "reg", header: "Regular Hours", value: (r) => hrs(r.regHours) },
  { key: "ot", header: "OT Hours", value: (r) => hrs(r.otHours) },
  { key: "holiday", header: "Holiday Hours", value: (r) => hrs(r.holidayHours) },
  { key: "sick", header: "Sick Hours", value: (r) => hrs(r.sickHours) },
  { key: "rate", header: "Pay Rate", value: (r) => money(r.payRate) },
  { key: "total_hours", header: "Total Hours", value: (r) => hrs(r.totalHours) },
  { key: "gross", header: "Gross Pay", value: (r) => money(r.grossPay) },
];

// --- Plain "standard hours" export (uAttend-style) ----------------------
export const STANDARD_HOURS_COLUMNS: PeopleaseColumn[] = [
  { key: "employee", header: "Employee", value: (r) => r.employeeName },
  { key: "peo_id", header: "Employee ID", value: (r) => r.externalId },
  { key: "period_start", header: "Period Start", value: (r) => r.periodStart },
  { key: "period_end", header: "Period End", value: (r) => r.periodEnd },
  { key: "reg", header: "Regular", value: (r) => hrs(r.regHours) },
  { key: "ot", header: "Overtime", value: (r) => hrs(r.otHours) },
  { key: "total_hours", header: "Total Hours", value: (r) => hrs(r.totalHours) },
];

export const PEOPLEASE_EXPORT_PROFILES = {
  peoplease_payroll: {
    label: "Peoplease payroll",
    columns: PEOPLEASE_PAYROLL_COLUMNS,
    filenameSuffix: "peoplease-payroll",
  },
  standard_hours: {
    label: "Standard hours",
    columns: STANDARD_HOURS_COLUMNS,
    filenameSuffix: "standard-hours",
  },
} as const;

export type PeopleaseExportProfile = keyof typeof PEOPLEASE_EXPORT_PROFILES;

export function isPeopleaseExportProfile(v: string): v is PeopleaseExportProfile {
  return v === "peoplease_payroll" || v === "standard_hours";
}

function csvCell(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Build the CSV text (header row + one row per employee) for a column set.
export function buildPeopleaseCsv(
  rows: PeopleaseExportRow[],
  columns: PeopleaseColumn[],
): string {
  const header = columns.map((c) => csvCell(c.header)).join(",");
  const body = rows.map((r) => columns.map((c) => csvCell(c.value(r))).join(","));
  return [header, ...body].join("\n") + "\n";
}

// Compute gross pay from hours + rate (OT at 1.5×). Null when rate is unknown.
export function computeGrossPay(
  reg: number,
  ot: number,
  holiday: number,
  rate: number | null,
): number | null {
  if (rate == null) return null;
  return reg * rate + ot * rate * 1.5 + holiday * rate;
}
