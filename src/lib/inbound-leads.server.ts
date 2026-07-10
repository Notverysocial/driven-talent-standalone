import "server-only";
import { createClient, createServiceClient } from "./supabase/server";
import type { SalesLead } from "./supabase/types";

// Inbound employer leads captured by the public marketing site
// (driven-talent-site → /api/contact employer branch, and /api/schedule-call).
// Those handlers insert directly into `sales_leads` with source='inbound_web'.
// Historically the only place that surfaced was the Sales Pipeline board, so
// the ops team never saw new employer requests. This module makes them visible
// where the team actually works: the Dashboard (widget + KPI + nav badge) and
// the Inbox (mirrored as a conversation, exactly like a website application).
//
// Everything here is FAIL-SAFE: read helpers return empty/zero on any error and
// the Inbox sync never throws, so a lead-surfacing hiccup can never break a
// page render.

// A stable marker embedded in the mirrored contact's `notes`, used as an
// idempotency ledger so the sync only creates one Inbox conversation per lead.
// (No schema change: we can't add a FK column without a migration that isn't
// auto-applied, so we dedupe on this token instead.)
const LEAD_TOKEN_RE = /\[dt-lead:([0-9a-fA-F-]{36})\]/g;
function leadToken(id: string): string {
  return `[dt-lead:${id}]`;
}

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

function buildLeadMessage(lead: InboundLead): string {
  const lines: string[] = [];
  lines.push(`New staffing request from ${lead.company_name}.`);
  if (lead.contact_name) lines.push(`Contact: ${lead.contact_name}`);
  if (lead.contact_email) lines.push(`Email: ${lead.contact_email}`);
  if (lead.contact_phone) lines.push(`Phone: ${lead.contact_phone}`);
  if (lead.city) lines.push(`Worksite city: ${lead.city}`);
  if (lead.estimated_headcount != null)
    lines.push(`Workers needed: ~${lead.estimated_headcount}`);
  // `notes` carries the form-only fields (positions, service type, shifts,
  // target start, required skills) packed by the public-site handler.
  if (lead.notes) lines.push(`\n${lead.notes}`);
  return lines.join("\n");
}

/**
 * Mirror inbound employer leads into the Inbox so they surface in the shared
 * queue (with an unread indicator) exactly like website applications do.
 *
 * Idempotent: leads already mirrored (detected via the `[dt-lead:<id>]` token
 * on their contact) are skipped, so this is safe to call on every render of
 * the Inbox / Dashboard. Fully fail-safe — never throws.
 *
 * Returns the number of NEW conversations created this call (0 when nothing
 * new, which is the common case).
 */
export async function syncInboundEmployerLeadsToInbox(): Promise<number> {
  try {
    const sb = createServiceClient();

    const { data: leads, error: leadsErr } = await sb
      .from("sales_leads")
      .select(LEAD_COLUMNS)
      .eq("source", "inbound_web")
      .order("created_at", { ascending: true });
    if (leadsErr || !leads || leads.length === 0) return 0;

    // Build the ledger of already-mirrored lead ids from existing contacts.
    const { data: mirrored } = await sb
      .from("contacts")
      .select("notes")
      .ilike("notes", "%[dt-lead:%");
    const seen = new Set<string>();
    for (const row of mirrored ?? []) {
      const notes = (row as { notes: string | null }).notes;
      if (!notes) continue;
      for (const m of notes.matchAll(LEAD_TOKEN_RE)) seen.add(m[1].toLowerCase());
    }

    let created = 0;
    for (const raw of leads as InboundLead[]) {
      if (seen.has(raw.id.toLowerCase())) continue;

      // 1) Contact (type 'employer') carrying the idempotency token.
      const { data: contact, error: contactErr } = await sb
        .from("contacts")
        .insert({
          full_name: raw.contact_name,
          email: raw.contact_email,
          phone: raw.contact_phone,
          company: raw.company_name,
          type: "employer",
          source: "Website Employer Form",
          notes: `Inbound employer staffing request. ${leadToken(raw.id)}`,
        })
        .select("id")
        .single();
      if (contactErr || !contact) continue;

      // 2) Conversation in the shared Inbox. `channel` uses an existing enum
      //    value ('web_chat'); the 'employer' contact type + subject make it
      //    unmistakable as a staffing request.
      const { data: conv, error: convErr } = await sb
        .from("conversations")
        .insert({
          contact_id: contact.id,
          subject: `Employer Lead · ${raw.company_name}`,
          status: "open",
          channel: "web_chat",
        })
        .select("id")
        .single();
      if (convErr || !conv) continue;

      // 3) Opening message — unread, visitor-side, so the Inbox shows it as a
      //    new actionable item (the in-app "a lead arrived" signal).
      await sb.from("messages").insert({
        conversation_id: conv.id,
        sender_type: "visitor",
        sender_name: raw.contact_name ?? raw.company_name,
        body: buildLeadMessage(raw),
        read: false,
      });

      seen.add(raw.id.toLowerCase());
      created += 1;
    }
    return created;
  } catch (e) {
    console.error(
      "[inbound-leads] sync failed (non-fatal):",
      e instanceof Error ? e.message : String(e),
    );
    return 0;
  }
}
