// Payroll → Invoice automation
//
// Encodes the Driven Talent invoicing SOP:
//   - One invoice per (client × department) per payroll period.
//     A single client (e.g. FabFitFun Fulfillment Center) generates
//     5+ invoices in a week — one per dept (IC, WH, M, FM, RC, PD).
//   - Two line items per employee: a Reg row and an OT row.
//     OT bill rate = bill_rate × 1.5 (matches column V of the master sheet).
//   - Bill rate is independent of pay rate and resolved by src/lib/markup.ts:
//     assignment.bill_rate → assignment.markup_percent (the per-employee rate)
//     → client.service_fee_pct → nothing (billed at cost, flagged loudly).
//     Every line carries the source it resolved from so the preview can show
//     where each rate came from.
//   - Terms default to "Net 10 Days" (the standard embedded in every
//     template tab of the W1-2026 spreadsheet).
//   - Each run is logged to invoice_runs for audit / re-run visibility.

import "server-only";
import { createClient } from "./supabase/server";
import { nextInvoiceNumber } from "./invoices";
import { countInvoices } from "./invoices.server";
import { resolveMarkup, summariseSources, type MarkupSource, type ResolvedMarkup } from "./markup";
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
  /** Effective markup over pay; null when pay rate is 0. */
  markupPct: number | null;
  /** Which level of the chain supplied the rate — shown on the preview. */
  markupSource: MarkupSource;
  /** Short badge label, e.g. "Employee 45%" / "Client 8%" / "No markup". */
  markupLabel: string;
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
  /** Count of lines by where their rate came from — drives the preview badges. */
  markupSources: { employee: number; fixedRate: number; clientDefault: number; missing: number };
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
    /**
     * Employees on this run with no markup configured at any level. Non-zero
     * means someone is about to be billed at cost — the preview says so before
     * the operator commits.
     */
    missingMarkup: number;
    /** Employees billed off the client-wide default rather than their own rate. */
    clientDefaultMarkup: number;
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
  markup_percent: number | null;
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
      .select("employee_id, client_id, position, department, bill_rate, markup_percent, branch")
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
        markupSources: { employee: 0, fixedRate: 0, clientDefault: 0, missing: 0 },
        lines: [],
        subtotal: 0,
        totalCost: 0,
        totalMargin: 0,
        marginPct: 0,
      };
      groupMap.set(key, group);
    }

    const payRate = Number(t.hourly_rate);
    // Per-employee markup (Rocio, 2026-06-17). With no markup_percent set this
    // returns the identical rate the previous inline expression did — see the
    // parity block in e2e/logic/markup-resolution.spec.ts.
    const markup = resolveMarkup({
      payRate,
      assignmentBillRate: a?.bill_rate,
      employeeMarkupPct: a?.markup_percent,
      clientMarkupPct: t.clients.service_fee_pct,
    });
    const billRate = markup.billRate;
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
        markupPct: markup.markupPct,
        markupSource: markup.source,
        markupLabel: markup.label,
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

  // Roll the per-line provenance up to the group once all lines are folded in,
  // so each employee counts once regardless of how many timecards they had.
  for (const g of groupMap.values()) {
    g.markupSources = summariseSources(g.lines.map((l) => ({ source: l.markupSource })));
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
      missingMarkup: groups.reduce((s, g) => s + g.markupSources.missing, 0),
      clientDefaultMarkup: groups.reduce((s, g) => s + g.markupSources.clientDefault, 0),
    },
  };
}

export type InvoiceUpsertResult = {
  runId: string;
  invoicesCreated: number;
  invoicesUpdated: number;
  invoicesRemoved: number;
  invoicesSuperseded: number;
  lineItemsCreated: number;
  totalBilled: number;
};

const groupKey = (clientId: string, department: string, branch: string | null) =>
  `${clientId}::${department}::${branch ?? ""}`;

