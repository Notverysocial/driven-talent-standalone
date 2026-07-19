import { test, expect } from "@playwright/test";
import { decideInterviewWriteback } from "../../src/lib/integrations/calendly-interview";

// Guard coverage for the Calendly -> candidate interview write-back (runbook
// Phase A). Pure-function tests, no server/DB needed — they exercise every guard
// the runbook A3 lists: matched, unmatched, duplicate-email, canceled, plus the
// no-overwrite-older and cancel-mismatch defenses.

const START = "2026-08-01T15:00:00.000Z";
const LATER = "2026-08-05T15:00:00.000Z";
const EARLIER = "2026-07-20T15:00:00.000Z";

test("matched candidate + booking -> set", () => {
  const d = decideInterviewWriteback({
    eventType: "created",
    matchCount: 1,
    currentInterviewAt: null,
    incomingStart: START,
  });
  expect(d).toEqual({ action: "set", interviewAt: new Date(START).toISOString() });
});

test("no candidate match -> skip (never guess)", () => {
  const d = decideInterviewWriteback({
    eventType: "created",
    matchCount: 0,
    currentInterviewAt: null,
    incomingStart: START,
  });
  expect(d).toEqual({ action: "skip", reason: "no_candidate_match" });
});

test("duplicate email (2 matches) -> skip (do not write onto the wrong person)", () => {
  const d = decideInterviewWriteback({
    eventType: "created",
    matchCount: 2,
    currentInterviewAt: null,
    incomingStart: START,
  });
  expect(d).toEqual({ action: "skip", reason: "ambiguous_email_match" });
});

test("existing newer value + older incoming -> skip (no clobber)", () => {
  const d = decideInterviewWriteback({
    eventType: "created",
    matchCount: 1,
    currentInterviewAt: LATER,
    incomingStart: EARLIER,
  });
  expect(d).toEqual({ action: "skip", reason: "existing_not_older" });
});

test("existing value + strictly newer incoming -> set (reschedule forward)", () => {
  const d = decideInterviewWriteback({
    eventType: "created",
    matchCount: 1,
    currentInterviewAt: START,
    incomingStart: LATER,
  });
  expect(d).toEqual({ action: "set", interviewAt: new Date(LATER).toISOString() });
});

test("booking with no start time -> skip", () => {
  const d = decideInterviewWriteback({
    eventType: "created",
    matchCount: 1,
    currentInterviewAt: null,
    incomingStart: null,
  });
  expect(d).toEqual({ action: "skip", reason: "no_start_time" });
});

test("cancellation of the current interview -> clear", () => {
  const d = decideInterviewWriteback({
    eventType: "canceled",
    matchCount: 1,
    currentInterviewAt: START,
    incomingStart: START,
  });
  expect(d).toEqual({ action: "clear" });
});

test("cancellation when nothing is scheduled -> skip", () => {
  const d = decideInterviewWriteback({
    eventType: "canceled",
    matchCount: 1,
    currentInterviewAt: null,
    incomingStart: START,
  });
  expect(d).toEqual({ action: "skip", reason: "nothing_to_clear" });
});

test("cancellation of a DIFFERENT time than the one on record -> skip (do not wipe a reschedule)", () => {
  const d = decideInterviewWriteback({
    eventType: "canceled",
    matchCount: 1,
    currentInterviewAt: LATER,
    incomingStart: START,
  });
  expect(d).toEqual({ action: "skip", reason: "cancel_does_not_match_current" });
});

test("cancellation with duplicate email match -> skip", () => {
  const d = decideInterviewWriteback({
    eventType: "canceled",
    matchCount: 2,
    currentInterviewAt: START,
    incomingStart: START,
  });
  expect(d).toEqual({ action: "skip", reason: "ambiguous_email_match" });
});
