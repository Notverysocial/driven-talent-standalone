import "server-only";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "./supabase/server";
import { resolveMarkup, type MarkupSource } from "./markup";
import type {
  Client,
  ClientContact,
  ClientWorkersCompCode,
  EmployeeAssignment,
  InvoiceLineItem,
  InvoiceStatus,
} from "./supabase/types";

// Client contacts directory (table from migration 0020, surfaced in the
// Client section UI). Ordered by name for stable display.
export async function listClientContacts(
  clientId: string,
): Promise<ClientContact[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_contacts")
    .select("*")
    .eq("client_id", clientId)
    .order("full_name");
  if (error) throw new Error(error.message);
  return (data ?? []) as ClientContact[];
}

// Per-client × position workers-comp code mapping (task 86e20w8tq). Ordered
// by position for stable display. Empty array when none configured yet.
export async function listClientWorkersCompCodes(
  clientId: string,
): Promise<ClientWorkersCompCode[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_workers_comp_codes")
    .select("*")
    .eq("client_id", clientId)
    .order("position");
  if (error) throw new Error(error.message);
  return (data ?? []) as ClientWorkersCompCode[];
}

// One row per client in the margin overview list.
// `realized*` come from posted invoices (the "what we billed and what
// it cost us" view). `expected*` come from active assignments (the
// forward-looking "what the next week of placements will look like").
export type ClientMarginRow = {
  client: Client;
  realizedRevenue: number;
  realizedCost: number;
  realizedGross: number;
  realizedMarginPct: number | null;
  invoiceCount: number;
  paidRevenue: number;
  openRevenue: number;
  activeHeadcount: number;
  activePlacements: number;
  avgPayRate: number;
  avgBillRate: number;
  expectedWeeklyRevenue: number;
  expectedWeeklyCost: number;
  expectedMarginPct: number | null;
};

export type ClientMarginsOverview = {
  totals: {
    clients: number;
    realizedRevenue: number;
    realizedCost: number;
    realizedMarginPct: number | null;
    activeHeadcount: number;
    expectedWeeklyRevenue: number;
    expectedWeeklyMarginPct: number | null;
  };
  rows: ClientMarginRow[];
  // Non-empty when one of the analytics sub-queries (invoices / line items /
  // assignments) failed — e.g. a live-schema drift on a column this page
  // selects. The client list still renders; the flagged financial figures fall
  // back to zero and the page shows a "figures unavailable" banner. Names the
  // table(s) that failed; the precise DB error is sent to Sentry.
  warnings: string[];
};

