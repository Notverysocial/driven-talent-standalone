// Shared helpers for the threaded notes log (migration 0038). Pure — no server
// imports — so both the client editor and the server action can parse mentions.

import type { CallOutcome, NoteMention } from "./supabase/types";

// ---------------------------------------------------------------------------
// Phone-screen outcomes (migration 0050).
//
// These live HERE, not in notes.actions.ts, because that file is "use server"
// and a "use server" module may only export async functions — exporting a
// plain object from it type-checks and BUILDS fine, then throws at request
// time ("A use server file can only export async functions, found object").
// Keep constants out of the actions file.
//
// Single source shared by the composer, the log renderer, and the server
// action, so the labels cannot drift apart. Must stay in step with the
// candidate_notes_call_outcome_check constraint in migration 0050.
// ---------------------------------------------------------------------------

export const CALL_OUTCOMES: { id: CallOutcome; label: string }[] = [
  { id: "reached",      label: "Reached" },
  { id: "no_answer",    label: "No answer" },
  { id: "left_message", label: "Left message" },
  { id: "declined",     label: "Declined" },
];

export const CALL_OUTCOME_IDS: readonly string[] = CALL_OUTCOMES.map((o) => o.id);

export function isCallOutcome(v: string | null | undefined): v is CallOutcome {
  return !!v && CALL_OUTCOME_IDS.includes(v);
}

/** Body used when a recruiter logs a call without typing anything. */
export const OUTCOME_BODY: Record<CallOutcome, string> = {
  reached:      "Phone screen: reached the applicant.",
  no_answer:    "Phone screen: no answer.",
  left_message: "Phone screen: left a message.",
  declined:     "Phone screen: applicant declined.",
};

export function outcomeLabel(o: CallOutcome): string {
  return CALL_OUTCOMES.find((x) => x.id === o)?.label ?? o;
}

/**
 * Merge a candidate's own notes with the ones written while they were still an
 * applicant, newest first, marking the carried-over entries.
 *
 * Pure and separated from the DB read so the ordering + labelling — the part
 * that decides what a recruiter actually sees after promotion — is covered by
 * the required CI gate rather than only by a manual click-through.
 */
export function mergeNoteHistory<T extends { created_at: string }>(
  candidateNotes: T[],
  applicantNotes: T[],
): (T & { from_applicant_stage: boolean })[] {
  return [
    ...candidateNotes.map((n) => ({ ...n, from_applicant_stage: false })),
    ...applicantNotes.map((n) => ({ ...n, from_applicant_stage: true })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// Extract @mentions from a note body. Matches "@Name" and "@First Last" (a
// single optional capitalized second word), case-insensitive on the token.
// Returns de-duplicated {name} objects; the server action resolves each name
// against the recruiters roster / team_members to attach a team_member_id.
export function parseMentions(body: string): NoteMention[] {
  const out: NoteMention[] = [];
  const seen = new Set<string>();
  // @ followed by a word, optionally a second word (e.g. "@Maria Lopez").
  const re = /@([A-Za-z][\w'-]*(?:\s+[A-Z][\w'-]*)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const name = m[1].trim();
    const key = name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ name });
    }
  }
  return out;
}
