"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "./supabase/server";
import { getCurrentUser } from "./auth.server";
import { parseMentions } from "./notes";
import type { NoteSubjectType, NoteMention } from "./supabase/types";

function linkPathFor(subjectType: NoteSubjectType, subjectId: string): string {
  switch (subjectType) {
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
  const body = (formData.get("body") as string | null)?.trim();
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

  revalidatePath(link);
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