// Pull margin overview across all clients. Computes per-client realized
// margins from invoices + line items and expected margins from active
// employee_assignments. All math in JS — Supabase aggregate support is
// limited, but the data volumes here (clients × invoices) are small.
export async function getClientMarginsOverview(): Promise<ClientMarginsOverview> {
  const supabase = await createClient();

  const [clientsRes, invoicesRes, lineItemsRes, assignmentsRes] = await Promise.all([
    supabase.from("clients").select("*").order("name"),
    supabase
      .from("invoices")
      .select("id, client_id, status, total, subtotal")
      .neq("status", "void"),
    supabase
      .from("invoice_line_items")
      .select("invoice_id, amount, employee_cost"),
    supabase
      .from("employee_assignments")
      .select("client_id, employee_id, hourly_rate, bill_rate, active")
      .eq("active", true),
  ]);

  // The clients list is the backbone of this page: without it there is nothing
  // to render, so let it surface to the route error boundary (clients/error.tsx).
  if (clientsRes.error) {
    throw new Error(
      `/clients margins: clients query failed — ${clientsRes.error.message}`,
    );
  }

  // The three analytics queries are additive. If one fails — e.g. the live DB
  // schema drifted from a column this page selects (invoices / line items /
  // employee_assignments) — we must NOT 500 the whole route and lock the team
  // out of their client list. Log the exact DB error to Sentry (so the offending
  // column is named on the next prod hit) and degrade that dataset to empty,
  // flagged via `warnings` so the page can tell the user its figures are stale.
  const warnings: string[] = [];
  function degraded(label: string, err: { message: string } | null): boolean {
    if (!err) return false;
    const detail = `/clients margins: ${label} query failed — ${err.message}`;
    console.error(detail);
    Sentry.captureException(new Error(detail));
    warnings.push(label);
    return true;
  }
  const invoicesFailed = degraded("invoices", invoicesRes.error);
  const lineItemsFailed = degraded("invoice_line_items", lineItemsRes.error);
  const assignmentsFailed = degraded("employee_assignments", assignmentsRes.error);

  const clients = (clientsRes.data ?? []) as Client[];
  type InvRow = {
    id: string;
    client_id: string;
    status: InvoiceStatus;
    total: number;
    subtotal: number;
  };
  const invoices = (invoicesFailed ? [] : invoicesRes.data ?? []) as InvRow[];
  const lineItems = (lineItemsFailed ? [] : lineItemsRes.data ?? []) as Pick<
    InvoiceLineItem,
    "invoice_id" | "amount" | "employee_cost"
  >[];
  const assignments = (assignmentsFailed ? [] : assignmentsRes.data ?? []) as Pick<
    EmployeeAssignment,
    "client_id" | "employee_id" | "hourly_rate" | "bill_rate" | "active"
  >[];

  const liByInvoice = new Map<string, { revenue: number; cost: number }>();
  for (const li of lineItems) {
    const bucket = liByInvoice.get(li.invoice_id) ?? { revenue: 0, cost: 0 };
    bucket.revenue += Number(li.amount ?? 0);
    bucket.cost += Number(li.employee_cost ?? 0);
    liByInvoice.set(li.invoice_id, bucket);
  }

  const invoicesByClient = new Map<string, InvRow[]>();
  for (const inv of invoices) {
    const arr = invoicesByClient.get(inv.client_id) ?? [];
    arr.push(inv);
    invoicesByClient.set(inv.client_id, arr);
  }

  const assignmentsByClient = new Map<string, typeof assignments>();
  for (const a of assignments) {
    const arr = assignmentsByClient.get(a.client_id) ?? [];
    arr.push(a);
    assignmentsByClient.set(a.client_id, arr);
  }

  const rows: ClientMarginRow[] = clients.map((c) => {
    const clientInvoices = invoicesByClient.get(c.id) ?? [];
    let realizedRevenue = 0;
    let realizedCost = 0;
    let paidRevenue = 0;
    let openRevenue = 0;
    for (const inv of clientInvoices) {
      const li = liByInvoice.get(inv.id);
      if (li) {
        realizedRevenue += li.revenue;
        realizedCost += li.cost;
      } else {
        // No line items recorded — fall back to invoice subtotal for revenue,
        // and treat cost as unknown (0). Keeps margin visible but optimistic;
        // only fires for hand-entered legacy invoices.
        realizedRevenue += Number(inv.subtotal ?? 0);
      }
      if (inv.status === "paid") paidRevenue += Number(inv.total ?? 0);
      if (inv.status === "draft" || inv.status === "sent") {
        openRevenue += Number(inv.total ?? 0);
      }
    }
    const realizedGross = realizedRevenue - realizedCost;
    const realizedMarginPct =
      realizedRevenue > 0 ? (realizedGross / realizedRevenue) * 100 : null;

    const clientAssignments = assignmentsByClient.get(c.id) ?? [];
    const activeHeadcount = new Set(clientAssignments.map((a) => a.employee_id)).size;
    const activePlacements = clientAssignments.length;

    let payTotal = 0;
    let billTotal = 0;
    for (const a of clientAssignments) {
      const pay = Number(a.hourly_rate ?? 0);
      const fallbackBill = pay * (1 + Number(c.service_fee_pct ?? 0) / 100);
      const bill = a.bill_rate != null ? Number(a.bill_rate) : fallbackBill;
      payTotal += pay;
      billTotal += bill;
    }
    const avgPayRate = activePlacements ? payTotal / activePlacements : 0;
    const avgBillRate = activePlacements ? billTotal / activePlacements : 0;
    const expectedWeeklyRevenue = billTotal * 40;
    const expectedWeeklyCost = payTotal * 40;
    const expectedMarginPct =
      expectedWeeklyRevenue > 0
        ? ((expectedWeeklyRevenue - expectedWeeklyCost) / expectedWeeklyRevenue) * 100
        : null;

    return {
      client: c,
      realizedRevenue,
      realizedCost,
      realizedGross,
      realizedMarginPct,
      invoiceCount: clientInvoices.length,
      paidRevenue,
      openRevenue,
      activeHeadcount,
      activePlacements,
      avgPayRate,
      avgBillRate,
      expectedWeeklyRevenue,
      expectedWeeklyCost,
      expectedMarginPct,
    };
  });

  rows.sort((a, b) => b.realizedRevenue - a.realizedRevenue);

  const totalRealizedRevenue = rows.reduce((s, r) => s + r.realizedRevenue, 0);
  const totalRealizedCost = rows.reduce((s, r) => s + r.realizedCost, 0);
  const totalExpectedRevenue = rows.reduce((s, r) => s + r.expectedWeeklyRevenue, 0);
  const totalExpectedCost = rows.reduce((s, r) => s + r.expectedWeeklyCost, 0);

  return {
    totals: {
      clients: clients.length,
      realizedRevenue: totalRealizedRevenue,
      realizedCost: totalRealizedCost,
      realizedMarginPct:
        totalRealizedRevenue > 0
          ? ((totalRealizedRevenue - totalRealizedCost) / totalRealizedRevenue) * 100
          : null,
      activeHeadcount: rows.reduce((s, r) => s + r.activeHeadcount, 0),
      expectedWeeklyRevenue: totalExpectedRevenue,
      expectedWeeklyMarginPct:
        totalExpectedRevenue > 0
          ? ((totalExpectedRevenue - totalExpectedCost) / totalExpectedRevenue) * 100
          : null,
    },
    rows,
    warnings,
  };
}

