"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeFlags } from "@/lib/payroll";
import { countInvoices } from "@/lib/invoices.server";
import { nextInvoiceNumber } from "@/lib/invoices";
import type {
  PayrollPeriodStatus,
  TimecardDays,
  TimecardFlags,
} from "@/lib/supabase/types";

export async function createPayrollPeriod(formData: FormData) {
  const supabase = await createClient();
  const start = formData.get("start_date") as string;
  const end = formData.get("end_date") as string;
  if (!start || !end) throw new Error("start_date and end_date required.");
  const { data, error } = await supabase
    .from("payroll_periods")
    .insert({ start_date: start, end_date: end, status: "open" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/payroll");
  redirect(`/payroll/${data.id}`);
}

export async function setPeriodStatus(
  periodId: string,
  status: PayrollPeriodStatus,
  approvedBy?: string,
) {
  const supabase = await createClient();
  const update: Record<string, unknown> = { status };
  if (status === "approved") {
    update.approved_by = approvedBy ?? "Roxanna";
    update.approved_at = new Date().toISOString();
  }
  const { error } = await supabase.from("payroll_periods").update(update).eq("id", periodId);
  if (error) throw new Error(error.message);
  revalidatePath(`/payroll/${periodId}`);
  revalidatePath("/payroll");
}

// Audit recomputes flags across all timecards in the period and links them
// via payroll_period_id. Idempotent — operators can re-run.
export async function auditPeriod(periodId: string) {
  const supabase = await createClient();
  const { data: period, error: pErr } = await supabase
    .from("payroll_periods")
    .select("*")
    .eq("id", periodId)
    .single();
  if (pErr) throw new Error(pErr.message);

  const { data: timecards, error: tcErr } = await supabase
    .from("timecards")
    .select("id, days")
    .gte("week_start", period.start_date)
    .lte("week_start", period.end_date);
  if (tcErr) throw new Error(tcErr.message);

  for (const t of (timecards ?? []) as { id: string; days: TimecardDays }[]) {
    const flags = computeFlags(t.days);
    await supabase
      .from("timecards")
      .update({ flags, payroll_period_id: periodId })
      .eq("id", t.id);
  }

  await supabase
    .from("payroll_periods")
    .update({ status: "audited" })
    .eq("id", periodId);

  revalidatePath(`/payroll/${periodId}`);
  revalidatePath("/payroll");
}

// Manual flag override on a single timecard (operator notes).
export async function setTimecardFlag(
  timecardId: string,
  periodId: string,
  patch: TimecardFlags,
) {
  const supabase = await createClient();
  const { data: row, error: getErr } = await supabase
    .from("timecards")
    .select("flags")
    .eq("id", timecardId)
    .single();
  if (getErr) throw new Error(getErr.message);
  const next = { ...(row.flags as TimecardFlags), ...patch };
  // If patch sets a key to null/empty, remove it from the flags object.
  for (const k of Object.keys(patch) as (keyof TimecardFlags)[]) {
    if (patch[k] === undefined || patch[k] === null || patch[k] === "" || patch[k] === false) {
      delete next[k];
    }
  }
  const { error } = await supabase.from("timecards").update({ flags: next }).eq("id", timecardId);
  if (error) throw new Error(error.message);
  revalidatePath(`/payroll/${periodId}`);
}

// Generate per-client invoices from approved timecards in the period.
// Mirrors the invoices/new behavior but scoped to a payroll period.
export async function generateInvoicesForPeriod(periodId: string) {
  const supabase = await createClient();
  const { data: period, error: pErr } = await supabase
    .from("payroll_periods")
    .select("*")
    .eq("id", periodId)
    .single();
  if (pErr) throw new Error(pErr.message);

  const { data: timecards, error: tcErr } = await supabase
    .from("timecards")
    .select(`
      id, employee_id, client_id, week_start, reg_hours, ot_hours, holiday_hours, hourly_rate,
      employees ( full_name ),
      clients ( id, name, service_fee_pct )
    `)
    .eq("status", "approved")
    .gte("week_start", period.start_date)
    .lte("week_start", period.end_date);
  if (tcErr) throw new Error(tcErr.message);

  type TcRow = {
    id: string;
    employee_id: string;
    client_id: string;
    week_start: string;
    reg_hours: number;
    ot_hours: number;
    holiday_hours: number;
    hourly_rate: number;
    employees: { full_name: string };
    clients: { id: string; name: string; service_fee_pct: number };
  };
  const rows = (timecards as unknown as TcRow[]) ?? [];

  // Group by client
  const byClient = new Map<string, TcRow[]>();
  for (const r of rows) {
    const arr = byClient.get(r.client_id) ?? [];
    arr.push(r);
    byClient.set(r.client_id, arr);
  }

  let invoiceCount = await countInvoices();
  const createdIds: string[] = [];

  for (const [clientId, group] of byClient) {
    const employeeIds = Array.from(new Set(group.map((g) => g.employee_id)));
    const { data: assigns } = await supabase
      .from("employee_assignments")
      .select("employee_id, position, department")
      .eq("client_id", clientId)
      .eq("active", true)
      .in("employee_id", employeeIds);
    const assignByEmp = new Map<string, { position: string; department: string }>();
    for (const a of (assigns ?? []) as { employee_id: string; position: string; department: string }[]) {
      assignByEmp.set(a.employee_id, { position: a.position, department: a.department });
    }

    const lines = group.map((t, i) => {
      const reg = Number(t.reg_hours) + Number(t.holiday_hours);
      const ot = Number(t.ot_hours);
      const rate = Number(t.hourly_rate);
      const billable = reg * rate + ot * rate * 1.5;
      const a = assignByEmp.get(t.employee_id);
      return {
        department: a?.department ?? null,
        employee_name: t.employees.full_name,
        role: a?.position ?? null,
        hours: reg,
        ot_hours: ot,
        rate,
        amount: Math.round(billable * 100) / 100,
        employee_cost: Math.round(billable * 100) / 100,  // pre-fee cost = billable for now
        sort_order: i,
        timecard_id: t.id,
      };
    });

    const subtotal = lines.reduce((s, l) => s + l.amount, 0);
    const fee_pct = Number(group[0].clients.service_fee_pct);
    const fee = Math.round(subtotal * (fee_pct / 100) * 100) / 100;
    const total = Math.round((subtotal + fee) * 100) / 100;

    invoiceCount++;
    const number = nextInvoiceNumber(invoiceCount - 1);
    const dueAt = new Date(period.end_date + "T00:00:00");
    dueAt.setDate(dueAt.getDate() + 30);

    const { data: inv, error: invErr } = await supabase
      .from("invoices")
      .insert({
        number,
        client_id: clientId,
        period_start: period.start_date,
        period_end: period.end_date,
        issued_at: new Date().toISOString().slice(0, 10),
        due_at: dueAt.toISOString().slice(0, 10),
        terms: "Net 30",
        subtotal,
        fee_pct,
        fee,
        tax: 0,
        total,
        status: "draft",
        payroll_period_id: periodId,
      })
      .select("id")
      .single();
    if (invErr) throw new Error(invErr.message);
    createdIds.push(inv.id);

    if (lines.length > 0) {
      const { error: liErr } = await supabase
        .from("invoice_line_items")
        .insert(lines.map((l) => ({ ...l, invoice_id: inv.id })));
      if (liErr) throw new Error(liErr.message);
    }
  }

  await supabase.from("payroll_periods").update({ status: "closed" }).eq("id", periodId);

  revalidatePath(`/payroll/${periodId}`);
  revalidatePath("/payroll");
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
}

export async function adjustSickBalance(employeeId: string, deltaHours: number) {
  const supabase = await createClient();
  const { data: emp, error: getErr } = await supabase
    .from("employees")
    .select("sick_hours_balance")
    .eq("id", employeeId)
    .single();
  if (getErr) throw new Error(getErr.message);
  const next = Math.max(0, Number(emp.sick_hours_balance) + deltaHours);
  const { error } = await supabase
    .from("employees")
    .update({ sick_hours_balance: next })
    .eq("id", employeeId);
  if (error) throw new Error(error.message);
  revalidatePath("/payroll");
  revalidatePath(`/employees/${employeeId}`);
}
