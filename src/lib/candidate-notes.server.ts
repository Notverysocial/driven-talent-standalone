import "server-only";
import { createClient } from "./supabase/server";
import type { CandidateNote, NoteSubjectType } from "./supabase/types";

// Chronological notes log for a subject, NEWEST FIRST (Estefany's spec).
export async function listNotes(
  subjectType: NoteSubjectType,
  subjectId: string,
): Promise<CandidateNote[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("candidate_notes")
    .select("*")
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CandidateNote[];
}

// Open follow-ups assigned to a given name (their queue). Newest first.
export async function listOpenFollowupsFor(
  assignee: string,
): Promise<CandidateNote[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("candidate_notes")
    .select("*")
    .eq("followup_required", true)
    .eq("followup_status", "in_review")
    .ilike("followup_assignee", assignee)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CandidateNote[];
}
