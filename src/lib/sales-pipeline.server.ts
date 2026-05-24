import "server-only";
import { createClient } from "./supabase/server";
import type { SalesLead, SalesLeadActivity } from "./supabase/types";

export async function listSalesLeads(): Promise<SalesLead[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("sales_leads")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SalesLead[];
}

export async function getSalesLead(id: string): Promise<SalesLead | null> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("sales_leads")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SalesLead | null) ?? null;
}

export async function listSalesLeadActivities(
  leadId: string,
): Promise<SalesLeadActivity[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("sales_lead_activities")
    .select("*")
    .eq("lead_id", leadId)
    .order("occurred_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SalesLeadActivity[];
}

// Distinct owner names across all leads — feeds the owner-assignment picker.
export async function listSalesOwners(): Promise<string[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("sales_leads")
    .select("owner")
    .not("owner", "is", null);
  if (error) throw new Error(error.message);
  const seen = new Set<string>();
  for (const r of data ?? []) {
    const o = (r as { owner: string | null }).owner?.trim();
    if (o) seen.add(o);
  }
  return Array.from(seen).sort();
}
