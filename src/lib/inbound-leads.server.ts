import "server-only";
import { createClient } from "./supabase/server";
import type { SalesLead } from "./supabase/types";

// Inbound employer leads captured by the public marketing site
// (driven-talent-site → /api/contact employer branch, and /api/schedule-call).
// Those handlers insert directly into `sales_leads` with source='inbound_web'.
// Historically the only place that surfaced was the Sales Pipeline board, so
// the ops team never saw new employer requests. This module makes them visible
// where the team actually works: the Dashboard (widget + KPI + nav badge) and
// the Pipeline board.
//
// Change 4 (Leangel 2026-07-08): the Inbox was removed, so leads are NO LONGER
// mirrored into a conversation. The Dashboard card + KPI read the source table
// directly (below), so no lead is lost.
//
// Everything here is FAIL-SAFE: read helpers return empty/zero on any error,
// so a lead-surfacing hiccup can never break a page render.

export type InboundLead = Pick<
  SalesLead,
  | "id"
  | "company_name"
  | "contact_name"
  | "contact_email"
  | "contact_phone"
  | "city"
  | "estimated_headcount"
  | "stage"
  | "source_detail"
  | "next_action"
  | "notes"
  | "created_at"
>;

const LEAD_COLUMNS =
  "id, company_name, contact_name, contact_email, contact_phone, city, estimated_headcount, stage, source_detail, next_action, notes, created_at";

/** Recent inbound employer leads for the dashboard widget. Newest first. */
export async function listInboundEmployerLeads(
  limit = 8,
): Promise<InboundLead[]> {
  try {
    const sb = await createClient();
    const { data, error } = await sb
      .from("sales_leads")
      .select(LEAD_COLUMNS)
      .eq("source", "inbound_web")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return [];
    return (data ?? []) as InboundLead[];
  } catch {
    return [];
  }
}

/** Count of inbound employer leads still in the "new" stage (untriaged). */
export async function countNewInboundLeads(): Promise<number> {
  try {
    const sb = await createClient();
    const { count, error } = await sb
      .from("sales_leads")
      .select("id", { count: "exact", head: true })
      .eq("source", "inbound_web")
      .eq("stage", "new");
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}
