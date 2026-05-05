import "server-only";
import { createClient } from "./supabase/server";
import type {
  Client,
  Invoice,
  InvoiceLineItem,
  InvoiceStatus,
} from "./supabase/types";

export type InvoiceRow = Invoice & { is_overdue: boolean; clients: Client };

export async function listInvoices(): Promise<InvoiceRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices_with_overdue")
    .select("*, clients(*)")
    .order("issued_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as InvoiceRow[];
}

export async function getInvoice(id: string): Promise<{
  invoice: InvoiceRow;
  lineItems: InvoiceLineItem[];
} | null> {
  const supabase = await createClient();
  const [invRes, liRes] = await Promise.all([
    supabase
      .from("invoices_with_overdue")
      .select("*, clients(*)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("invoice_line_items")
      .select("*")
      .eq("invoice_id", id)
      .order("sort_order"),
  ]);
  if (invRes.error) throw new Error(invRes.error.message);
  if (liRes.error) throw new Error(liRes.error.message);
  if (!invRes.data) return null;
  return {
    invoice: invRes.data as unknown as InvoiceRow,
    lineItems: (liRes.data ?? []) as InvoiceLineItem[],
  };
}

export async function listClientsForInvoicing(): Promise<Client[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("clients").select("*").order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Client[];
}

export async function countInvoices(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("invoices")
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

// Lookups for invoice status counts on the list page header.
export async function statusCounts(): Promise<Record<InvoiceStatus, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices_with_overdue")
    .select("status, is_overdue");
  if (error) throw new Error(error.message);
  const counts: Record<InvoiceStatus, number> = {
    draft: 0, sent: 0, paid: 0, overdue: 0, void: 0,
  };
  for (const row of (data ?? []) as { status: InvoiceStatus; is_overdue: boolean }[]) {
    if (row.is_overdue) counts.overdue++;
    else counts[row.status]++;
  }
  return counts;
}
