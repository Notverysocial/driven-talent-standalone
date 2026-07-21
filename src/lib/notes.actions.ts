"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "./supabase/server";
import { getCurrentUser } from "./auth.server";
import { isCallOutcome, OUTCOME_BODY, outcomeLabel } from "./notes";
import { parseMentions } from "./notes";
import { logActivity } from "./activity-log.server";
import type { NoteSubjectType, NoteMention } from "./supabase/types";

// NOTE: this file is "use server" — it may ONLY export async functions.
// Outcome constants live in ./notes (pure, client-safe). Exporting a plain
// object from here builds successfully and then fails at REQUEST time.

function linkPathFor(subjectType: NoteSubjectType, subjectId: string): string {
  switch (subjectType) {
    case "applicant":  return `/applications/${subjectId}`;
    case "candidate":  return `/candidates/${subjectId}`;
    case "onboarding": return `/onboarding/${subjectId}`;
    case "employee":   return `/employees/${subjectId}`;
  }
}

// Resolve each parsed @mention against team_members (then recruiters) so we can
// attach a team_member_id where one exists. Best-effort; unmatched names still
// notify by name only (notifications.recipient_team_member_id is nullable).
async function resolveMentions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  mentions: NoteMention[],
): Promise<NoteMention[]> {
  if (mentions.length === 0) return [];
  const resolved: NoteMention[] = [];
  for (const mention of mentions) {
    const { data } = await supabase
      .from("team_members")
      .select("id, full_name")
      .ilike("full_name", `%${mention.name}%`)
      .limit(1)
      .maybeSingle();
    resolved.push({ name: mention.name, team_member_id: data?.id ?? null });
  }
  return resolved;
}

/**
 * Add a note to the shared log. Author + created_at are ALWAYS stamped
 * server-side (never manual). @mentions are parsed, resolved, and notified;
 * a follow-up (followup_required) sets an assignee + an "in_review" status
 * and notifies the assignee. Reused across candidate / onboarding / employee.
 */
export async function addNote(
  subjectType: NoteSubjectType,
  subjectId: string,
  formData: FormData,
): Promise<void> {
  // A phone screen carries a REQUIRED outcome; an ordinary note must carry
  // none. Both shapes are also enforced by a CHECK constraint (0050) so a bad
  // pair fails loudly at the database rather than being stored half-formed.
  const rawOutcome = (formData.get("call_outcome") as string | null)?.trim() || null;
  const isPhoneScreen = isCallOutcome(rawOutcome);
  const callOutcome = isPhoneScreen ? rawOutcome : null;
  const nextStep = (formData.get("next_step") as string | null)?.trim() || null;

  const rawBody = (formData.get("body") as string | null)?.trim();
  // A phone screen is worth recording even with no free-text written: WHO
  // called, WHEN, and WHAT HAPPENED is already the substance. Requiring prose
  // would push recruiters to skip logging the call at all, which is the
  // behaviour this feature exists to stop.
  const body = rawBody || (isPhoneScreen ? OUTCOME_BODY[callOutcome!] : "");
  if (!body) return;

  const followupRequired = formData.get("followup_required") === "on";
  const followupAssignee =
    (formData.get("followup_assignee") as string | null)?.trim() || null;

  const supabase = await createClient();
  const me = await getCurrentUser();
  const authorName = me?.profile.full_name ?? "Unknown";
  // author_id column is a soft (non-FK) uuid; store the profile id (may be the
  // synthetic-owner nil uuid when AUTH_ENABLED is off — that's fine, no FK).
  const authorId = me?.id ?? null;

  const mentions = await resolveMentions(supabase, parseMentions(body));

  const { error } = await supabase.from("candidate_notes").insert({
    subject_type: subjectType,
    subject_id: subjectId,
    author_id: authorId,
    author_name: authorName,
    body,
    mentions,
    followup_required: followupRequired,
    followup_assignee: followupRequired ? followupAssignee : null,
    followup_status: followupRequired ? "in_review" : null,
    note_kind: isPhoneScreen ? "phone_screen" : "note",
    call_outcome: callOutcome,
    next_step: isPhoneScreen ? nextStep : null,
  });
  if (error) throw new Error(error.message);

  // Fan out in-app notifications for each @mention (no email/SMS transport).
  const link = linkPathFor(subjectType, subjectId);
  const notify: {
    recipient_team_member_id: string | null;
    recipient_name: string;
    actor_name: string;
    kind: string;
    body: string;
    entity_type: string;
    entity_id: string;
    link_path: string;
  }[] = mentions.map((m) => ({
    recipient_team_member_id: m.team_member_id ?? null,
    recipient_name: m.name,
    actor_name: authorName,
    kind: "mention",
    body: `${authorName} mentioned you in a note: ${body.slice(0, 140)}`,
    entity_type: subjectType,
    entity_id: subjectId,
    link_path: link,
  }));

  // Also notify the follow-up assignee (if not already mentioned).
  if (followupRequired && followupAssignee) {
    const already = mentions.some(
      (m) => m.name.toLowerCase() === followupAssignee.toLowerCase(),
    );
    if (!already) {
      notify.push({
        recipient_team_member_id: null,
        recipient_name: followupAssignee,
        actor_name: authorName,
        kind: "mention",
        body: `${authorName} assigned you a follow-up: ${body.slice(0, 140)}`,
        entity_type: subjectType,
        entity_id: subjectId,
        link_path: link,
      });
    }
  }

  if (notify.length > 0) {
    // Non-fatal: a failed notification insert must not lose the note itself.
    await supabase.from("notifications").insert(notify);
  }

  // Change log — record that a note was added (the note body itself lives in the
  // notes log; this keeps the single activity timeline complete).
  await logActivity({
    subjectType,
    subjectId,
    action: isPhoneScreen
      ? "phone_screen_logged"
      : followupRequired
        ? "note_added_followup"
        : "note_added",
    summary: isPhoneScreen
      ? `Logged a phone screen — ${outcomeLabel(callOutcome!)}${nextStep ? ` · next: ${nextStep}` : ""}`
      : followupRequired
        ? `Added a note with a follow-up${followupAssignee ? ` for ${followupAssignee}` : ""}`
        : "Added a note",
  });

  revalidatePath(link);
  // An applicant note is also rendered on the candidate page once the applicant
  // is promoted (read-through by lineage), so refresh that view too.
  if (subjectType === "applicant") revalidatePath("/candidates", "layout");
}

// Flip a follow-up between In Review and Resolved.
export async function setFollowupStatus(
  noteId: string,
  status: "in_review" | "resolved",
  subjectType: NoteSubjectType,
  subjectId: string,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("candidate_notes")
    .update({ followup_status: status })
    .eq("id", noteId);
  if (error) throw new Error(error.message);
  revalidatePath(linkPathFor(subjectType, subjectId));
}
