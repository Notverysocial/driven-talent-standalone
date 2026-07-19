// Calendly -> candidate interview write-back decision (runbook Phase A, gap 1).
//
// PURE + side-effect-free so the guards are unit-testable without a database.
// The DB wrapper in calendly.ts (applyInterviewWriteback) resolves the candidate
// match + current value, calls decideInterviewWriteback, and performs the write.
//
// Guards (all required, per the runbook):
//   1. Exactly-one email match, else skip. Duplicate emails are real in this
//      dataset, so a fuzzy match would write an interview onto the wrong person.
//   2. Never overwrite a newer value with an older machine one. If interview_at
//      is already set and the incoming event is not newer, leave it.
//   3. (logging) handled by the caller — every write goes to activity_log with
//      actor 'calendly-webhook'.
//   4. Cancellation clears the interview, but only the one that matches the
//      canceled event's time, so a rescheduled/newer interview is not wiped.
//
// This writer sets ONLY interview_scheduled + interview_at. It must never touch
// showed_up / interview_notes / strong_candidate / other_positions_fit — those
// are human judgments a webhook must not fabricate.

export type InterviewWritebackDecision =
  | { action: "skip"; reason: string }
  | { action: "set"; interviewAt: string }
  | { action: "clear" };

export function decideInterviewWriteback(input: {
  eventType: "created" | "canceled";
  matchCount: number; // candidates whose email matched
  currentInterviewAt: string | null; // value on the matched candidate now
  incomingStart: string | null; // the Calendly event's start time
}): InterviewWritebackDecision {
  // Guard 1 — confident match only.
  if (input.matchCount !== 1) {
    return {
      action: "skip",
      reason: input.matchCount === 0 ? "no_candidate_match" : "ambiguous_email_match",
    };
  }

  if (input.eventType === "created") {
    if (!input.incomingStart) return { action: "skip", reason: "no_start_time" };
    const incoming = Date.parse(input.incomingStart);
    if (Number.isNaN(incoming)) return { action: "skip", reason: "unparseable_start" };

    // Guard 2 — do not move an existing value to an older time.
    if (input.currentInterviewAt) {
      const current = Date.parse(input.currentInterviewAt);
      if (!Number.isNaN(current) && incoming <= current) {
        return { action: "skip", reason: "existing_not_older" };
      }
    }
    return { action: "set", interviewAt: new Date(incoming).toISOString() };
  }

  // eventType === "canceled" — Guard 4.
  if (!input.currentInterviewAt) {
    return { action: "skip", reason: "nothing_to_clear" };
  }
  if (input.incomingStart) {
    const incoming = Date.parse(input.incomingStart);
    const current = Date.parse(input.currentInterviewAt);
    // Only clear when the canceled event is the one currently on record.
    if (!Number.isNaN(incoming) && !Number.isNaN(current) && incoming !== current) {
      return { action: "skip", reason: "cancel_does_not_match_current" };
    }
  }
  return { action: "clear" };
}
