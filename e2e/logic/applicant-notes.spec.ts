import { test, expect } from "@playwright/test";
import {
  CALL_OUTCOMES,
  OUTCOME_BODY,
  isCallOutcome,
  mergeNoteHistory,
  outcomeLabel,
  parseMentions,
} from "../../src/lib/notes";

// Leangel Gamez, ops WhatsApp 2026-07-20:
//   "we need to be able to make comments or add notes, or watch the income of
//    the call, that is really important for the team to have"
//
// Built as the OUTCOME-of-call reading (see the PR for why). These cover the
// pure parts: the outcome vocabulary, and the promotion-survival merge — the
// bit that decides what a recruiter actually still sees after promotion.

test.describe("phone-screen outcome vocabulary", () => {
  test("exactly the four outcomes the CHECK constraint allows", () => {
    // Must stay in step with candidate_notes_call_outcome_check (0050).
    expect(CALL_OUTCOMES.map((o) => o.id)).toEqual([
      "reached", "no_answer", "left_message", "declined",
    ]);
  });

  test("isCallOutcome accepts only those four", () => {
    for (const o of ["reached", "no_answer", "left_message", "declined"]) {
      expect(isCallOutcome(o)).toBe(true);
    }
    for (const bad of ["", null, undefined, "maybe", "REACHED", "note"]) {
      expect(isCallOutcome(bad as string | null)).toBe(false);
    }
  });

  test("every outcome has a fallback body and a human label", () => {
    // A call logged with no free text still records something meaningful —
    // requiring prose would push recruiters to skip logging the call at all.
    for (const o of CALL_OUTCOMES) {
      expect(OUTCOME_BODY[o.id]).toBeTruthy();
      expect(outcomeLabel(o.id)).toBe(o.label);
    }
  });
});

test.describe("notes survive promotion to the pipeline", () => {
  const n = (id: string, at: string) => ({ id, created_at: at, body: id });

  test("applicant-stage notes appear alongside candidate notes", () => {
    const merged = mergeNoteHistory(
      [n("cand-1", "2026-07-20T12:32:00Z")],
      [n("appl-1", "2026-07-20T12:26:00Z"), n("appl-2", "2026-07-20T12:27:00Z")],
    );
    expect(merged).toHaveLength(3);
    expect(merged.map((x) => x.id)).toEqual(["cand-1", "appl-2", "appl-1"]);
  });

  test("only the carried-over entries are flagged", () => {
    // The label must be accurate, not blanket — a candidate-stage note tagged
    // "From application" would misattribute who said what and when.
    const merged = mergeNoteHistory(
      [n("cand-1", "2026-07-20T12:32:00Z")],
      [n("appl-1", "2026-07-20T12:26:00Z")],
    );
    expect(merged.find((x) => x.id === "cand-1")!.from_applicant_stage).toBe(false);
    expect(merged.find((x) => x.id === "appl-1")!.from_applicant_stage).toBe(true);
  });

  test("strict newest-first across BOTH stages, not stage-then-date", () => {
    // Interleaving matters: a recruiter reads the log top-down as a timeline.
    const merged = mergeNoteHistory(
      [n("c-late", "2026-07-20T18:00:00Z"), n("c-early", "2026-07-20T09:00:00Z")],
      [n("a-mid", "2026-07-20T12:00:00Z")],
    );
    expect(merged.map((x) => x.id)).toEqual(["c-late", "a-mid", "c-early"]);
  });

  test("an applicant with no candidate notes yet still shows its history", () => {
    const merged = mergeNoteHistory([], [n("appl-1", "2026-07-20T12:26:00Z")]);
    expect(merged.map((x) => x.id)).toEqual(["appl-1"]);
    expect(merged[0].from_applicant_stage).toBe(true);
  });

  test("a candidate that was never an applicant is unaffected", () => {
    // The lineage lookup returns nothing for a directly-created candidate.
    const merged = mergeNoteHistory([n("cand-1", "2026-07-20T12:32:00Z")], []);
    expect(merged).toHaveLength(1);
    expect(merged[0].from_applicant_stage).toBe(false);
  });

  test("merging never mutates the inputs", () => {
    // The reader is called on every candidate page render; mutating the source
    // arrays would make repeat renders diverge.
    const own = [n("cand-1", "2026-07-20T12:32:00Z")];
    const appl = [n("appl-1", "2026-07-20T12:26:00Z")];
    mergeNoteHistory(own, appl);
    expect(own).toHaveLength(1);
    expect(appl).toHaveLength(1);
    expect("from_applicant_stage" in own[0]).toBe(false);
  });

  test("@mentions still parse in notes written at the applicant stage", () => {
    // The applicant stage reuses the same composer, so mention notification
    // must keep working there rather than silently doing nothing.
    expect(parseMentions("Handing to @Priscila Anaya for the screen")).toEqual([
      { name: "Priscila Anaya" },
    ]);
  });
});
