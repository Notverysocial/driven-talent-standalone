"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeFlags } from "@/lib/payroll";
import {
  commitInvoicesForPeriod,
  regenerateDraftInvoicesForPeriod,
} from "@/lib/payroll-invoicing.server";
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

// Generate invoices from approved timecards in the period, grouped by
// (client × department) per the Driven Talent Payroll SOP. Each employee
// produces a Reg row + an OT row at independent rates (OT = 1.5×). Uses
// the per-assignment bill_rate when set; otherwise falls back to pay rate
// × (1 + client.service_fee_pct/100). Logs every run to invoice_runs.
//
// See src/lib/payroll-invoicing.server.ts for the full pipeline.
export async function generateInvoicesForPeriod(
  periodId: string,
  ranBy?: string,
) {
  const result = await commitInvoicesForPeriod(periodId, ranBy);
  revalidatePath(`/payroll/${periodId}`);
  revalidatePath("/payroll");
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  return result;
}

// Idempotent draft refresh: re-derive draft invoices from the CURRENT hours
// without closing the period. Enter a correction on a time card, click this,
// and the invoice updates in place — no duplicate numbers, no manual delete-add.
// Locked (sent/paid) invoices are never touched.
export async function regenerateInvoicesForPeriod(
  periodId: string,
  ranBy?: string,
) {
  const result = await regenerateDraftInvoicesForPeriod(periodId, ranBy);
  revalidatePath(`/payroll/${periodId}`);
  revalidatePath("/payroll");
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  return result;
}

// Set the invoice date for a period — separately editable so operators can
// align with each client's billing calendar (SOP shows ~4 days after
// period-end, but it varies).
export async function setPeriodInvoiceDate(periodId: string, invoiceDate: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("payroll_periods")
    .update({ invoice_date: invoiceDate || null })
    .eq("id", periodId);
  if (error) throw new Error(error.message);
  revalidatePath(`/payroll/${periodId}`);
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
