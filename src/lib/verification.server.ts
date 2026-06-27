import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  PayrollPeriod,
  PeriodVerification,
  VerificationDetail,
} from "@/lib/supabase/types";

// Audit / verification engine. Confirms hours match across the three views the
// time card feeds: TIME CARD (source) ↔ INVOICE (what the client is billed) ↔
// PAYROLL (what we pay / submit to PEO). Surfaces a per-employee variance and
// the "deduction = zero" check (the billed-vs-worked hours net to zero). Rocio
// keeps this as an explicit verification step even once automated.

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export type PeriodVerificationResult = {
  period: PayrollPeriod;
  rows: VerificationDetail[];
  employeeCount: number;
  varianceCount: number;
  // Σ(invoice − timecard) across employees nets to zero when billing is clean.
  netDeltaHours: number;
  deductionZeroOk: boolean;
  totals: { timecard: number; invoice: number; payroll: number };
};

export async function buildPeriodVerification(
  periodId: string,
): Promise<PeriodVerificationResult | null> {
  const sb = await createClient();

  const { data: periodRow } = await sb
    .from("payroll_periods")
    .select("*")
    .eq("id", periodId)
    .maybeSingle();
  if (!periodRow) return null;
  const period = periodRow as PayrollPeriod;

  // TIME CARD side — payable/billable hours per employee (reg + ot + holiday).
  const { data: tcData } = await sb
    .from("timecards")
    .select("employee_id, reg_hours, ot_hours, holiday_hours, employees ( full_name )")
    .gte("week_start", period.start_date)
    .lte("week_start", period.end_date);
  type TcRow = {
    employee_id: string;
    reg_hours: number;
    ot_hours: number;
    holiday_hours: number;
    employees: { full_name: string } | null;
  };
  const timecards = (tcData ?? []) as unknown as TcRow[];

  const tcByEmp = new Map<string, { name: string; hours: number }>();
  for (const t of timecards) {
    const cur = tcByEmp.get(t.employee_id) ?? { name: t.employees?.full_name ?? "—", hours: 0 };
    cur.hours += (Number(t.reg_hours) || 0) + (Number(t.ot_hours) || 0) + (Number(t.holiday_hours) || 0);
    tcByEmp.set(t.employee_id, cur);
  }

  // INVOICE side — billed hours per employee. Invoices for this period; line
  // items carry hours + ot_hours and a timecard_id we can resolve to employee.
  const { data: invData } = await sb
    .from("invoices")
    .select("id")
    .eq("payroll_period_id", periodId)
    .neq("status", "void");
  const invoiceIds = (invData ?? []).map((r) => (r as { id: string }).id);

  const invByEmp = new Map<string, number>();
  const invByName = new Map<string, number>();
  if (invoiceIds.length > 0) {
    const { data: liData } = await sb
      .from("invoice_line_items")
      .select("employee_name, hours, ot_hours, timecard_id")
      .in("invoice_id", invoiceIds);
    type LiRow = { employee_name: string; hours: number; ot_hours: number; timecard_id: string | null };
    const lis = (liData ?? []) as LiRow[];

    // Resolve line-item timecard_id → employee_id where present.
    const tcIds = Array.from(new Set(lis.map((l) => l.timecard_id).filter((x): x is string => !!x)));
    const tcEmp = new Map<string, string>();
    if (tcIds.length > 0) {
      const { data: tcMap } = await sb.from("timecards").select("id, employee_id").in("id", tcIds);
      for (const r of (tcMap ?? []) as { id: string; employee_id: string }[]) tcEmp.set(r.id, r.employee_id);
    }
    for (const l of lis) {
      const hrs = (Number(l.hours) || 0) + (Number(l.ot_hours) || 0);
      const empId = l.timecard_id ? tcEmp.get(l.timecard_id) : undefined;
      if (empId) invByEmp.set(empId, (invByEmp.get(empId) ?? 0) + hrs);
      else invByName.set(l.employee_name, (invByName.get(l.employee_name) ?? 0) + hrs);
    }
  }

  // Build per-employee rows over the union of timecard + invoice employees.
  const rows: VerificationDetail[] = [];
  let varianceCount = 0;
  let netDelta = 0;
  let totTc = 0;
  let totInv = 0;
  let totPay = 0;

  for (const [empId, tc] of tcByEmp) {
    const timecardHours = round2(tc.hours);
    // Prefer id-matched invoice hours; fall back to name match for legacy lines.
    const invoiceHours = round2((invByEmp.get(empId) ?? 0) + (invByName.get(tc.name) ?? 0));
    if (invByName.has(tc.name)) invByName.delete(tc.name);
    const payrollHours = timecardHours; // payroll is derived from the time card
    const delta = round2(invoiceHours - timecardHours);

    let status: VerificationDetail["status"] = "match";
    let note: string | null = null;
    if (invoiceHours === 0 && timecardHours > 0) {
      status = "missing";
      note = "On time card but not yet invoiced";
    } else if (Math.abs(delta) > 0.01) {
      status = "variance";
      note = `Invoice ${delta > 0 ? "over" : "under"} time card by ${Math.abs(delta)}h — refresh invoices`;
    }
    if (status !== "match") varianceCount++;
    netDelta += delta;
    totTc += timecardHours;
    totInv += invoiceHours;
    totPay += payrollHours;

    rows.push({
      employee_id: empId,
      name: tc.name,
      timecard_hours: timecardHours,
      invoice_hours: invoiceHours,
      payroll_hours: payrollHours,
      status,
      delta_hours: delta,
      note,
    });
  }

  // Any invoice-only employees (billed but no time card in the period).
  for (const [name, hours] of invByName) {
    const invoiceHours = round2(hours);
    if (invoiceHours === 0) continue;
    varianceCount++;
    netDelta += invoiceHours;
    totInv += invoiceHours;
    rows.push({
      employee_id: "",
      name,
      timecard_hours: 0,
      invoice_hours: invoiceHours,
      payroll_hours: 0,
      status: "missing",
      delta_hours: invoiceHours,
      note: "Invoiced with no matching time card — verify",
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));
  const netDeltaHours = round2(netDelta);

  return {
    period,
    rows,
    employeeCount: rows.length,
    varianceCount,
    netDeltaHours,
    deductionZeroOk: Math.abs(netDeltaHours) < 0.01,
    totals: { timecard: round2(totTc), invoice: round2(totInv), payroll: round2(totPay) },
  };
}

// Persist a sign-off snapshot (retains the explicit verification step).
export async function recordPeriodVerification(
  periodId: string,
  verifiedBy: string,
): Promise<PeriodVerification> {
  const result = await buildPeriodVerification(periodId);
  if (!result) throw new Error("Payroll period not found.");
  const sb = await createClient();
  const { data, error } = await sb
    .from("period_verifications")
    .insert({
      payroll_period_id: periodId,
      verified_by: verifiedBy || null,
      result: result.varianceCount === 0 && result.deductionZeroOk ? "clean" : "variances",
      employee_count: result.employeeCount,
      variance_count: result.varianceCount,
      deduction_zero_ok: result.deductionZeroOk,
      details: result.rows,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as PeriodVerification;
}

export async function listPeriodVerifications(
  periodId: string,
  limit = 5,
): Promise<PeriodVerification[]> {
  const sb = await createClient();
  const { data } = await sb
    .from("period_verifications")
    .select("*")
    .eq("payroll_period_id", periodId)
    .order("verified_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as PeriodVerification[];
}

export async function listVerifiablePeriods(): Promise<
  { id: string; start_date: string; end_date: string; status: string }[]
> {
  const sb = await createClient();
  const { data } = await sb
    .from("payroll_periods")
    .select("id, start_date, end_date, status")
    .order("start_date", { ascending: false })
    .limit(24);
  return (data ?? []) as { id: string; start_date: string; end_date: string; status: string }[];
}
