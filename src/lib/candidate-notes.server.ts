import "server-only";
import { createClient } from "./supabase/server";
import { mergeNoteHistory } from "./notes";
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

/**
 * A candidate's notes INCLUDING everything written while they were still an
 * applicant.
 *
 * WHY READ-THROUGH RATHER THAN MOVING THE ROWS ON PROMOTION.
 *
 * Notes are keyed (subject_type, subject_id), and promotion mints a new
 * candidate id — so the naive options are to re-point the rows during
 * promoteIntakeToCandidate(), or to read both keys here. We read.
 *
 *   1. promoteIntakeToCandidate() ALREADY has a partial-failure path: it can
 *      create the candidate and then fail to mark the intake promoted (it
 *      returns ok:false saying exactly that). Adding a note-migration step
 *      would open a SECOND window in the same action where notes could be
 *      orphaned or lost. Losing notes on promotion is the one outcome that is
 *      worse than not shipping this feature at all.
 *   2. Nothing is mutated, so this cannot fail destructively and needs no
 *      backfill for applicants promoted before this shipped — their notes
 *      appear the moment the code deploys.
 *   3. Provenance is preserved: a note written at the applicant stage stays
 *      marked as one, instead of being retconned into a candidate note.
 *
 * The lineage link is durable because application_intakes rows SURVIVE
 * promotion (status='promoted', promoted_candidate_id set) rather than being
 * deleted — verified in promoteIntakeToCandidate().
 *
 * Returns one merged list, newest-first, with `from_applicant_stage` marking
 * the carried-over entries so the UI can label them.
 */
export async function listNotesForCandidateWithApplicantHistory(
  candidateId: string,
): Promise<(CandidateNote & { from_applicant_stage: boolean })[]> {
  const supabase = await createClient();

  const [own, intake] = await Promise.all([
    listNotes("candidate", candidateId),
    supabase
      .from("application_intakes")
      .select("id")
      .eq("promoted_candidate_id", candidateId)
      .maybeSingle(),
  ]);

  let applicantNotes: CandidateNote[] = [];
  const intakeId = (intake.data as { id: string } | null)?.id ?? null;
  if (intakeId) {
    // Tolerant: if this read fails the candidate's own notes still render.
    // Silently dropping the applicant history would be worse than an empty
    // one, so the failure is logged rather than swallowed outright.
    try {
      applicantNotes = await listNotes("applicant", intakeId);
    } catch (err) {
      console.error(
        `[notes] candidate ${candidateId}: failed to load applicant-stage notes from intake ${intakeId}`,
        err,
      );
    }
  }

  // Ordering + labelling live in a pure helper so they are covered by the
  // required CI gate, not only by a manual click-through.
  return mergeNoteHistory(own, applicantNotes);
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
