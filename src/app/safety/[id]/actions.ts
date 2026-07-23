"use server";

// AUTH: every export below is a directly-invocable endpoint, not a private
// function — Next compiles each one into its own addressable POST. The gate
// belongs on the ACTION, not only on the page that happens to render it.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  getIncidentDetail,
  logIncidentEvent,
} from "@/lib/incidents.server";
import { PEOPLEASE_DEFAULT_EMAIL } from "@/lib/incidents";
import { requireUser } from "@/lib/auth.server";

// ---------- Case event log ---------------------------------------------

export async function addIncidentNote(incidentId: string, formData: FormData) {
  await requireUser();
  const note = ((formData.get("note") as string) || "").trim();
  const actor = ((formData.get("actor") as string) || "").trim() || null;
  if (!note) throw new Error("Note is required");

  await logIncidentEvent({
    incidentId,
    eventType: "note",
    summary: note.length > 80 ? note.slice(0, 77) + "…" : note,
    note,
    actor,
  });

  revalidatePath(`/safety/${incidentId}`);
}

// ---------- Per-case notification --------------------------------------

export async function sendIncidentNotification(
  incidentId: string,
  formData: FormData,
) {
  await requireUser();
  const recipient = ((formData.get("recipient") as string) || "").trim();
  const channel = (((formData.get("channel") as string) || "email") as
    | "email"
    | "sms");
  const message = ((formData.get("message") as string) || "").trim();
  const actor = ((formData.get("actor") as string) || "").trim() || null;

  if (!recipient) throw new Error("Recipient is required");
  if (!message) throw new Error("Message is required");

  // Note: no actual mail transport is wired up in v1 — this records a queued
  // notification in the case history so ops has an audit trail. The transport
  // layer (Postmark / Resend / etc.) is a follow-on milestone.
  await logIncidentEvent({
    incidentId,
    eventType: "notification_sent",
    summary: `Queued ${channel} to ${recipient}`,
    note: message,
    actor,
    meta: { recipient, channel },
  });

  revalidatePath(`/safety/${incidentId}`);
}

// ---------- Peoplease workers'-comp claim handoff ----------------------

export async function draftPeopleaseClaim(
  incidentId: string,
  formData: FormData,
) {
  await requireUser();
  const adjusterEmail =
    ((formData.get("adjuster_email") as string) || "").trim() ||
    PEOPLEASE_DEFAULT_EMAIL;
  const actor = ((formData.get("actor") as string) || "").trim() || null;

  const supabase = await createClient();
  const detail = await getIncidentDetail(incidentId);
  if (!detail) throw new Error("Incident not found");

  const draftedAt = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("safety_incidents")
    .update({
      peoplease_claim_drafted_at: draftedAt,
      peoplease_claim_email: adjusterEmail,
    })
    .eq("id", incidentId);
  if (updErr) throw new Error(updErr.message);

  await logIncidentEvent({
    incidentId,
    eventType: "peoplease_email_drafted",
    summary: `Peoplease claim draft prepared for ${adjusterEmail}`,
    actor,
    meta: { to: adjusterEmail },
  });

  revalidatePath(`/safety/${incidentId}`);
}

export async function markPeopleaseEmailSent(
  incidentId: string,
  formData: FormData,
) {
  await requireUser();
  const actor = ((formData.get("actor") as string) || "").trim() || null;
  const recipient =
    ((formData.get("recipient") as string) || "").trim() ||
    PEOPLEASE_DEFAULT_EMAIL;

  await logIncidentEvent({
    incidentId,
    eventType: "peoplease_email_sent",
    summary: `Peoplease claim email sent to ${recipient}`,
    actor,
    meta: { recipient },
  });

  revalidatePath(`/safety/${incidentId}`);
}
