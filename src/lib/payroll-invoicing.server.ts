// Payroll → Invoice automation
//
// Encodes the Driven Talent invoicing SOP:
//   - One invoice per (client × department) per payroll period.
//     A single client (e.g. FabFitFun Fulfillment Center) generates
//     5+ invoices in a week — one per dept (IC, WH, M, FM, RC, PD).
//   - Two line items per employee: a Reg row and an OT row.
//     OT bill rate = bill_rate × 1.5 (matches column V of the master sheet).
//   - Bill rate is independent of pay rate. If the assignment has no
//     bill_rate set, fall back to hourly_rate × (1 + service_fee_pct/100).
//   - Terms default to "Net 10 Days" (the standard embedded in every
//     template tab of the W1-2026 spreadsheet).
//   - Each run is logged to invoice_runs for audit / re-run visibility.

import "server-only";
import { createClient } from "./supabase/server";
import { nextInvoiceNumber } from "./invoices";
import { countInvoices } from "./invoices.server";
import type { InvoiceRun, PayrollPeriod } from "./supabase/types";

export type InvoicePreviewLine = {
  employeeId: string;
  employeeName: string;
  role: string | null;
  regHours: number;
  otHours: number;
  holidayHours: number;
  sickHours: number;
  payRate: number;
  billRate: number;
  regAmount: number;
  otAmount: number;
  totalAmount: number;
  margin: number;     // bill - cost for the week
  marginPct: number;  // 0..100
  timecardIds: string[];
};

export type InvoicePreviewGroup = {
  clientId: string;
  clientName: string;
  department: string;
  branch: string | null;
  serviceFeePct: number;
  lines: InvoicePreviewLine[];
  subtotal: number;
  totalCost: number;
  totalMargin: number;
  marginPct: number;
};

export type PeriodInvoicePreview = {
  period: PayrollPeriod;
  groups: InvoicePreviewGroup[];
  lastRun: InvoiceRun | null;
  totals: {
    invoices: number;
    employees: number;
    billed: number;
    cost: number;
    margin: number;
  };
};

const DEFAULT_DEPT = "General";

type TcRow = {
  id: string;
  employee_id: string;
  client_id: string;
  reg_hours: number;
  ot_hours: number;
  holiday_hours: number;
  sick_hours: number;
  hourly_rate: number;
  status: string;
  employees: { id: string; full_name: string };
  clients: { id: string; name: string; service_fee_pct: number; terms: string | null };
};

type AssignmentRow = {
  employee_id: string;
  client_id: string;
  position: string;
  department: string;
  bill_rate: number | null;
  branch: string | null;
};

