"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { countInvoices } from "@/lib/invoices.server";
import { nextInvoiceNumber } from "@/lib/invoices";

type LineSeed = {
  department: string | null;
  employee_name: string;
  role: string | null;
  hours: number;
  ot_hours: number;
  rate: number;
  amount: number;
  sort_order: number;
  timecard_id: string | null;
};

async function recomputeTotals(invoiceId: string) {
  const supabase = await createClient();
  const { data: items, error } = await supabase
    .from("invoice_line_items")
    .select("amount")
    .eq("invoice_id", invoiceId);
  if (error) throw new Error(error.message);
  const subtotal = (items ?? []).reduce((s, l) => s + Number(l.amount), 0);

  const { data: inv } = await supabase
    .from("invoices")
    .select("fee_pct, tax")
    .eq("id", invoiceId)
    .single();
  const fee_pct = Number(inv?.fee_pct ?? 8);
  const tax = Number(inv?.tax ?? 0);
  const fee = Math.round((subtotal * (fee_pct / 100)) * 100) / 100;
  const total = Math.round((subtotal + fee + tax) * 100) / 100;

  const { error: upErr } = await supabase
    .from("invoices")
    .update({ subtotal, fee, total })
    .eq("id", invoiceId);
  if (upErr) throw new Error(upErr.message);
}

export async function generateInvoiceFromTimecards(formData: FormData) {
  const supabase = await createClient();
  const clientId    = formData.get("client_id") as string;
  const periodStart = formData.get("period_start") as string;
  const periodEnd   = formData.get("period_end") as string;
  if (!clientId || !periodStart || !periodEnd) {
    throw new Error("Client and period dates are required.");
  }

  // Pull approved timecards for this client whose week_start falls in the period.
  const { data: timecards, error: tcErr } = await supabase
    .from("timecards")
    .select(`
      id, employee_id, week_start, reg_hours, ot_hours, holiday_hours, hourly_rate,
      employees ( full_name ),
      employee_assignments!inner ( position, department )
    `)
    .eq("client_id", clientId)
    .eq("status", "approved")
    .gte("week_start", periodStart)
    .lte("week_start", periodEnd)
    .eq("employee_assignments.client_id", clientId);
  if (tcErr) throw new Error(tcErr.message);

  type TcRow = {
    id: string;
    employee_id: string;
    week_start: string;
    reg_hours: number;
    ot_hours: number;
    holiday_hours: number;
    hourly_rate: number;
    employees: { full_name: string };
    employee_assignments: { position: string; department: string }[];
  };

  // Build line items, one per timecard
  const lines: LineSeed[] = ((timecards as unknown as TcRow[]) ?? []).map((t, i) => {
    const reg = Number(t.reg_hours) + Number(t.holiday_hours);
    const ot = Number(t.ot_hours);
    const rate = Number(t.hourly_rate);
    const amount = Math.round((reg * rate + ot * rate * 1.5) * 100) / 100;
    const assignment = t.employee_assignments?.[0];
    return {
      department: assignment?.department ?? null,
      employee_name: t.employees.full_name,
      role: assignment?.position ?? null,
      hours: reg,
      ot_hours: ot,
      rate,
      amount,
      sort_order: i,
      timecard_id: t.id,
    };
  });

  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const fee_pct = 8.0;
  const fee = Math.round(subtotal * (fee_pct / 100) * 100) / 100;
  const total = Math.round((subtotal + fee) * 100) / 100;

  const number = nextInvoiceNumber(await countInvoices());
  const dueAt = new Date(periodEnd + "T00:00:00");
  dueAt.setDate(dueAt.getDate() + 30);

  const { data: inv, error: invErr } = await supabase
    .from("invoices")
    .insert({
      number,
      client_id: clientId,
      period_start: periodStart,
      period_end: periodEnd,
      issued_at: new Date().toISOString().slice(0, 10),
      due_at: dueAt.toISOString().slice(0, 10),
      terms: "Net 30",
      subtotal,
      fee_pct,
      fee,
      tax: 0,
      total,
      status: "draft",
    })
    .select("id")
    .single();
  if (invErr) throw new Error(invErr.message);

  if (lines.length > 0) {
    const { error: liErr } = await supabase
      .from("invoice_line_items")
      .insert(lines.map((l) => ({ ...l, invoice_id: inv.id })));
    if (liErr) throw new Error(liErr.message);
  }

  revalidatePath("/invoices");
  revalidatePath("/dashboard");
  redirect(`/invoices/${inv.id}`);
}

export async function addLineItem(invoiceId: string, formData: FormData) {
  const supabase = await createClient();
  const hours = Number(formData.get("hours")) || 0;
  const ot = Number(formData.get("ot_hours")) || 0;
  const rate = Number(formData.get("rate")) || 0;
  const amount = Math.round((hours * rate + ot * rate * 1.5) * 100) / 100;
  const { error } = await supabase.from("invoice_line_items").insert({
    invoice_id: invoiceId,
    department:    (formData.get("department") as string) || null,
    employee_name: (formData.get("employee_name") as string) || "Ad-hoc",
    role:          (formData.get("role") as string) || null,
    hours, ot_hours: ot, rate, amount,
    sort_order: 999,
  });
  if (error) throw new Error(error.message);
  await recomputeTotals(invoiceId);
  revalidatePath(`/invoices/${invoiceId}`);
}

export async function removeLineItem(invoiceId: string, lineItemId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("invoice_line_items")
    .delete()
    .eq("id", lineItemId);
  if (error) throw new Error(error.message);
  await recomputeTotals(invoiceId);
  revalidatePath(`/invoices/${invoiceId}`);
}

export async function sendInvoice(invoiceId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("invoices")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", invoiceId);
  if (error) throw new Error(error.message);
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
}

export async function markPaid(invoiceId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("invoices")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", invoiceId);
  if (error) throw new Error(error.message);
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
}

export async function markVoid(invoiceId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("invoices")
    .update({ status: "void" })
    .eq("id", invoiceId);
  if (error) throw new Error(error.message);
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
}
