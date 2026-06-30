import "server-only";
import { createClient } from "@/lib/supabase/server";
import { DAYS, DAY_LABEL, fmtWeekRange } from "@/lib/timecards";
import type { Client, TimecardDays } from "@/lib/supabase/types";
import {
  REPORT_TEMPLATE_BY_KEY,
  resolveTemplateKey,
  type ReportTemplateKey,
} from "./templates";
import type { ReportColumn, ReportResult, ReportRow } from "./result";

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

type ReportTimecard = {
  id: string;
  employee_id: string;
  week_start: string;
  days: TimecardDays;
  reg_hours: number;
  ot_hours: number;
  holiday_hours: number;
  total_hours: number;
  status: string;
  employees: { full_name: string } | null;
};

// Build a customizable weekly report for one client, from that client's time
// cards for the given week. The template (explicit or derived from the client's
// report_format) decides the shape. Returns null if the client doesn't exist.
export async function buildClientWeeklyReport(opts: {
  clientId: string;
  weekStart: string;
  templateKey?: ReportTemplateKey;
}): Promise<ReportResult | null> {
  const sb = await createClient();

  const { data: clientRow } = await sb
    .from("clients")
    .select("id, name, report_format, report_template_key")
    .eq("id", opts.clientId)
    .maybeSingle();
  if (!clientRow) return null;
  const client = clientRow as Pick<
    Client,
    "id" | "name" | "report_format" | "report_template_key"
  >;

  const templateKey =
    opts.templateKey ??
    resolveTemplateKey(client.report_template_key, client.report_format);
  const template = REPORT_TEMPLATE_BY_KEY[templateKey];

  const { data: tcData } = await sb
    .from("timecards")
    .select(
      "id, employee_id, week_start, days, reg_hours, ot_hours, holiday_hours, total_hours, status, employees ( full_name )",
    )
    .eq("client_id", opts.clientId)
    .eq("week_start", opts.weekStart)
    .order("week_start");
  const timecards = (tcData ?? []) as unknown as ReportTimecard[];

  const base = {
    templateKey,
    templateLabel: template.label,
    clientId: client.id,
    clientName: client.name,
    weekStart: opts.weekStart,
    weekLabel: fmtWeekRange(opts.weekStart),
    employeeCount: new Set(timecards.map((t) => t.employee_id)).size,
  };

  if (templateKey === "hours_spent") {
    return { ...base, ...buildHoursSpentMatrix(timecards) };
  }
  if (templateKey === "timecard_daily") {
    return { ...base, ...buildTimecardDaily(timecards) };
  }
  return { ...base, ...buildStandardWeekly(timecards) };
}

// ---- hours_spent: each employee × each day, hours in every cell ----------
function buildHoursSpentMatrix(timecards: ReportTimecard[]): Pick<
  ReportResult,
  "columns" | "rows" | "totals"
> {
  const columns: ReportColumn[] = [
    { key: "employee", label: "Employee" },
    ...DAYS.map((d) => ({ key: d, label: DAY_LABEL[d], numeric: true })),
    { key: "reg", label: "Reg", numeric: true },
    { key: "ot", label: "OT", numeric: true },
    { key: "total", label: "Total", numeric: true },
  ];

  // Aggregate by employee (defensive — normally one timecard per emp/week).
  const byEmp = new Map<string, ReportTimecard[]>();
  for (const t of timecards) {
    const arr = byEmp.get(t.employee_id) ?? [];
    arr.push(t);
    byEmp.set(t.employee_id, arr);
  }

  const rows: ReportRow[] = [];
  const totals: ReportRow = { employee: "TOTAL" };
  for (const d of DAYS) totals[d] = 0;
  totals.reg = 0;
  totals.ot = 0;
  totals.total = 0;

  for (const [, cards] of byEmp) {
    const name = cards[0].employees?.full_name ?? "—";
    const row: ReportRow = { employee: name };
    let reg = 0;
    let ot = 0;
    for (const d of DAYS) {
      let h = 0;
      for (const c of cards) {
        const day = c.days?.[d];
        if (day) h += (Number(day.regular) || 0) + (Number(day.overtime) || 0) + (Number(day.holiday) || 0);
      }
      row[d] = h > 0 ? round2(h) : "";
      (totals[d] as number) += h;
    }
    for (const c of cards) {
      reg += Number(c.reg_hours) || 0;
      ot += Number(c.ot_hours) || 0;
    }
    const total = round2(reg + ot);
    row.reg = round2(reg);
    row.ot = round2(ot);
    row.total = total;
    rows.push(row);
    (totals.reg as number) += reg;
    (totals.ot as number) += ot;
    (totals.total as number) += total;
  }

  rows.sort((a, b) => String(a.employee).localeCompare(String(b.employee)));
  for (const d of DAYS) totals[d] = round2(totals[d] as number);
  totals.reg = round2(totals.reg as number);
  totals.ot = round2(totals.ot as number);
  totals.total = round2(totals.total as number);

  return { columns, rows, totals };
}

