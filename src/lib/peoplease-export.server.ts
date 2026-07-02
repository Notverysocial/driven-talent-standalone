import "server-only";
import { createClient } from "./supabase/server";
import { getPayrollPeriodDetail } from "./payroll.server";
import { computeGrossPay, type PeopleaseExportRow } from "./peoplease-export";

// Assemble the per-employee Peoplease export rows for a payroll period from the
// app's real timecards. Reuses getPayrollPeriodDetail (the same source the
// existing PEOPLEASE / PEO-by-department exports use). The only thing the
// period detail lacks is the employee's PEO/external id (employees.legacy_id),
// which we fetch in one query. Company + pay rate come from the employee's
// timecards for the period (the timecard carries a snapshot hourly_rate).

export type PeopleaseExportBundle = {
  periodStart: string;
  periodEnd: string;
  rows: PeopleaseExportRow[];
};

export async function buildPeopleaseExportRows(
  periodId: string,
): Promise<PeopleaseExportBundle | null> {
  const detail = await getPayrollPeriodDetail(periodId);
  if (!detail) return null;

  const periodStart = detail.period.start_date;
  const periodEnd = detail.period.end_date;
  const empIds = detail.perEmployee.map((e) => e.employee.id);

  // PEO / external id per employee.
  const externalById = new Map<string, string>();
  if (empIds.length > 0) {
    const sb = await createClient();
    const { data } = await sb
      .from("employees")
      .select("id, legacy_id")
      .in("id", empIds);
    for (const e of (data ?? []) as { id: string; legacy_id: string | null }[]) {
      externalById.set(e.id, e.legacy_id ?? "");
    }
  }

  // Primary company + pay rate per employee: the client of the employee's
  // heaviest timecard in the period (rate is the wage snapshot on the timecard).
  const primaryByEmp = new Map<
    string,
    { company: string; rate: number | null; hours: number }
  >();
  for (const t of detail.timecards) {
    const empId = t.employees.id;
    const tcHours =
      (Number(t.reg_hours) || 0) +
      (Number(t.ot_hours) || 0) +
      (Number(t.holiday_hours) || 0);
    const rate =
      t.hourly_rate != null && !Number.isNaN(Number(t.hourly_rate))
        ? Number(t.hourly_rate)
        : null;
    const cur = primaryByEmp.get(empId);
    if (!cur || tcHours > cur.hours) {
      primaryByEmp.set(empId, {
        company: t.clients?.name ?? "",
        rate,
        hours: tcHours,
      });
    }
  }

  const rows: PeopleaseExportRow[] = detail.perEmployee.map((e) => {
    const primary = primaryByEmp.get(e.employee.id);
    const rate = primary?.rate ?? null;
    const reg = Number(e.reg) || 0;
    const ot = Number(e.ot) || 0;
    const holiday = Number(e.holiday) || 0;
    const sick = Number(e.sick) || 0;
    return {
      employeeName: e.employee.full_name,
      externalId: externalById.get(e.employee.id) ?? "",
      company: primary?.company ?? "",
      periodStart,
      periodEnd,
      regHours: reg,
      otHours: ot,
      holidayHours: holiday,
      sickHours: sick,
      payRate: rate,
      totalHours: reg + ot + holiday + sick,
      grossPay: computeGrossPay(reg, ot, holiday, rate),
    };
  });

  return { periodStart, periodEnd, rows };
}
