"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth.server";
import { sendMentionEmail } from "@/lib/notifications.server";
import { isOnboardingComplete } from "@/lib/onboarding";
import type {
  LanguagePref,
  OnboardingCategory,
  OnboardingStatus,
  PeopleaseFormStatus,
} from "@/lib/supabase/types";

const LANGUAGE_PREFS: LanguagePref[] = ["en", "es"];

// Document-language preference on the employee record (task 86e20w8yz).
export async function setEmployeeLanguagePref(
  employeeId: string,
  next: LanguagePref,
) {
  if (!LANGUAGE_PREFS.includes(next)) throw new Error(`Invalid language: ${next}`);
  const supabase = await createClient();
  const { error } = await supabase
    .from("employees")
    .update({ language_pref: next })
    .eq("id", employeeId);
  if (error) throw new Error(error.message);
  revalidatePath(`/onboarding/${employeeId}`);
  revalidatePath(`/employees/${employeeId}`);
}

const STATUS_VALUES: OnboardingStatus[] = ["not_started", "in_progress", "done", "na"];

const PEOPLEASE_FORM_STATUS_VALUES: PeopleaseFormStatus[] = [
  "pending",
  "in_progress",
  "complete",
  "na",
];

// PEOPLEASE forms tracker — set a single form's completion status (task 86e20w8v9).
export async function setPeopleaseFormStatus(
  formId: string,
  employeeId: string,
  status: PeopleaseFormStatus,
) {
  if (!PEOPLEASE_FORM_STATUS_VALUES.includes(status)) {
    throw new Error(`Invalid form status: ${status}`);
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("employee_peoplease_forms")
    .update({
      status,
      completed_on: status === "complete" ? new Date().toISOString().slice(0, 10) : null,
    })
    .eq("id", formId);
  if (error) throw new Error(error.message);

  revalidatePath(`/onboarding/${employeeId}`);
  revalidatePath("/onboarding");
}

export async function setItemStatus(
  itemId: string,
  employeeId: string,
  status: OnboardingStatus,
) {
  if (!STATUS_VALUES.includes(status)) throw new Error(`Invalid status: ${status}`);
  const supabase = await createClient();
  const { error } = await supabase
    .from("onboarding_checklist_items")
    .update({
      status,
      done_on: status === "done" ? new Date().toISOString().slice(0, 10) : null,
    })
    .eq("id", itemId);
  if (error) throw new Error(error.message);

  revalidatePath(`/onboarding/${employeeId}`);
  revalidatePath("/onboarding");
  revalidatePath(`/employees/${employeeId}`);
  await maybePromoteToActive(employeeId);
}

// Team tagging (Phase-1 #5) — @mention + notify a teammate inside a specific
// onboarding task. Writes an in-app notification for the teammate and records
// the mention against the item so it shows inline as a thread.
export async function mentionTeammateOnItem(
  employeeId: string,
  itemId: string,
  formData: FormData,
) {
  const teamMemberId = ((formData.get("team_member_id") as string) || "").trim();
  const message = ((formData.get("message") as string) || "").trim();
  if (!teamMemberId) throw new Error("Pick a teammate to tag");
  if (!message) throw new Error("Add a message for the teammate");

  const supabase = await createClient();
  const [tmRes, itemRes, me] = await Promise.all([
    supabase.from("team_members").select("full_name, email").eq("id", teamMemberId).maybeSingle(),
    supabase.from("onboarding_checklist_items").select("label").eq("id", itemId).maybeSingle(),
    getCurrentUser(),
  ]);
  const teammate = tmRes.data as { full_name: string; email: string | null } | null;
  const teammateName = teammate?.full_name;
  if (!teammateName) throw new Error("Teammate not found");
  const teammateEmail = teammate?.email ?? null;
  const itemLabel = (itemRes.data as { label: string } | null)?.label ?? "an onboarding task";
  const actor = me?.profile.full_name ?? me?.email ?? "A teammate";
  const linkPath = `/onboarding/${employeeId}`;

  const { error } = await supabase.from("notifications").insert({
    recipient_team_member_id: teamMemberId,
    recipient_name: teammateName,
    recipient_email: teammateEmail,
    actor_name: actor,
    kind: "mention",
    body: message,
    entity_type: "onboarding_checklist_item",
    entity_id: itemId,
    link_path: linkPath,
    meta: { task: itemLabel },
  });
  if (error) throw new Error(error.message);

  // Real email alert via Resend. Fail-safe: skips if the teammate has no email
  // on file or RESEND_API_KEY is unset, and never throws — the in-app
  // notification above is the source of truth regardless of email outcome.
  await sendMentionEmail({
    toEmail: teammateEmail,
    toName: teammateName,
    actorName: actor,
    message,
    taskLabel: itemLabel,
    linkPath,
  });

  revalidatePath(`/onboarding/${employeeId}`);
}

export async function setItemNotes(
  itemId: string,
  employeeId: string,
  notes: string,
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("onboarding_checklist_items")
    .update({ notes: notes || null })
    .eq("id", itemId);
  if (error) throw new Error(error.message);
  revalidatePath(`/onboarding/${employeeId}`);
}

export async function toggleDocument(docId: string, employeeId: string) {
  const supabase = await createClient();
  const { data: row, error: getErr } = await supabase
    .from("onboarding_documents")
    .select("received")
    .eq("id", docId)
    .single();
  if (getErr) throw new Error(getErr.message);

  const next = !row.received;
  const { error } = await supabase
    .from("onboarding_documents")
    .update({ received: next, received_on: next ? new Date().toISOString().slice(0, 10) : null })
    .eq("id", docId);
  if (error) throw new Error(error.message);

  revalidatePath(`/onboarding/${employeeId}`);
  revalidatePath(`/employees/${employeeId}`);
}

export async function addChecklistItem(employeeId: string, formData: FormData) {
  const supabase = await createClient();
  const key = (formData.get("key") as string)?.trim() || `custom-${Date.now()}`;
  const label = (formData.get("label") as string)?.trim();
  const detail = (formData.get("detail") as string)?.trim() || null;
  const category = (formData.get("category") as OnboardingCategory) || "Documentation";
  if (!label) return;

  const { error } = await supabase.from("onboarding_checklist_items").insert({
    employee_id: employeeId,
    key,
    label,
    detail,
    category,
    status: "not_started",
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/onboarding/${employeeId}`);
}

export async function addDocument(employeeId: string, formData: FormData) {
  const supabase = await createClient();
  const name = (formData.get("name") as string)?.trim();
  if (!name) return;
  const { error } = await supabase.from("onboarding_documents").insert({
    employee_id: employeeId,
    name,
    received: false,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/onboarding/${employeeId}`);
}

export async function saveWelcomeLetter(employeeId: string, body: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("welcome_letter_drafts")
    .upsert({ employee_id: employeeId, body }, { onConflict: "employee_id" });
  if (error) throw new Error(error.message);
  revalidatePath(`/onboarding/${employeeId}`);
}

export async function markWelcomeLetterSent(employeeId: string) {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error: letterErr } = await supabase
    .from("welcome_letter_drafts")
    .update({ sent_at: now })
    .eq("employee_id", employeeId);
  if (letterErr) throw new Error(letterErr.message);

  // Flip the welcome_email checklist item to Done
  const { error: itemErr } = await supabase
    .from("onboarding_checklist_items")
    .update({ status: "done", done_on: now.slice(0, 10) })
    .eq("employee_id", employeeId)
    .eq("key", "welcome_email");
  if (itemErr) throw new Error(itemErr.message);

  revalidatePath(`/onboarding/${employeeId}`);
  revalidatePath("/onboarding");
  await maybePromoteToActive(employeeId);
}

// Manual Active toggle (Phase-1 #1). Decouples the Active flag from onboarding
// completion: an operator can mark a new hire Active while their checklist is
// still in progress, instead of being locked on "Onboarding" until every step
// is done. The hire stays on the onboarding tracker as long as steps remain
// incomplete (see listOnboardingSummaries), so progress is still trackable.
export async function setEmployeeOnboardingStatus(
  employeeId: string,
  target: "active" | "onboarding",
) {
  if (target !== "active" && target !== "onboarding") {
    throw new Error(`Invalid status: ${target}`);
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("employees")
    .update({ status: target })
    .eq("id", employeeId);
  if (error) throw new Error(error.message);
  revalidatePath(`/onboarding/${employeeId}`);
  revalidatePath("/onboarding");
  revalidatePath("/roster");
  revalidatePath("/dashboard");
  revalidatePath(`/employees/${employeeId}`);
}

export async function maybePromoteToActive(employeeId: string) {
  const supabase = await createClient();
  const [emp, items] = await Promise.all([
    supabase.from("employees").select("status").eq("id", employeeId).single(),
    supabase.from("onboarding_checklist_items").select("status").eq("employee_id", employeeId),
  ]);
  if (emp.error) return;
  if (emp.data.status !== "onboarding") return;

  const rows = (items.data ?? []) as { status: OnboardingStatus }[];
  if (!isOnboardingComplete(rows)) return;

  await supabase.from("employees").update({ status: "active" }).eq("id", employeeId);
  revalidatePath("/roster");
  revalidatePath("/dashboard");
  revalidatePath(`/employees/${employeeId}`);
}
