import "server-only";
import { createClient } from "./supabase/server";
import type {
  Client,
  Employee,
  EmployeeAssignment,
  PayrollPeriod,
  Timecard,
} from "./supabase/types";

export type PayrollTimecard = Timecard & {
  employees: Pick<Employee, "id" | "full_name" | "sick_hours_balance">;
  clients: Pick<Client, "id" | "name" | "report_format">;
};

export type PayrollPeriodDetail = {
  period: PayrollPeriod;
  timecards: PayrollTimecard[];
  totals: {
    employees: number;
    reg: number;
    ot: number;
    holiday: number;
    sick: number;
    total: number;
    flagged: number;
    billable: number;
  };
  perClient: {
    client: Pick<Client, "id" | "name" | "report_format">;
    timecardCount: number;
    employees: number;
    reg: number;
    ot: number;
    sick: number;
    billable: number;
  }[];
  perEmployee: {
    employee: Pick<Employee, "id" | "full_name" | "sick_hours_balance">;
    timecardCount: number;
    reg: number;
    ot: number;
    sick: number;
    holiday: number;
    billable: number;
    flags: number;
  }[];
};

export async function listPayrollPeriods(): Promise<PayrollPeriod[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payroll_periods")
    .select("*")
    .order("start_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as PayrollPeriod[];
}

export async function getCurrentPayrollPeriod(): Promise<PayrollPeriod | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payroll_periods")
    .select("*")
    .lte("start_date", new Date().toISOString().slice(0, 10))
    .gte("end_date", new Date().toISOString().slice(0, 10))
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PayrollPeriod | null) ?? null;
}

export async function getPayrollPeriodDetail(periodId: string): Promise<PayrollPeriodDetail | null> {
  const supabase = await createClient();
  const { data: period, error: pErr } = await supabase
    .from("payroll_periods")
    .select("*")
    .eq("id", periodId)
    .maybeSingle();
  if (pErr) throw new Error(pErr.message);
  if (!period) return null;

  const p = period as PayrollPeriod;

  const { data: timecards, error: tcErr } = await supabase
    .from("timecards")
    .select(`
      *,
      employees ( id, full_name, sick_hours_balance ),
      clients ( id, name, report_format )
    `)
    .gte("week_start", p.start_date)
    .lte("week_start", p.end_date)
    .order("week_start", { ascending: false });
  if (tcErr) throw new Error(tcErr.message);

  const tcs = (timecards as unknown as PayrollTimecard[]) ?? [];

  // Aggregate
  let reg = 0, ot = 0, holiday = 0, sick = 0, total = 0, billable = 0, flagged = 0;
  for (const t of tcs) {
    reg += Number(t.reg_hours);
    ot += Number(t.ot_hours);
    holiday += Number(t.holiday_hours);
    sick += Number(t.sick_hours);
    total += Number(t.total_hours);
    billable += Number(t.reg_hours) * Number(t.hourly_rate)
      + Number(t.ot_hours) * Number(t.hourly_rate) * 1.5
      + Number(t.holiday_hours) * Number(t.hourly_rate);
    if (t.flags && Object.keys(t.flags).length > 0) flagged++;
  }

  // Per-client
  const clientMap = new Map<string, PayrollPeriodDetail["perClient"][number] & { _employees: Set<string> }>();
  for (const t of tcs) {
    const id = t.clients.id;
    let row = clientMap.get(id);
    if (!row) {
      row = {
        client: t.clients,
        timecardCount: 0,
        employees: 0,
        reg: 0, ot: 0, sick: 0, billable: 0,
        _employees: new Set<string>(),
      };
      clientMap.set(id, row);
    }
    row.timecardCount++;
    row._employees.add(t.employees.id);
    row.reg += Number(t.reg_hours);
    row.ot += Number(t.ot_hours);
    row.sick += Number(t.sick_hours);
    row.billable += Number(t.reg_hours) * Number(t.hourly_rate)
      + Number(t.ot_hours) * Number(t.hourly_rate) * 1.5
      + Number(t.holiday_hours) * Number(t.hourly_rate);
  }
  const perClient = Array.from(clientMap.values()).map((r) => {
    const { _employees, ...rest } = r;
    return { ...rest, employees: _employees.size };
  });

  // Per-employee
  const empMap = new Map<string, PayrollPeriodDetail["perEmployee"][number]>();
  for (const t of tcs) {
    const id = t.employees.id;
    let row = empMap.get(id);
    if (!row) {
      row = {
        employee: t.employees,
        timecardCount: 0,
        reg: 0, ot: 0, sick: 0, holiday: 0, billable: 0, flags: 0,
      };
      empMap.set(id, row);
    }
    row.timecardCount++;
    row.reg += Number(t.reg_hours);
    row.ot += Number(t.ot_hours);
    row.sick += Number(t.sick_hours);
    row.holiday += Number(t.holiday_hours);
    row.billable += Number(t.reg_hours) * Number(t.hourly_rate)
      + Number(t.ot_hours) * Number(t.hourly_rate) * 1.5
      + Number(t.holiday_hours) * Number(t.hourly_rate);
    if (t.flags && Object.keys(t.flags).length > 0) row.flags++;
  }
  const perEmployee = Array.from(empMap.values()).sort((a, b) =>
    a.employee.full_name.localeCompare(b.employee.full_name),
  );

  return {
    period: p,
    timecards: tcs,
    totals: { employees: empMap.size, reg, ot, holiday, sick, total, flagged, billable },
    perClient,
    perEmployee,
  };
}

export async function periodSummaries(): Promise<
  {
    period: PayrollPeriod;
    timecardCount: number;
    employees: number;
    reg: number;
    ot: number;
    flagged: number;
  }[]
> {
  const supabase = await createClient();
  const { data: periods, error: pErr } = await supabase
    .from("payroll_periods")
    .select("*")
    .order("start_date", { ascending: false })
    .limit(8);
  if (pErr) throw new Error(pErr.message);

  const all = (periods ?? []) as PayrollPeriod[];
  if (all.length === 0) return [];

  // One query for all timecards across these periods
  const earliest = all.reduce((m, p) => (p.start_date < m ? p.start_date : m), all[0].start_date);
  const latest = all.reduce((m, p) => (p.end_date > m ? p.end_date : m), all[0].end_date);

  const { data: tcs, error: tErr } = await supabase
    .from("timecards")
    .select("employee_id, week_start, reg_hours, ot_hours, flags")
    .gte("week_start", earliest)
    .lte("week_start", latest);
  if (tErr) throw new Error(tErr.message);

  type TcLite = { employee_id: string; week_start: string; reg_hours: number; ot_hours: number; flags: Record<string, unknown> };
  const rows = (tcs ?? []) as TcLite[];

  return all.map((p) => {
    const inRange = rows.filter((r) => r.week_start >= p.start_date && r.week_start <= p.end_date);
    return {
      period: p,
      timecardCount: inRange.length,
      employees: new Set(inRange.map((r) => r.employee_id)).size,
      reg: inRange.reduce((s, r) => s + Number(r.reg_hours), 0),
      ot: inRange.reduce((s, r) => s + Number(r.ot_hours), 0),
      flagged: inRange.filter((r) => r.flags && Object.keys(r.flags).length > 0).length,
    };
  });
}

// Convenience used by exports + roster lookups
export type AssignmentLite = Pick<EmployeeAssignment, "employee_id" | "client_id" | "position" | "department" | "hourly_rate">;