// Drill-in: per-invoice margin breakdown plus active assignments for a
// single client. Returns null if the slug doesn't resolve.
export type ClientMarginInvoice = {
  id: string;
  number: string;
  status: InvoiceStatus;
  issued_at: string;
  period_start: string;
  period_end: string;
  department: string | null;
  revenue: number;
  cost: number;
  gross: number;
  marginPct: number | null;
  total: number;
  is_overdue: boolean;
};

export type ClientMarginAssignment = {
  id: string;
  employee_id: string;
  employee_name: string;
  position: string | null;
  department: string | null;
  shift: string | null;
  hourly_rate: number;
  bill_rate: number;
  bill_rate_inferred: boolean;
  /** The per-employee markup as stored (null = not set, falls back). */
  markup_percent: number | null;
  /** Effective markup after the fallback chain; null when pay rate is 0. */
  effective_markup_pct: number | null;
  markup_source: MarkupSource;
  markup_label: string;
  /** True when nothing is configured anywhere and we are billing at cost. */
  markup_missing: boolean;
  hourly_gross: number;
  marginPct: number | null;
};

export type ClientMarginDetail = {
  client: Client;
  overview: ClientMarginRow;
  invoices: ClientMarginInvoice[];
  assignments: ClientMarginAssignment[];
};

