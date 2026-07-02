import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPayrollPeriodDetail } from "@/lib/payroll.server";
import { fmtPeriodRange } from "@/lib/payroll";
import { buildPeopleaseExportRows } from "@/lib/peoplease-export.server";
import {
  buildPeopleaseCsv,
  isPeopleaseExportProfile,
  PEOPLEASE_EXPORT_PROFILES,
} from "@/lib/peoplease-export";

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

  // Configurable Peoplease payroll export (+ plain standard-hours export). The
  // column set / labels / order live in src/lib/peoplease-export.ts so matching
  // Peoplease's confirmed PrismHR import spec is a one-file edit. Handled before
  // the generic detail fetch below (the builder loads what it needs).
  if (isPeopleaseExportProfile(format)) {
    const bundle = await buildPeopleaseExportRows(periodId);
    if (!bundle) return new NextResponse("Not found", { status: 404 });
    const profile = PEOPLEASE_EXPORT_PROFILES[format];
    const body = buildPeopleaseCsv(bundle.rows, profile.columns);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="payroll-${bundle.periodStart}-${profile.filenameSuffix}.csv"`,
      },
    });
  }

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

  // PEO hours-by-department: one row per (department × employee), formatted for
  // upload to PEOPLEASE / PrismHR. Department is resolved from the employee's
  // active assignment; rows are sorted by department then employee so the file
  // mirrors how PrismHR groups payroll import.
  if (format === "peo_department") {
    const sb = await createClient();
    const empIds = Array.from(new Set(detail.timecards.map((t) => t.employees.id)));

    const deptByEmpClient = new Map<string, { department: string; branch: string | null }>();
    const legacyByEmp = new Map<string, string | null>();
    if (empIds.length > 0) {
      const [{ data: aData }, { data: eData }] = await Promise.all([
        sb
          .from("employee_assignments")
          .select("employee_id, client_id, department, branch")
          .in("employee_id", empIds)
          .eq("active", true),
        sb.from("employees").select("id, legacy_id").in("id", empIds),
      ]);
      for (const a of (aData ?? []) as { employee_id: string; client_id: string; department: string; branch: string | null }[]) {
        deptByEmpClient.set(`${a.employee_id}::${a.client_id}`, {
          department: (a.department || "General").trim() || "General",
          branch: a.branch,
        });
      }
      for (const e of (eData ?? []) as { id: string; legacy_id: string | null }[]) {
        legacyByEmp.set(e.id, e.legacy_id);
      }
    }

    type Agg = {
      department: string;
      branch: string | null;
      name: string;
      legacy: string | null;
      reg: number;
      ot: number;
      holiday: number;
      sick: number;
    };
    const agg = new Map<string, Agg>();
    for (const t of detail.timecards) {
      const meta = deptByEmpClient.get(`${t.employees.id}::${t.clients.id}`);
      const department = meta?.department ?? "General";
      const key = `${department}::${t.employees.id}`;
      const row =
        agg.get(key) ??
        {
          department,
          branch: meta?.branch ?? null,
          name: t.employees.full_name,
          legacy: legacyByEmp.get(t.employees.id) ?? null,
          reg: 0,
          ot: 0,
          holiday: 0,
          sick: 0,
        };
      row.reg += Number(t.reg_hours) || 0;
      row.ot += Number(t.ot_hours) || 0;
      row.holiday += Number(t.holiday_hours) || 0;
      row.sick += Number(t.sick_hours) || 0;
      agg.set(key, row);
    }

    const sorted = Array.from(agg.values()).sort(
      (a, b) => a.department.localeCompare(b.department) || a.name.localeCompare(b.name),
    );
    const lines = [
      ["Department", "Location", "Employee", "Employee ID", "Regular Hours", "OT Hours", "Holiday Hours", "Sick Hours", "Total Hours"]
        .map(csv)
        .join(","),
    ];
    for (const r of sorted) {
      const total = r.reg + r.ot + r.holiday + r.sick;
      lines.push(
        [
          csv(r.department),
          csv(r.branch ?? ""),
          csv(r.name),
          csv(r.legacy ?? ""),
          csv(r.reg.toFixed(2)),
          csv(r.ot.toFixed(2)),
          csv(r.holiday.toFixed(2)),
          csv(r.sick.toFixed(2)),
          csv(total.toFixed(2)),
        ].join(","),
      );
    }
    return csvResponse(lines, `${filenameBase}-peo-by-department.csv`);
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
