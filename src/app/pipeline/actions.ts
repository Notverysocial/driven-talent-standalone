"use server";

// AUTH: every export below is a directly-invocable endpoint, not a private
// function — Next compiles each one into its own addressable POST. The gate
// belongs on the ACTION, not only on the page that happens to render it.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  SalesLeadActivityType,
  SalesLeadSource,
  SalesLeadStage,
} from "@/lib/supabase/types";
import { requireUser } from "@/lib/auth.server";
import { clearedSourceDetail, isQuarantined } from "@/lib/lead-quarantine";

function s(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function n(v: FormDataEntryValue | null): number | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

async function logActivity(
  leadId: string,
  activity_type: SalesLeadActivityType,
  summary: string,
  extras: { body?: string | null; actor?: string | null; meta?: Record<string, unknown> } = {},
) {
  const sb = await createClient();
  await sb.from("sales_lead_activities").insert({
    lead_id: leadId,
    activity_type,
    summary,
    body: extras.body ?? null,
    actor: extras.actor ?? null,
    meta: extras.meta ?? {},
  });
}

export async function createSalesLead(formData: FormData) {
  await requireUser();
  const sb = await createClient();

  const company_name = (s(formData.get("company_name")) ?? "").trim();
  if (!company_name) throw new Error("Company name is required");

  const { data, error } = await sb
    .from("sales_leads")
    .insert({
      company_name,
      industry:        s(formData.get("industry")),
      website:         s(formData.get("website")),
      city:            s(formData.get("city")),
      contact_name:    s(formData.get("contact_name")),
      contact_title:   s(formData.get("contact_title")),
      contact_email:   s(formData.get("contact_email")),
      contact_phone:   s(formData.get("contact_phone")),
      stage:           (s(formData.get("stage")) ?? "new") as SalesLeadStage,
      source:          (s(formData.get("source")) ?? "other") as SalesLeadSource,
      source_detail:   s(formData.get("source_detail")),
      estimated_value: n(formData.get("estimated_value")),
      estimated_headcount: n(formData.get("estimated_headcount")),
      probability:     n(formData.get("probability")),
      owner:           s(formData.get("owner")),
      next_action:     s(formData.get("next_action")),
      next_action_due: s(formData.get("next_action_due")),
      notes:           s(formData.get("notes")),
      created_by:      s(formData.get("created_by")),
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  await logActivity(data.id, "note", "Lead created", {
    actor: s(formData.get("created_by")),
  });

  revalidatePath("/pipeline");
  redirect(`/pipeline/${data.id}`);
}

export async function setLeadStage(
  leadId: string,
  next: SalesLeadStage,
  actor?: string | null,
) {
  await requireUser();
  const sb = await createClient();
  const { data: prev, error: getErr } = await sb
    .from("sales_leads")
    .select("stage")
    .eq("id", leadId)
    .single();
  if (getErr) throw new Error(getErr.message);

  const from = prev.stage as SalesLeadStage;
  if (from === next) return;

  const patch: Record<string, unknown> = { stage: next };
  if (next === "won") patch.won_at = new Date().toISOString().slice(0, 10);
  if (next === "lost") patch.lost_at = new Date().toISOString().slice(0, 10);

  const { error } = await sb.from("sales_leads").update(patch).eq("id", leadId);
  if (error) throw new Error(error.message);

  await logActivity(leadId, "stage_changed", `Stage: ${from} → ${next}`, {
    actor: actor ?? null,
    meta: { from, to: next },
  });

  revalidatePath("/pipeline");
  revalidatePath(`/pipeline/${leadId}`);
}

export async function setLeadOwner(
  leadId: string,
  owner: string | null,
  actor?: string | null,
) {
  await requireUser();
  const sb = await createClient();
  const cleaned = owner?.trim() || null;

  const { data: prev, error: getErr } = await sb
    .from("sales_leads")
    .select("owner")
    .eq("id", leadId)
    .single();
  if (getErr) throw new Error(getErr.message);

  if ((prev.owner ?? null) === cleaned) return;

  const { error } = await sb
    .from("sales_leads")
    .update({ owner: cleaned })
    .eq("id", leadId);
  if (error) throw new Error(error.message);

  await logActivity(
    leadId,
    "owner_changed",
    cleaned
      ? `Owner: ${prev.owner ?? "—"} → ${cleaned}`
      : `Owner cleared (was ${prev.owner ?? "—"})`,
    { actor: actor ?? null, meta: { from: prev.owner ?? null, to: cleaned } },
  );

  revalidatePath("/pipeline");
  revalidatePath(`/pipeline/${leadId}`);
}

export async function updateLeadDetails(leadId: string, formData: FormData) {
  await requireUser();
  const sb = await createClient();
  const patch: Record<string, unknown> = {
    company_name:        s(formData.get("company_name")),
    industry:            s(formData.get("industry")),
    website:             s(formData.get("website")),
    city:                s(formData.get("city")),
    contact_name:        s(formData.get("contact_name")),
    contact_title:       s(formData.get("contact_title")),
    contact_email:       s(formData.get("contact_email")),
    contact_phone:       s(formData.get("contact_phone")),
    source:              s(formData.get("source")) ?? "other",
    source_detail:       s(formData.get("source_detail")),
    estimated_value:     n(formData.get("estimated_value")),
    estimated_headcount: n(formData.get("estimated_headcount")),
    probability:         n(formData.get("probability")),
    next_action:         s(formData.get("next_action")),
    next_action_due:     s(formData.get("next_action_due")),
    lost_reason:         s(formData.get("lost_reason")),
    notes:               s(formData.get("notes")),
  };
  if (!patch.company_name) throw new Error("Company name is required");

  const { error } = await sb.from("sales_leads").update(patch).eq("id", leadId);
  if (error) throw new Error(error.message);

  revalidatePath("/pipeline");
  revalidatePath(`/pipeline/${leadId}`);
}

/**
 * "Not spam" — put an auto-quarantined lead back into the inbound queue.
 *
 * This is the escape hatch that makes the quarantine safe to have. The site's
 * spam guard is deliberately biased towards quarantining rather than rejecting,
 * which means the cost of a wrong call has to be one click, not a lost client:
 *
 *   source        -> 'inbound_web', so the Dashboard widget, the KPI, the
 *                    sidebar badge and the notification sweep can all see it
 *   source_detail -> marker, score and reasons stripped; which form it came
 *                    from and its UTM tags kept, because those are still true
 *   lead_notified_at -> cleared, so the next sweep emails the team about it
 *                    exactly as if it had arrived clean
 *
 * The restore is recorded as an activity so the lead's history shows a person
 * overruled the filter, and when.
 */
export async function restoreQuarantinedLead(
  leadId: string,
  actor?: string | null,
) {
  await requireUser();
  const sb = await createClient();

  const { data: lead, error: getErr } = await sb
    .from("sales_leads")
    .select("source_detail, next_action")
    .eq("id", leadId)
    .single();
  if (getErr) throw new Error(getErr.message);

  // Not quarantined (or already restored) — nothing to undo. Silent rather than
  // an error, so a double-click on the button is harmless.
  if (!isQuarantined(lead)) return;

  const { error } = await sb
    .from("sales_leads")
    .update({
      source: "inbound_web" as SalesLeadSource,
      source_detail: clearedSourceDetail(lead),
      lead_notified_at: null,
      next_action: "Follow up on inbound employer form submission",
    })
    .eq("id", leadId);
  if (error) throw new Error(error.message);

  await logActivity(
    leadId,
    "note",
    "Restored from spam quarantine — confirmed a real employer lead",
    {
      actor: actor ?? null,
      body: `Was auto-quarantined as: ${lead.source_detail}`,
      meta: { restored_from_quarantine: true },
    },
  );

  revalidatePath("/pipeline");
  revalidatePath(`/pipeline/${leadId}`);
  revalidatePath("/dashboard");
}

export async function addLeadActivity(leadId: string, formData: FormData) {
  await requireUser();
  const activity_type =
    (s(formData.get("activity_type")) as SalesLeadActivityType | null) ?? "note";
  const summary = (s(formData.get("summary")) ?? "").trim();
  if (!summary) throw new Error("Activity summary is required");

  await logActivity(leadId, activity_type, summary, {
    body:  s(formData.get("body")),
    actor: s(formData.get("actor")),
  });

  revalidatePath(`/pipeline/${leadId}`);
}