// Build a grouped preview of what would be invoiced for a period. The UI
// shows this BEFORE the operator commits, so they can spot a missing bill
// rate or a misassigned department.
export async function previewInvoicesForPeriod(
  periodId: string,
  { onlyApproved = true }: { onlyApproved?: boolean } = {},
): Promise<PeriodInvoicePreview | null> {
  const supabase = await createClient();

  const { data: period, error: pErr } = await supabase
    .from("payroll_periods")
    .select("*")
    .eq("id", periodId)
    .maybeSingle();
  if (pErr) throw new Error(pErr.message);
  if (!period) return null;
  const p = period as PayrollPeriod;

  let tcQuery = supabase
    .from("timecards")
    .select(`
      id, employee_id, client_id, reg_hours, ot_hours, holiday_hours, sick_hours, hourly_rate, status,
      employees ( id, full_name ),
      clients ( id, name, service_fee_pct, terms )
    `)
    .gte("week_start", p.start_date)
    .lte("week_start", p.end_date);
  if (onlyApproved) tcQuery = tcQuery.eq("status", "approved");
  const { data: tcsRaw, error: tcErr } = await tcQuery;
  if (tcErr) throw new Error(tcErr.message);
  const tcs = (tcsRaw as unknown as TcRow[]) ?? [];

  // Pull all active assignments for the employees in the period in one
  // shot — we need department, bill_rate, and branch per (employee, client).
  const empIds = Array.from(new Set(tcs.map((t) => t.employee_id)));
  let assigns: AssignmentRow[] = [];
  if (empIds.length > 0) {
    const { data: aData, error: aErr } = await supabase
      .from("employee_assignments")
      .select("employee_id, client_id, position, department, bill_rate, branch")
      .in("employee_id", empIds)
      .eq("active", true);
    if (aErr) throw new Error(aErr.message);
    assigns = (aData ?? []) as AssignmentRow[];
  }
  const assignByEmpClient = new Map<string, AssignmentRow>();
  for (const a of assigns) {
    assignByEmpClient.set(`${a.employee_id}::${a.client_id}`, a);
  }

  // Group: (client_id, department, branch?) → lines
  const groupMap = new Map<string, InvoicePreviewGroup>();
  for (const t of tcs) {
    const a = assignByEmpClient.get(`${t.employee_id}::${t.client_id}`);
    const department = (a?.department || DEFAULT_DEPT).trim() || DEFAULT_DEPT;
    const branch = a?.branch ?? null;
    const key = `${t.client_id}::${department}::${branch ?? ""}`;

    let group = groupMap.get(key);
    if (!group) {
      group = {
        clientId: t.client_id,
        clientName: t.clients.name,
        department,
        branch,
        serviceFeePct: Number(t.clients.service_fee_pct ?? 0),
        lines: [],
        subtotal: 0,
        totalCost: 0,
        totalMargin: 0,
        marginPct: 0,
      };
      groupMap.set(key, group);
    }

    const payRate = Number(t.hourly_rate);
    const billRate =
      a?.bill_rate != null && Number(a.bill_rate) > 0
        ? Number(a.bill_rate)
        : payRate * (1 + Number(t.clients.service_fee_pct ?? 0) / 100);
    const regHours = Number(t.reg_hours) + Number(t.holiday_hours);
    const otHours = Number(t.ot_hours);
    const regAmount = round2(regHours * billRate);
    const otAmount = round2(otHours * billRate * 1.5);
    const cost = round2(
      regHours * payRate + otHours * payRate * 1.5,
    );
    const total = round2(regAmount + otAmount);

    // Multiple timecards for the same employee in a period should fold
    // together (the SOP's grain is per-employee per-week).
    let line = group.lines.find((l) => l.employeeId === t.employee_id);
    if (!line) {
      line = {
        employeeId: t.employee_id,
        employeeName: t.employees.full_name,
        role: a?.position ?? null,
        regHours: 0,
        otHours: 0,
        holidayHours: 0,
        sickHours: 0,
        payRate,
        billRate,
        regAmount: 0,
        otAmount: 0,
        totalAmount: 0,
        margin: 0,
        marginPct: 0,
        timecardIds: [],
      };
      group.lines.push(line);
    }
    line.regHours = round2(line.regHours + Number(t.reg_hours));
    line.otHours = round2(line.otHours + otHours);
    line.holidayHours = round2(line.holidayHours + Number(t.holiday_hours));
    line.sickHours = round2(line.sickHours + Number(t.sick_hours));
    line.regAmount = round2(line.regAmount + regAmount);
    line.otAmount = round2(line.otAmount + otAmount);
    line.totalAmount = round2(line.totalAmount + total);
    line.margin = round2(line.margin + (total - cost));
    line.marginPct = line.totalAmount > 0 ? round2((line.margin / line.totalAmount) * 100) : 0;
    line.timecardIds.push(t.id);

    group.subtotal = round2(group.subtotal + total);
    group.totalCost = round2(group.totalCost + cost);
    group.totalMargin = round2(group.totalMargin + (total - cost));
    group.marginPct = group.subtotal > 0
      ? round2((group.totalMargin / group.subtotal) * 100)
      : 0;
  }

  const groups = Array.from(groupMap.values()).sort((a, b) => {
    const c = a.clientName.localeCompare(b.clientName);
    return c !== 0 ? c : a.department.localeCompare(b.department);
  });

  // Latest run on the period (if any)
  const { data: runRow, error: rErr } = await supabase
    .from("invoice_runs")
    .select("*")
    .eq("payroll_period_id", periodId)
    .order("ran_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (rErr) throw new Error(rErr.message);

  const employees = new Set(tcs.map((t) => t.employee_id));
  const totalsBilled = groups.reduce((s, g) => s + g.subtotal, 0);
  const totalsCost = groups.reduce((s, g) => s + g.totalCost, 0);

  return {
    period: p,
    groups,
    lastRun: (runRow ?? null) as InvoiceRun | null,
    totals: {
      invoices: groups.length,
      employees: employees.size,
      billed: round2(totalsBilled),
      cost: round2(totalsCost),
      margin: round2(totalsBilled - totalsCost),
    },
  };
}

// Commit the preview: create invoice rows + per-employee Reg/OT line
// items, then log the run. Marks the period as `closed` to mirror the
// SOP's "invoiced" terminal state.
export async function commitInvoicesForPeriod(
  periodId: string,
  ranBy?: string,
): Promise<{ runId: string; invoicesCreated: number; lineItemsCreated: number; totalBilled: number }> {
  const supabase = await createClient();

  const preview = await previewInvoicesForPeriod(periodId, { onlyApproved: true });
  if (!preview) throw new Error("Payroll period not found.");
  if (preview.groups.length === 0) {
    throw new Error("No approved timecards to invoice. Approve timecards first.");
  }

  let invoiceCount = await countInvoices();
  const issuedAt = preview.period.invoice_date
    ?? new Date().toISOString().slice(0, 10);

  // Default due date: issued + 10 days (Net 10 per SOP).
  const issuedDate = new Date(issuedAt + "T00:00:00");
  const dueDate = new Date(issuedDate);
  dueDate.setDate(dueDate.getDate() + 10);
  const dueAt = dueDate.toISOString().slice(0, 10);

  let invoicesCreated = 0;
  let lineItemsCreated = 0;
  let totalBilled = 0;

  for (const g of preview.groups) {
    invoiceCount++;
    const number = nextInvoiceNumber(invoiceCount - 1);

    const subtotal = round2(g.subtotal);
    const feePct = round2(g.serviceFeePct);
    const fee = round2(subtotal * (feePct / 100));
    const total = round2(subtotal + fee);
    totalBilled += total;

    const { data: inv, error: invErr } = await supabase
      .from("invoices")
      .insert({
        number,
        client_id: g.clientId,
        period_start: preview.period.start_date,
        period_end: preview.period.end_date,
        issued_at: issuedAt,
        due_at: dueAt,
        terms: "Net 10 Days",
        subtotal,
        fee_pct: feePct,
        fee,
        tax: 0,
        total,
        status: "draft",
        payroll_period_id: periodId,
        department: g.department,
        branch: g.branch,
        bill_to_client_name: g.clientName,
      })
      .select("id")
      .single();
    if (invErr) throw new Error(invErr.message);
    invoicesCreated++;

    // Two line items per employee — Reg + OT (the OT row is skipped when
    // hours are zero so we don't litter invoices with $0 rows).
    const lineItems: Array<{
      invoice_id: string;
      department: string | null;
      employee_name: string;
      role: string | null;
      hours: number;
      ot_hours: number;
      rate: number;
      amount: number;
      employee_cost: number | null;
      sort_order: number;
      timecard_id: string | null;
    }> = [];
    let sort = 0;
    for (const line of g.lines) {
      const regHours = round2(line.regHours + line.holidayHours);
      if (regHours > 0) {
        const cost = round2(regHours * line.payRate);
        lineItems.push({
          invoice_id: inv.id,
          department: g.department,
          employee_name: line.employeeName,
          role: line.role,
          hours: regHours,
          ot_hours: 0,
          rate: line.billRate,
          amount: line.regAmount,
          employee_cost: cost,
          sort_order: sort++,
          timecard_id: line.timecardIds[0] ?? null,
        });
      }
      if (line.otHours > 0) {
        const cost = round2(line.otHours * line.payRate * 1.5);
        lineItems.push({
          invoice_id: inv.id,
          department: g.department,
          employee_name: line.employeeName,
          role: line.role,
          hours: 0,
          ot_hours: line.otHours,
          rate: round2(line.billRate * 1.5),
          amount: line.otAmount,
          employee_cost: cost,
          sort_order: sort++,
          timecard_id: line.timecardIds[0] ?? null,
        });
      }
    }
    if (lineItems.length > 0) {
      const { error: liErr } = await supabase
        .from("invoice_line_items")
        .insert(lineItems);
      if (liErr) throw new Error(liErr.message);
      lineItemsCreated += lineItems.length;
    }
  }

  const { data: runRow, error: rErr } = await supabase
    .from("invoice_runs")
    .insert({
      payroll_period_id: periodId,
      ran_by: ranBy ?? null,
      invoices_created: invoicesCreated,
      line_items_created: lineItemsCreated,
      total_billed: round2(totalBilled),
    })
    .select("id")
    .single();
  if (rErr) throw new Error(rErr.message);

  // Stamp invoice_date if this is the first run and the period didn't
  // already specify one. Move the period to terminal "closed" status.
  await supabase
    .from("payroll_periods")
    .update({
      status: "closed",
      invoice_date: preview.period.invoice_date ?? issuedAt,
    })
    .eq("id", periodId);

  return {
    runId: runRow.id,
    invoicesCreated,
    lineItemsCreated,
    totalBilled: round2(totalBilled),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