// Build the per-employee Reg + OT line items for a group. OT row skipped when
// zero so we don't litter invoices with $0 rows.
function buildGroupLineItems(invoiceId: string, g: InvoicePreviewGroup) {
  const items: Array<{
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
      items.push({
        invoice_id: invoiceId,
        department: g.department,
        employee_name: line.employeeName,
        role: line.role,
        hours: regHours,
        ot_hours: 0,
        rate: line.billRate,
        amount: line.regAmount,
        employee_cost: round2(regHours * line.payRate),
        sort_order: sort++,
        timecard_id: line.timecardIds[0] ?? null,
      });
    }
    if (line.otHours > 0) {
      items.push({
        invoice_id: invoiceId,
        department: g.department,
        employee_name: line.employeeName,
        role: line.role,
        hours: 0,
        ot_hours: line.otHours,
        rate: round2(line.billRate * 1.5),
        amount: line.otAmount,
        employee_cost: round2(line.otHours * line.payRate * 1.5),
        sort_order: sort++,
        timecard_id: line.timecardIds[0] ?? null,
      });
    }
  }
  return items;
}

// Idempotent invoice sync for a period — the heart of "enter hours once, the
// invoice updates." For each (client × department × branch) group:
//   * an existing DRAFT invoice is REUSED in place (same number/id): its line
//     items are replaced from the current hours and its totals updated;
//   * duplicate drafts for the same group are collapsed into one;
//   * a draft whose group no longer has any hours (employee removed) is
//     deleted — the "remove" side;
//   * groups with no draft but a locked (sent/paid) invoice get a fresh draft,
//     flagged as superseded — locked invoices are NEVER mutated.
// Re-running produces the same stable set of draft invoices, killing the
// manual delete-add that caused billing errors. `close` flips the period to
// the terminal "closed" status (the final "Generate" step).
export async function upsertInvoicesForPeriod(
  periodId: string,
  opts: { ranBy?: string; close?: boolean } = {},
): Promise<InvoiceUpsertResult> {
  const supabase = await createClient();
  const { ranBy, close = false } = opts;

  const preview = await previewInvoicesForPeriod(periodId, { onlyApproved: true });
  if (!preview) throw new Error("Payroll period not found.");
  if (close && preview.groups.length === 0) {
    throw new Error("No approved timecards to invoice. Approve timecards first.");
  }

  const issuedAt = preview.period.invoice_date ?? new Date().toISOString().slice(0, 10);
  const issuedDate = new Date(issuedAt + "T00:00:00");
  const dueDate = new Date(issuedDate);
  dueDate.setDate(dueDate.getDate() + 10);
  const dueAt = dueDate.toISOString().slice(0, 10);

  // Existing invoices already attached to this period, indexed by group key.
  const { data: existingRaw } = await supabase
    .from("invoices")
    .select("id, client_id, department, branch, status, number")
    .eq("payroll_period_id", periodId);
  type ExistingInv = {
    id: string;
    client_id: string;
    department: string | null;
    branch: string | null;
    status: string;
    number: string;
  };
  const existing = (existingRaw ?? []) as ExistingInv[];
  const draftsByKey = new Map<string, ExistingInv[]>();
  const lockedByKey = new Map<string, ExistingInv[]>();
  for (const inv of existing) {
    const key = groupKey(inv.client_id, (inv.department || DEFAULT_DEPT).trim() || DEFAULT_DEPT, inv.branch);
    const bucket = inv.status === "draft" ? draftsByKey : lockedByKey;
    const arr = bucket.get(key) ?? [];
    arr.push(inv);
    bucket.set(key, arr);
  }

  let invoiceCount = await countInvoices();
  let invoicesCreated = 0;
  let invoicesUpdated = 0;
  let invoicesSuperseded = 0;
  let lineItemsCreated = 0;
  let totalBilled = 0;
  const activeKeys = new Set<string>();

  for (const g of preview.groups) {
    const key = groupKey(g.clientId, g.department, g.branch);
    activeKeys.add(key);

    const subtotal = round2(g.subtotal);
    const feePct = round2(g.serviceFeePct);
    const fee = round2(subtotal * (feePct / 100));
    const total = round2(subtotal + fee);
    totalBilled += total;

    const drafts = draftsByKey.get(key) ?? [];
    let invoiceId: string;

    if (drafts.length > 0) {
      // Reuse the first draft; collapse any duplicate drafts for this group.
      const keep = drafts[0];
      invoiceId = keep.id;
      const dupes = drafts.slice(1).map((d) => d.id);
      if (dupes.length > 0) {
        await supabase.from("invoices").delete().in("id", dupes); // line items cascade
      }
      await supabase
        .from("invoices")
        .update({
          subtotal,
          fee_pct: feePct,
          fee,
          tax: 0,
          total,
          issued_at: issuedAt,
          due_at: dueAt,
          department: g.department,
          branch: g.branch,
          bill_to_client_name: g.clientName,
        })
        .eq("id", invoiceId);
      // Replace the line items from current hours.
      await supabase.from("invoice_line_items").delete().eq("invoice_id", invoiceId);
      invoicesUpdated++;
    } else {
      invoiceCount++;
      if ((lockedByKey.get(key) ?? []).length > 0) invoicesSuperseded++;
      const { data: inv, error: invErr } = await supabase
        .from("invoices")
        .insert({
          number: nextInvoiceNumber(invoiceCount - 1),
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
      invoiceId = inv.id;
      invoicesCreated++;
    }

    const items = buildGroupLineItems(invoiceId, g);
    if (items.length > 0) {
      const { error: liErr } = await supabase.from("invoice_line_items").insert(items);
      if (liErr) throw new Error(liErr.message);
      lineItemsCreated += items.length;
    }
  }

  // Remove stale drafts: a draft whose group no longer has any hours.
  let invoicesRemoved = 0;
  const staleIds: string[] = [];
  for (const [key, drafts] of draftsByKey) {
    if (!activeKeys.has(key)) staleIds.push(...drafts.map((d) => d.id));
  }
  if (staleIds.length > 0) {
    await supabase.from("invoices").delete().in("id", staleIds);
    invoicesRemoved = staleIds.length;
  }

  const noteParts = [
    `${invoicesUpdated} updated`,
    `${invoicesCreated} created`,
    `${invoicesRemoved} removed`,
  ];
  if (invoicesSuperseded > 0) noteParts.push(`${invoicesSuperseded} superseded (locked)`);

  const { data: runRow, error: rErr } = await supabase
    .from("invoice_runs")
    .insert({
      payroll_period_id: periodId,
      ran_by: ranBy ?? null,
      invoices_created: invoicesCreated + invoicesUpdated,
      line_items_created: lineItemsCreated,
      total_billed: round2(totalBilled),
      notes: noteParts.join(" · "),
    })
    .select("id")
    .single();
  if (rErr) throw new Error(rErr.message);

  if (close) {
    await supabase
      .from("payroll_periods")
      .update({ status: "closed", invoice_date: preview.period.invoice_date ?? issuedAt })
      .eq("id", periodId);
  }

  return {
    runId: runRow.id,
    invoicesCreated,
    invoicesUpdated,
    invoicesRemoved,
    invoicesSuperseded,
    lineItemsCreated,
    totalBilled: round2(totalBilled),
  };
}

// Refresh draft invoices from current hours WITHOUT closing the period. Safe to
// run repeatedly as time cards change — this is the "entering hours once
// updates the invoice" path operators use while reviewing.
export async function regenerateDraftInvoicesForPeriod(
  periodId: string,
  ranBy?: string,
): Promise<InvoiceUpsertResult> {
  return upsertInvoicesForPeriod(periodId, { ranBy, close: false });
}

// Commit the preview and move the period to terminal "closed" status. Now
// idempotent — re-running reuses existing draft invoices instead of piling up
// new numbers.
export async function commitInvoicesForPeriod(
  periodId: string,
  ranBy?: string,
): Promise<{ runId: string; invoicesCreated: number; lineItemsCreated: number; totalBilled: number }> {
  const r = await upsertInvoicesForPeriod(periodId, { ranBy, close: true });
  return {
    runId: r.runId,
    invoicesCreated: r.invoicesCreated + r.invoicesUpdated,
    lineItemsCreated: r.lineItemsCreated,
    totalBilled: r.totalBilled,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