// ---- timecard_daily: one row per employee per worked day -----------------
function buildTimecardDaily(timecards: ReportTimecard[]): Pick<
  ReportResult,
  "columns" | "rows" | "totals"
> {
  const columns: ReportColumn[] = [
    { key: "employee", label: "Employee" },
    { key: "date", label: "Date" },
    { key: "day", label: "Day" },
    { key: "regular", label: "Regular", numeric: true },
    { key: "ot", label: "OT", numeric: true },
    { key: "in", label: "In" },
    { key: "out", label: "Out" },
  ];
  const rows: ReportRow[] = [];
  let totReg = 0;
  let totOt = 0;
  for (const t of timecards) {
    const name = t.employees?.full_name ?? "—";
    const ws = new Date(`${t.week_start}T00:00:00`);
    DAYS.forEach((d, i) => {
      const day = t.days?.[d];
      if (!day) return;
      const reg = Number(day.regular) || 0;
      const ot = Number(day.overtime) || 0;
      if (reg === 0 && ot === 0 && !day.in && !day.out) return;
      const date = new Date(ws.getTime() + i * 86_400_000).toISOString().slice(0, 10);
      rows.push({
        employee: name,
        date,
        day: DAY_LABEL[d],
        regular: round2(reg),
        ot: round2(ot),
        in: day.in ?? "",
        out: day.out ?? "",
      });
      totReg += reg;
      totOt += ot;
    });
  }
  rows.sort(
    (a, b) =>
      String(a.employee).localeCompare(String(b.employee)) ||
      String(a.date).localeCompare(String(b.date)),
  );
  const totals: ReportRow = {
    employee: "TOTAL",
    date: "",
    day: "",
    regular: round2(totReg),
    ot: round2(totOt),
    in: "",
    out: "",
  };
  return { columns, rows, totals };
}

// ---- standard_weekly: one row per employee per week ----------------------
function buildStandardWeekly(timecards: ReportTimecard[]): Pick<
  ReportResult,
  "columns" | "rows" | "totals"
> {
  const columns: ReportColumn[] = [
    { key: "employee", label: "Employee" },
    { key: "regular", label: "Regular", numeric: true },
    { key: "ot", label: "OT", numeric: true },
    { key: "holiday", label: "Holiday", numeric: true },
    { key: "total", label: "Total", numeric: true },
    { key: "status", label: "Status" },
  ];
  const rows: ReportRow[] = [];
  let tReg = 0;
  let tOt = 0;
  let tHol = 0;
  let tTotal = 0;
  for (const t of timecards) {
    rows.push({
      employee: t.employees?.full_name ?? "—",
      regular: round2(Number(t.reg_hours)),
      ot: round2(Number(t.ot_hours)),
      holiday: round2(Number(t.holiday_hours)),
      total: round2(Number(t.total_hours)),
      status: t.status,
    });
    tReg += Number(t.reg_hours) || 0;
    tOt += Number(t.ot_hours) || 0;
    tHol += Number(t.holiday_hours) || 0;
    tTotal += Number(t.total_hours) || 0;
  }
  rows.sort((a, b) => String(a.employee).localeCompare(String(b.employee)));
  const totals: ReportRow = {
    employee: "TOTAL",
    regular: round2(tReg),
    ot: round2(tOt),
    holiday: round2(tHol),
    total: round2(tTotal),
    status: "",
  };
  return { columns, rows, totals };
}
