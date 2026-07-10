// Five-stage recruitment pipeline (Estefany 2026-07-06). Replaces the parallel
// spreadsheet: each stage has tracked sub-fields on the candidates row (migration
// 0038) and the profile renders them as a progress bar. Pure/shared — no server
// imports, so both the server page and the client tracker can use it.

import type { Candidate } from "./supabase/types";

export type PipelineStageKey =
  | "prescreen"
  | "video_interview"
  | "evaluation"
  | "sent_to_client"
  | "client_decision";

export type PipelineStage = {
  key: PipelineStageKey;
  index: number; // 1..5
  label: string;
  short: string;
};

export const PIPELINE_STAGES: PipelineStage[] = [
  { key: "prescreen",       index: 1, label: "Prescreening Call",   short: "Prescreen" },
  { key: "video_interview", index: 2, label: "Video Interview",     short: "Interview" },
  { key: "evaluation",      index: 3, label: "Interview Evaluation", short: "Evaluation" },
  { key: "sent_to_client",  index: 4, label: "Sent to Client",      short: "Sent" },
  { key: "client_decision", index: 5, label: "Client Decision",     short: "Decision" },
];

// A stage is "complete" once its primary gating sub-field is affirmatively set.
// (Sub-fields can be null = not-yet-touched, so we test === true / concrete value.)
export function isStageComplete(c: Candidate, key: PipelineStageKey): boolean {
  switch (key) {
    case "prescreen":
      // Reached once we have a contact outcome: answered, or a voicemail/text left.
      return c.call_answered === true || c.voicemail_or_text_sent === true;
    case "video_interview":
      return c.interview_scheduled === true && Boolean(c.interview_at);
    case "evaluation":
      // Evaluated once we know whether they showed and have an impression.
      return c.showed_up != null && Boolean(c.interview_notes);
    case "sent_to_client":
      return c.sent_to_client === true;
    case "client_decision":
      return c.client_response != null;
  }
}

// Highest completed stage index (0 when nothing done yet).
export function currentStageIndex(c: Candidate): number {
  let n = 0;
  for (const s of PIPELINE_STAGES) if (isStageComplete(c, s.key)) n = s.index;
  return n;
}

// 0..100 progress for the profile progress bar.
export function pipelineProgressPct(c: Candidate): number {
  const done = PIPELINE_STAGES.filter((s) => isStageComplete(c, s.key)).length;
  return Math.round((done / PIPELINE_STAGES.length) * 100);
}

export const STRONG_CANDIDATE_OPTIONS = ["yes", "no", "maybe"] as const;
export const CLIENT_RESPONSE_OPTIONS = ["accepted", "rejected", "pending"] as const;

// When the client accepts, the candidate is Ready for Onboarding and should
// surface a move to /onboarding. This is the single source of that rule.
export function isReadyForOnboarding(c: Candidate): boolean {
  return c.client_response === "accepted";
}
