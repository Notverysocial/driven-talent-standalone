import { test, expect } from "@playwright/test";
import {
  mergeInterviewRounds,
  candidateHasInterviewData,
  type InterviewRow,
  type CandidateInterviewFields,
} from "../../src/lib/interviews";

// Guards for the multi-round merge (runbook Phase C) — and specifically for the
// Calendly trap: Phase A writes candidates.interview_at, NOT an interviews row,
// so a live booking must never silently disappear once the tab reads the table.

const EMPTY_CAND: CandidateInterviewFields = {
  interview_scheduled: null,
  interview_at: null,
  showed_up: null,
  no_show_reason: null,
  interview_notes: null,
  strong_candidate: null,
  other_positions_fit: null,
};

function row(over: Partial<InterviewRow> & { id: string; round: number }): InterviewRow {
  return {
    candidate_id: "c1",
    scheduled_at: null,
    showed_up: null,
    no_show_reason: null,
    notes: null,
    outcome: null,
    strong_candidate: null,
    other_positions_fit: null,
    created_by: "test",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...over,
  };
}

test("nothing anywhere -> empty (drives the proven empty state)", () => {
  expect(mergeInterviewRounds([], EMPTY_CAND)).toEqual([]);
});

test("no table rows (migration not applied) -> falls back to the candidate columns", () => {
  const cand = { ...EMPTY_CAND, interview_at: "2026-08-01T15:00:00.000Z", interview_scheduled: true };
  const out = mergeInterviewRounds([], cand);
  expect(out).toHaveLength(1);
  expect(out[0].source).toBe("live");
  expect(out[0].scheduledAt).toBe("2026-08-01T15:00:00.000Z");
});

test("rounds render newest (highest round) first", () => {
  const out = mergeInterviewRounds(
    [row({ id: "a", round: 1 }), row({ id: "c", round: 3 }), row({ id: "b", round: 2 })],
    EMPTY_CAND,
  );
  expect(out.map((r) => r.round)).toEqual([3, 2, 1]);
});

test("THE TRAP: a live Calendly booking not yet in the table still surfaces, first", () => {
  const cand = {
    ...EMPTY_CAND,
    interview_scheduled: true,
    interview_at: "2026-09-10T17:00:00.000Z", // freshly written by the webhook
  };
  const out = mergeInterviewRounds(
    [row({ id: "r1", round: 1, scheduled_at: "2026-07-01T15:00:00.000Z" })],
    cand,
  );
  expect(out).toHaveLength(2);
  expect(out[0].source).toBe("live");
  expect(out[0].scheduledAt).toBe("2026-09-10T17:00:00.000Z");
  expect(out[1].round).toBe(1);
});

test("no duplicate when the candidate column matches an existing round's time", () => {
  const when = "2026-07-01T15:00:00.000Z";
  const cand = { ...EMPTY_CAND, interview_scheduled: true, interview_at: when };
  const out = mergeInterviewRounds([row({ id: "r1", round: 1, scheduled_at: when })], cand);
  expect(out).toHaveLength(1);
  expect(out[0].source).toBe("table");
});

test("same instant in a different ISO format still dedupes", () => {
  const cand = { ...EMPTY_CAND, interview_at: "2026-07-01T15:00:00Z" };
  const out = mergeInterviewRounds(
    [row({ id: "r1", round: 1, scheduled_at: "2026-07-01T15:00:00.000Z" })],
    cand,
  );
  expect(out).toHaveLength(1);
});

test("candidate data with no timestamp + existing history -> no duplicate of round 1", () => {
  // This is exactly what the 0045 backfill turned into round 1.
  const cand = { ...EMPTY_CAND, interview_notes: "went well", showed_up: true };
  const out = mergeInterviewRounds(
    [row({ id: "r1", round: 1, notes: "went well", showed_up: true })],
    cand,
  );
  expect(out).toHaveLength(1);
  expect(out[0].source).toBe("table");
});

test("migrated round 1 keeps its notes (Rodolfo-style record)", () => {
  const notes = "Strong communicator, forklift certified, available immediately.";
  const out = mergeInterviewRounds(
    [row({ id: "r1", round: 1, notes, showed_up: true, strong_candidate: "yes" })],
    EMPTY_CAND,
  );
  expect(out[0].notes).toBe(notes);
  expect(out[0].strongCandidate).toBe("yes");
});

test("a cleared Calendly booking does not resurrect a live entry", () => {
  // invitee.canceled sets interview_at back to null on the candidate row.
  const cand = { ...EMPTY_CAND, interview_scheduled: false };
  const out = mergeInterviewRounds([row({ id: "r1", round: 1 })], cand);
  expect(out).toHaveLength(1);
  expect(out[0].source).toBe("table");
});

test("candidateHasInterviewData ignores blank strings", () => {
  expect(candidateHasInterviewData({ ...EMPTY_CAND, interview_notes: "   " })).toBe(false);
  expect(candidateHasInterviewData({ ...EMPTY_CAND, interview_notes: "x" })).toBe(true);
  expect(candidateHasInterviewData(EMPTY_CAND)).toBe(false);
});
