"use server";

// AUTH: every export below is a directly-invocable endpoint, not a private
// function — Next compiles each one into its own addressable POST. The gate
// belongs on the ACTION, not only on the page that happens to render it.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log.server";
import { DEFAULT_CRITERIA, weightedScore } from "@/lib/candidates";
import type { InboundCallStatus } from "@/lib/recruiting";
import type { CandidateStatus } from "@/lib/supabase/types";
import { requireUser } from "@/lib/auth.server";

export async function logInboundCall(formData: FormData) {
  await requireUser();
  const sb = await createClient();
  const calledAtRaw = (formData.get("called_at") as string)?.trim();

  const { error } = await sb.from("inbound_calls").insert({
    caller_name:          (formData.get("caller_name") as string).trim(),
    caller_phone:         (formData.get("caller_phone") as string)?.trim() || null,
    caller_email:         (formData.get("caller_email") as string)?.trim() || null,
    position_of_interest: (formData.get("position_of_interest") as string)?.trim() || null,
    called_at:            calledAtRaw ? new Date(calledAtRaw).toISOString() : new Date().toISOString(),
    taken_by:             (formData.get("taken_by") as string)?.trim() || null,
    notes:                (formData.get("notes") as string)?.trim() || null,
    follow_up_status:     "new" satisfies InboundCallStatus,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/calls");
}

export async function updateCall(callId: string, formData: FormData) {
  await requireUser();
  const sb = await createClient();
  const callerName = (formData.get("caller_name") as string)?.trim();
  if (!callerName) throw new Error("Caller name is required");

  const calledAtRaw = (formData.get("called_at") as string)?.trim();
  const statusRaw = (formData.get("follow_up_status") as string)?.trim();
  const validStatuses: InboundCallStatus[] = [
    "new",
    "contacted",
    "left_voicemail",
    "converted",
    "dropped",
  ];

  const patch: {
    caller_name: string;
    caller_phone: string | null;
    caller_email: string | null;
    position_of_interest: string | null;
    taken_by: string | null;
    notes: string | null;
    called_at?: string;
    follow_up_status?: InboundCallStatus;
  } = {
    caller_name: callerName,
    caller_phone: (formData.get("caller_phone") as string)?.trim() || null,
    caller_email: (formData.get("caller_email") as string)?.trim() || null,
    position_of_interest:
      (formData.get("position_of_interest") as string)?.trim() || null,
    taken_by: (formData.get("taken_by") as string)?.trim() || null,
    notes: (formData.get("notes") as string)?.trim() || null,
  };
  if (calledAtRaw) patch.called_at = new Date(calledAtRaw).toISOString();
  if (statusRaw && validStatuses.includes(statusRaw as InboundCallStatus)) {
    patch.follow_up_status = statusRaw as InboundCallStatus;
  }

  const { error } = await sb.from("inbound_calls").update(patch).eq("id", callId);
  if (error) throw new Error(error.message);
  revalidatePath("/calls");
}

export async function deleteCall(callId: string) {
  await requireUser();
  const sb = await createClient();
  const { error } = await sb.from("inbound_calls").delete().eq("id", callId);
  if (error) throw new Error(error.message);
  revalidatePath("/calls");
}

export async function setCallStatus(callId: string, status: InboundCallStatus) {
  await requireUser();
  const sb = await createClient();
  const { error } = await sb
    .from("inbound_calls")
    .update({ follow_up_status: status })
    .eq("id", callId);
  if (error) throw new Error(error.message);
  revalidatePath("/calls");
}

export async function updateCallNotes(callId: string, notes: string) {
  await requireUser();
  const sb = await createClient();
  const { error } = await sb
    .from("inbound_calls")
    .update({ notes })
    .eq("id", callId);
  if (error) throw new Error(error.message);
  revalidatePath("/calls");
}

export async function convertCallToCandidate(callId: string) {
  await requireUser();
  const sb = await createClient();

  const { data: call, error: getErr } = await sb
    .from("inbound_calls")
    .select("*")
    .eq("id", callId)
    .single();
  if (getErr) throw new Error(getErr.message);
  if (call.converted_candidate_id) {
    redirect(`/candidates/${call.converted_candidate_id}`);
  }

  const { data: cand, error: candErr } = await sb
    .from("candidates")
    .insert({
      full_name:    call.caller_name,
      email:        call.caller_email,
      phone:        call.caller_phone,
      applied_for:  call.position_of_interest,
      source:       "Inbound Call",
      status:       "applied" satisfies CandidateStatus,
      criteria:     DEFAULT_CRITERIA,
      score:        weightedScore(DEFAULT_CRITERIA),
      notes:        call.notes,
    })
    .select("id")
    .single();
  if (candErr) throw new Error(candErr.message);

  // Same origin event for the other route into the pipeline, so a converted
  // caller's change log does not start blank either.
  await logActivity({
    subjectId: cand.id,
    action: "created",
    summary: `Created from an inbound call${call.caller_phone ? ` (${call.caller_phone})` : ""}`,
    field: "source",
    newValue: "Inbound Call",
    meta: { inbound_call_id: callId },
  });

  const { error: updErr } = await sb
    .from("inbound_calls")
    .update({
      follow_up_status: "converted",
      converted_candidate_id: cand.id,
    })
    .eq("id", callId);
  if (updErr) throw new Error(updErr.message);

  revalidatePath("/calls");
  revalidatePath("/candidates");
  redirect(`/candidates/${cand.id}`);
}
