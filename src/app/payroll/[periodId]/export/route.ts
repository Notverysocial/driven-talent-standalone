import { NextResponse } from "next/server";
import { getPayrollPeriodDetail } from "@/lib/payroll.server";
import { fmtPeriodRange } from "@/lib/payroll";

function csv(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return "";
  const str = String(s);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ periodId: string }> },
) {
  const { periodId } = await ctx.params;
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "peoplease";
  const clientFilter = url.searchParams.get("client");

  const detail = await getPayrollPeriodDetail(periodId);
  if (!detail) return new NextResponse("Not found", { status: 404 });

  const periodLabel = fmtPeriodRange(detail.period.start_date, detail.period.end_date);
  const filenameBase = `payroll-${detail.period.start_date}`;

  // PEOPLEASE format: per-employee row with reg/OT/sick. This mirrors the SOP
  // step "PEOPLEASE data entry (regular hours, OT, sick time)".
  if (format === "peoplease") {
    const lines: string[] = [
      [
        "Employee",
        "Period",
        "Regular Hours",
        "OT Hours",
        "Sick Hours",
        "Holiday Hours",
        "Sick Balance (after period)",
      ].map(csv).join(","),
    ];
    for (const e of detail.perEmployee) {
      lines.push([
        csv(e.employee.full_name),
        csv(periodLabel),
        csv(e.reg.toFixed(2)),
        csv(e.ot.toFixed(2)),
        csv(e.sick.toFixed(2)),
        csv(e.holiday.toFixed(2)),
        csv(Number(e.employee.sick_hours_balance).toFixed(2)),
      ].join(","));
    }
    return csvResponse(lines, `${filenameBase}-peoplease.csv`);
  }

  // Per-client: pick format based on client.report_format.
  if (format === "client" && clientFilter) {
    const tcs = detail.timecards.filter((t) => t.clients.id === clientFilter);
    if (tcs.length === 0) {
      return csvResponse(["No timecards"], `${filenameBase}-${clientFilter}.csv`);
    }
    const reportFormat = tcs[0].clients.report_format;

    if (reportFormat === "hours_spent") {
      // FabFitFun-style: Hours Spent Report — per-employee aggregated.
      const byEmp = new Map<string, { name: string; reg: number; ot: number; total: number }>();
      for (const t of tcs) {
        const e = byEmp.get(t.employees.id) ?? {
          name: t.employees.full_name,
          reg: 0, ot: 0, total: 0,
        };
        e.reg += Number(t.reg_hours);
        e.ot += Number(t.ot_hours);
        e.total += Number(t.total_hours);
        byEmp.set(t.employees.id, e);
      }
      const lines = [
        ["Employee", "Period", "Regular Hours", "OT Hours", "Total Hours"].map(csv).join(","),
      ];
      for (const e of byEmp.values()) {
        lines.push([csv(e.name), csv(periodLabel), csv(e.reg.toFixed(2)), csv(e.ot.toFixed(2)), csv(e.total.toFixed(2))].join(","));
      }
      return csvResponse(lines, `${filenameBase}-${tcs[0].clients.name}-hours-spent.csv`);
    }

    if (reportFormat === "timecard") {
      // ISC-style: Timecard Report — per-day rows.
      const lines = [
        ["Employee", "Date", "Day", "Regular", "OT", "In", "Out"].map(csv).join(","),
      ];
      const days: ("mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun")[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
      for (const t of tcs) {
        const weekStart = new Date(t.week_start + "T00:00:00");
        for (let i = 0; i < 7; i++) {
          const k = days[i];
          const d = t.days?.[k];
          if (!d) continue;
          const reg = Number(d.regular) || 0;
          const ot = Number(d.overtime) || 0;
          if (reg === 0 && ot === 0 && !d.in && !d.out) continue;
          const date = new Date(weekStart.getTime() + i * 86_400_000).toISOString().slice(0, 10);
          lines.push([
            csv(t.employees.full_name),
            csv(date),
            csv(k.toUpperCase()),
            csv(reg.toFixed(2)),
            csv(ot.toFixed(2)),
            csv(d.in ?? ""),
            csv(d.out ?? ""),
          ].join(","));
        }
      }
      return csvResponse(lines, `${filenameBase}-${tcs[0].clients.name}-timecard.csv`);
    }

    // Standard fallback
    const lines = [
      ["Employee", "Week", "Regular", "OT", "Sick", "Total", "Status"].map(csv).join(","),
    ];
    for (const t of tcs) {
      lines.push([
        csv(t.employees.full_name),
        csv(t.week_start),
        csv(Number(t.reg_hours).toFixed(2)),
        csv(Number(t.ot_hours).toFixed(2)),
        csv(Number(t.sick_hours).toFixed(2)),
        csv(Number(t.total_hours).toFixed(2)),
        csv(t.status),
      ].join(","));
    }
    return csvResponse(lines, `${filenameBase}-${tcs[0].clients.name}.csv`);
  }

  return new NextResponse("Unknown export format", { status: 400 });
}

function csvResponse(lines: string[], filename: string) {
  return new NextResponse(lines.join("\n") + "\n", {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
