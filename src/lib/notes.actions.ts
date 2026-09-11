"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "./supabase/server";
import {
  MAX_ATTACHMENTS_PER_NOTE,
  NOTE_ATTACHMENT_BUCKET,
  buildAttachmentPath,
  checkAttachments,
  isObjectInFolder,
  isUuid,
  noteFolder,
  parseAttachmentManifest,
  resolveMime,
  type AttachmentLike,
  type UploadTicket,
} from "./note-attachments";
import { getCurrentUser, requireUser } from "./auth.server";
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
// Returns a result rather than throwing for the failures a recruiter can act on
// (a bad file, a failed upload). Next REDACTS the message of an error thrown
// from a Server Action in production builds, so a thrown "file too large"
// would reach the browser as a generic "an error occurred" — unhelpful exactly
// when someone is trying to attach an ID document. Genuine faults still throw.
export async function addNote(
  subjectType: NoteSubjectType,
  subjectId: string,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
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
  // Attachments arrive as a MANIFEST, never as bytes: the browser has already
  // put each file into storage on a signed upload URL minted by
  // prepareNoteAttachmentUploads below. See the DIRECT-TO-STORAGE note in
  // lib/note-attachments for why (Vercel's 4.5 MB request cap).
  const claimedNoteId = ((formData.get("note_id") as string | null) ?? "").trim();
  const manifest = parseAttachmentManifest(
    formData.get("attachments_manifest"),
    subjectType,
    subjectId,
    claimedNoteId,
  );
  if (!manifest.ok) return { ok: false, error: manifest.error };
  const claimed = manifest.files;

  // A note that is only an attachment is still worth keeping — the file is the
  // substance. Without this fallback it would hit the empty-body early return
  // below and vanish without a word.
  const body =
    rawBody ||
    (isPhoneScreen
      ? OUTCOME_BODY[callOutcome!]
      : claimed.length > 0
        ? `Attached ${claimed.length === 1 ? "a file" : `${claimed.length} files`}`
        : "");
  if (!body) return { ok: false, error: "Write a note, log a call, or attach a file." };

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

  // VERIFY, then write rows. Each claimed object must exist in THIS note's
  // folder and must not already belong to a note; its size and type are read
  // from storage, not taken from the browser. Then:
  //   * any check fails       -> the claimed objects are removed, NOTHING saved
  //   * the note insert fails -> the objects are removed
  // Storage work uses the service role: the bucket is private with no client
  // policies at all (migration 0052), so there is no other path to the bytes.
  const noteId = claimed.length > 0 ? claimedNoteId : crypto.randomUUID();
  const admin = claimed.length > 0 ? createServiceClient() : null;
  const uploaded: { id: string; path: string; name: string; size: number; mime: string }[] = [];
  const removeUploaded = async () => {
    if (admin && claimed.length > 0) {
      await admin.storage.from(NOTE_ATTACHMENT_BUCKET).remove(claimed.map((c) => c.path));
    }
  };
  if (admin) {
    const [noteTaken, pathTaken] = await Promise.all([
      admin.from("candidate_notes").select("id", { count: "exact", head: true }).eq("id", noteId),
      admin
        .from("note_attachments")
        .select("id", { count: "exact", head: true })
        .in("storage_path", claimed.map((c) => c.path)),
    ]);
    if (noteTaken.error || pathTaken.error) {
      return { ok: false, error: "Couldn't check the attachments. Nothing was saved — please try again." };
    }
    if ((noteTaken.count ?? 0) > 0 || (pathTaken.count ?? 0) > 0) {
      // These objects belong to a note that already exists. Never remove them.
      return { ok: false, error: "That upload was already used. Nothing was saved — please attach the files again." };
    }
    for (const c of claimed) {
      const { data: info, error: infoErr } = await admin.storage
        .from(NOTE_ATTACHMENT_BUCKET)
        .info(c.path);
      if (infoErr || !info || typeof info.size !== "number") {
        await removeUploaded();
        return { ok: false, error: `"${c.name}" didn't finish uploading. Nothing was saved — please try again.` };
      }
      uploaded.push({
        id: c.id,
        path: c.path,
        name: c.name,
        size: info.size,
        mime: resolveMime(c.name, info.contentType ?? ""),
      });
    }
    const recheck = checkAttachments(uploaded.map((u) => ({ name: u.name, size: u.size, type: u.mime })));
    if (!recheck.ok || recheck.files.length !== uploaded.length) {
      await removeUploaded();
      return { ok: false, error: recheck.ok ? "An attached file was empty. Nothing was saved." : recheck.error };
    }
  }

  const { error } = await supabase.from("candidate_notes").insert({
    id: noteId,
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
  if (error) {
    await removeUploaded();
    throw new Error(error.message);
  }

  if (uploaded.length > 0) {
    const { error: attErr } = await admin!.from("note_attachments").insert(
      uploaded.map((u) => ({
        id: u.id,
        note_id: noteId,
        bucket: NOTE_ATTACHMENT_BUCKET,
        storage_path: u.path,
        file_name: u.name,
        mime_type: u.mime || null,
        size_bytes: u.size,
        uploaded_by_id: authorId,
        uploaded_by_name: authorName,
      })),
    );
    if (attErr) {
      // The note is saved; its files are not linked to it. Remove the objects
      // so nothing unreferenced sits in the bucket, and say so plainly.
      await removeUploaded();
      return {
        ok: false,
        error: `The note was saved, but its attachments couldn't be recorded (${attErr.message}). Please attach them again.`,
      };
    }
  }

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
  if (subjectType === "applicant") {
    revalidatePath("/candidates", "layout");
    // The /applications list shows each applicant's notes on its card.
    revalidatePath("/applications");
  }
  return { ok: true };
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

const SUBJECT_TYPES: readonly NoteSubjectType[] = ["applicant", "candidate", "onboarding", "employee"];
const SUBJECT_ID = /^[A-Za-z0-9-]{1,64}$/;

/**
 * Step 1 of attaching files to a note: mint one signed upload URL per file so
 * the BROWSER can put the bytes straight into the private bucket. The Server
 * Action never carries file bytes (Vercel refuses request bodies over ~4.5 MB
 * — see lib/note-attachments). Nothing is written to the database here; the
 * note and its attachment rows are created by addNote, which re-verifies
 * every object in storage before trusting it.
 */
export async function prepareNoteAttachmentUploads(
  subjectType: NoteSubjectType,
  subjectId: string,
  files: AttachmentLike[],
): Promise<{ ok: true; noteId: string; tickets: UploadTicket[] } | { ok: false; error: string }> {
  await requireUser();
  if (!SUBJECT_TYPES.includes(subjectType) || !SUBJECT_ID.test(subjectId)) {
    return { ok: false, error: "Couldn't prepare the upload." };
  }
  const check = checkAttachments(
    (Array.isArray(files) ? files : []).map((f) => ({
      name: String(f?.name ?? ""),
      size: Number(f?.size ?? 0),
      type: String(f?.type ?? ""),
    })),
  );
  if (!check.ok) return check;
  if (check.files.length === 0) return { ok: false, error: "No files to upload." };
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, error: "File uploads aren't available right now." };
  }

  const admin = createServiceClient();
  const noteId = crypto.randomUUID();
  const tickets: UploadTicket[] = [];
  for (const f of check.files) {
    const id = crypto.randomUUID();
    const path = buildAttachmentPath(subjectType, subjectId, noteId, id, f.name);
    const { data, error } = await admin.storage
      .from(NOTE_ATTACHMENT_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data?.token) {
      return { ok: false, error: `Couldn't prepare the upload for "${f.name}". Please try again.` };
    }
    tickets.push({ id, path, token: data.token });
  }
  return { ok: true, noteId, tickets };
}

/**
 * Remove objects the browser uploaded for a note that was then never saved
 * (a later file failed, or the save itself failed in transit). Only touches
 * objects directly inside that note's folder, and only while no note with that
 * id exists — a saved note's files are never removable through here.
 */
export async function discardNoteAttachmentUploads(
  subjectType: NoteSubjectType,
  subjectId: string,
  noteId: string,
  paths: string[],
): Promise<void> {
  await requireUser();
  if (!isUuid(noteId) || !Array.isArray(paths) || paths.length > MAX_ATTACHMENTS_PER_NOTE) return;
  const folder = noteFolder(subjectType, subjectId, noteId);
  const mine = paths.filter((p) => isObjectInFolder(p, folder));
  if (mine.length === 0 || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const admin = createServiceClient();
  const { count, error } = await admin
    .from("candidate_notes")
    .select("id", { count: "exact", head: true })
    .eq("id", noteId);
  if (error || (count ?? 0) > 0) return;
  await admin.storage.from(NOTE_ATTACHMENT_BUCKET).remove(mine);
}