export async function getClientMarginDetail(
  slug: string,
): Promise<ClientMarginDetail | null> {
  const supabase = await createClient();
  const { data: clientRow, error: clientErr } = await supabase
    .from("clients")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (clientErr) throw new Error(clientErr.message);
  if (!clientRow) return null;
  const client = clientRow as Client;

  const [invoicesRes, assignmentsRes] = await Promise.all([
    // Query the base `invoices` table, not the `invoices_with_overdue` view.
    // That view is `select i.*` and was last rebuilt in migration 0001, so it
    // never picked up the `department` column added to `invoices` in 0006 —
    // selecting `department` from the view errors and 500s the drill-in.
    // We fetch `due_at` instead and derive `is_overdue` in JS below.
    supabase
      .from("invoices")
      .select(
        "id, number, status, issued_at, period_start, period_end, department, total, subtotal, due_at",
      )
      .eq("client_id", client.id)
      .order("issued_at", { ascending: false }),
    supabase
      .from("employee_assignments")
      .select(
        "id, employee_id, position, department, shift, hourly_rate, bill_rate, markup_percent, active, employees ( full_name )",
      )
      .eq("client_id", client.id)
      .eq("active", true)
      .order("position"),
  ]);

  if (invoicesRes.error) throw new Error(invoicesRes.error.message);
  if (assignmentsRes.error) throw new Error(assignmentsRes.error.message);

  type InvRow = {
    id: string;
    number: string;
    status: InvoiceStatus;
    issued_at: string;
    period_start: string;
    period_end: string;
    department: string | null;
    total: number;
    subtotal: number;
    due_at: string;
  };
  const invoiceRows = (invoicesRes.data ?? []) as InvRow[];
  // Matches the dropped view's logic: an invoice is overdue when it's been
  // sent and its due date is in the past.
  const todayISO = new Date().toISOString().slice(0, 10);
  const invoiceIds = invoiceRows.map((r) => r.id);

  let lineItems: Pick<InvoiceLineItem, "invoice_id" | "amount" | "employee_cost">[] = [];
  if (invoiceIds.length > 0) {
    const liRes = await supabase
      .from("invoice_line_items")
      .select("invoice_id, amount, employee_cost")
      .in("invoice_id", invoiceIds);
    if (liRes.error) throw new Error(liRes.error.message);
    lineItems = (liRes.data ?? []) as Pick<
      InvoiceLineItem,
      "invoice_id" | "amount" | "employee_cost"
    >[];
  }

  const liByInvoice = new Map<string, { revenue: number; cost: number }>();
  for (const li of lineItems) {
    const bucket = liByInvoice.get(li.invoice_id) ?? { revenue: 0, cost: 0 };
    bucket.revenue += Number(li.amount ?? 0);
    bucket.cost += Number(li.employee_cost ?? 0);
    liByInvoice.set(li.invoice_id, bucket);
  }

  const invoices: ClientMarginInvoice[] = invoiceRows.map((inv) => {
    const li = liByInvoice.get(inv.id);
    const revenue = li ? li.revenue : Number(inv.subtotal ?? 0);
    const cost = li ? li.cost : 0;
    const gross = revenue - cost;
    return {
      id: inv.id,
      number: inv.number,
      status: inv.status,
      issued_at: inv.issued_at,
      period_start: inv.period_start,
      period_end: inv.period_end,
      department: inv.department,
      revenue,
      cost,
      gross,
      marginPct: revenue > 0 ? (gross / revenue) * 100 : null,
      total: Number(inv.total ?? 0),
      is_overdue: inv.status === "sent" && inv.due_at < todayISO,
    };
  });

  type RawAssignment = {
    id: string;
    employee_id: string;
    position: string | null;
    department: string | null;
    shift: string | null;
    hourly_rate: number;
    bill_rate: number | null;
    markup_percent: number | null;
    active: boolean;
    employees: { full_name: string } | null;
  };
  const assignmentRows = (assignmentsRes.data ?? []) as unknown as RawAssignment[];

  const assignments: ClientMarginAssignment[] = assignmentRows.map((a) => {
    const pay = Number(a.hourly_rate ?? 0);
    // Same resolver the invoicing engine uses, so this roster shows the rate
    // that will actually be billed rather than a second, drifting copy of the
    // fallback rule.
    const markup = resolveMarkup({
      payRate: pay,
      assignmentBillRate: a.bill_rate,
      employeeMarkupPct: a.markup_percent,
      clientMarkupPct: client.service_fee_pct,
    });
    const bill = markup.billRate;
    const gross = bill - pay;
    return {
      id: a.id,
      employee_id: a.employee_id,
      employee_name: a.employees?.full_name ?? "—",
      position: a.position,
      department: a.department,
      shift: a.shift,
      hourly_rate: pay,
      bill_rate: bill,
      bill_rate_inferred: markup.source !== "assignment_bill_rate",
      markup_percent: a.markup_percent == null ? null : Number(a.markup_percent),
      effective_markup_pct: markup.markupPct,
      markup_source: markup.source,
      markup_label: markup.label,
      markup_missing: markup.needsAttention,
      hourly_gross: gross,
      marginPct: bill > 0 ? (gross / bill) * 100 : null,
    };
  });

  const realizedRevenue = invoices.reduce((s, i) => s + i.revenue, 0);
  const realizedCost = invoices.reduce((s, i) => s + i.cost, 0);
  const realizedGross = realizedRevenue - realizedCost;
  const payTotal = assignments.reduce((s, a) => s + a.hourly_rate, 0);
  const billTotal = assignments.reduce((s, a) => s + a.bill_rate, 0);
  const expectedWeeklyRevenue = billTotal * 40;
  const expectedWeeklyCost = payTotal * 40;

  const overview: ClientMarginRow = {
    client,
    realizedRevenue,
    realizedCost,
    realizedGross,
    realizedMarginPct:
      realizedRevenue > 0 ? (realizedGross / realizedRevenue) * 100 : null,
    invoiceCount: invoices.length,
    paidRevenue: invoices
      .filter((i) => i.status === "paid")
      .reduce((s, i) => s + i.total, 0),
    openRevenue: invoices
      .filter((i) => i.status === "draft" || i.status === "sent")
      .reduce((s, i) => s + i.total, 0),
    activeHeadcount: new Set(assignments.map((a) => a.employee_id)).size,
    activePlacements: assignments.length,
    avgPayRate: assignments.length ? payTotal / assignments.length : 0,
    avgBillRate: assignments.length ? billTotal / assignments.length : 0,
    expectedWeeklyRevenue,
    expectedWeeklyCost,
    expectedMarginPct:
      expectedWeeklyRevenue > 0
        ? ((expectedWeeklyRevenue - expectedWeeklyCost) / expectedWeeklyRevenue) * 100
        : null,
  };

  return { client, overview, invoices, assignments };
}
