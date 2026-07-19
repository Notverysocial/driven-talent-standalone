// Multi-round interview history (runbook Phase C, migration 0045).
//
// PURE — no server imports — so the merge/dedupe rules are unit-tested in the
// required CI gate. The DB read lives in interviews.server.ts.
//
// THE CALENDLY INTERACTION (the trap this module exists to solve):
// Phase A's Calendly write-back (live since 2026-07-19) writes
// `candidates.interview_scheduled` + `candidates.interview_at` — NOT rows in the
// new `interviews` table. If the Interview tab read only from `interviews`, a
// real Calendly booking would silently stop appearing, breaking a feature that
// shipped hours earlier.
//
// Resolution: the tab reads BOTH and merges, with an explicit dedupe rule. We do
// NOT modify the Phase A write path — it is live, guarded, and proven, and
// changing it would require deciding round-assignment semantics nobody has
// decided (does a reschedule open a new round? does a cancel delete one?).
//
// Dedupe rule:
//   * `interviews` rows are the history and always render.
//   * The candidate-row scheduling fields render as ONE extra "live" entry only
//     when they are not already represented in the table.
//   * "Already represented" = a table row has the same scheduled_at instant, OR
//     the live entry carries no timestamp to distinguish it while table rows
//     exist (that data is exactly what the 0045 backfill turned into round 1,
//     so showing it again would duplicate round 1).
//
// Net effect: with no table (pre-migration) behaviour is byte-identical to
// today; after migration the history renders; and a fresh Calendly booking
// always surfaces as the current entry.

export type InterviewRow = {
  id: string;
  candidate_id: string;
  round: number;
  scheduled_at: string | null;
  showed_up: boolean | null;
  no_show_reason: string | null;
  notes: string | null;
  outcome: string | null;
  strong_candidate: "yes" | "no" | "maybe" | null;
  other_positions_fit: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

// The flat interview columns still living on `candidates` (migration 0038).
export type CandidateInterviewFields = {
  interview_scheduled: boolean | null;
  interview_at: string | null;
  showed_up: boolean | null;
  no_show_reason: string | null;
  interview_notes: string | null;
  strong_candidate: "yes" | "no" | "maybe" | null;
  other_positions_fit: string | null;
};

// One rendered entry in the tab.
export type InterviewRound = {
  key: string;
  round: number | null; // null = the live candidate-row entry (no round yet)
  scheduledAt: string | null;
  scheduled: boolean | null;
  showedUp: boolean | null;
  noShowReason: string | null;
  notes: string | null;
  outcome: string | null;
  strongCandidate: "yes" | "no" | "maybe" | null;
  otherPositionsFit: string | null;
  source: "table" | "live";
};

function ms(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

function nonEmpty(s: string | null | undefined): boolean {
  return (s ?? "").trim() !== "";
}

/** True when the candidate row carries any interview data at all. */
export function candidateHasInterviewData(c: CandidateInterviewFields): boolean {
  return (
    c.interview_scheduled != null ||
    c.interview_at != null ||
    c.showed_up != null ||
    nonEmpty(c.no_show_reason) ||
    nonEmpty(c.interview_notes) ||
    c.strong_candidate != null ||
    nonEmpty(c.other_positions_fit)
  );
}

/**
 * Merge stored interview rounds with the candidate-row scheduling fields.
 * Newest first: the live entry (if any), then rounds by round desc, then
 * scheduled_at desc. Returns [] when there is nothing at all, which is what
 * drives the tab's "No interview recorded yet" empty state.
 */
export function mergeInterviewRounds(
  rows: InterviewRow[],
  cand: CandidateInterviewFields,
): InterviewRound[] {
  const fromTable: InterviewRound[] = rows.map((r) => ({
    key: r.id,
    round: r.round,
    scheduledAt: r.scheduled_at,
    // The table has no separate "scheduled?" flag; a date implies scheduled.
    scheduled: r.scheduled_at ? true : null,
    showedUp: r.showed_up,
    noShowReason: r.no_show_reason,
    notes: r.notes,
    outcome: r.outcome,
    strongCandidate: r.strong_candidate,
    otherPositionsFit: r.other_positions_fit,
    source: "table",
  }));

  fromTable.sort((a, b) => {
    const byRound = (b.round ?? 0) - (a.round ?? 0);
    if (byRound !== 0) return byRound;
    return (ms(b.scheduledAt) ?? 0) - (ms(a.scheduledAt) ?? 0);
  });

  if (!candidateHasInterviewData(cand)) return fromTable;

  const liveAt = ms(cand.interview_at);
  const alreadyShown =
    liveAt != null
      ? fromTable.some((r) => ms(r.scheduledAt) === liveAt)
      : // No timestamp to distinguish it: if history exists, this data is what
        // the backfill already turned into round 1.
        fromTable.length > 0;

  if (alreadyShown) return fromTable;

  const live: InterviewRound = {
    key: "live",
    round: null,
    scheduledAt: cand.interview_at,
    scheduled: cand.interview_scheduled,
    showedUp: cand.showed_up,
    noShowReason: cand.no_show_reason,
    notes: cand.interview_notes,
    outcome: null,
    strongCandidate: cand.strong_candidate,
    otherPositionsFit: cand.other_positions_fit,
    source: "live",
  };
  return [live, ...fromTable];
}
