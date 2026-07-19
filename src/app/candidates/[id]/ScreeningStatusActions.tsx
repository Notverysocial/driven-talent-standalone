"use client";

import { useTransition } from "react";
import { CANDIDATE_SCREENING_STATUSES } from "@/lib/candidates";
import type { CandidateScreeningStatus } from "@/lib/supabase/types";
import { setScreeningStatus } from "../actions";

// Candidate-level screening outcome control (Estefany, card c2ad6f4f). Sits
// beside the pipeline StatusActions in the candidate header. Empty value =
// "Not reviewed" (clears the flag).
export function ScreeningStatusActions({
  candidateId,
  current,
}: {
  candidateId: string;
  current: CandidateScreeningStatus | null;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <select
      className="dt-btn"
      aria-label="Screening status"
      title="Screening status — approve strong candidates or hold them ready-to-send"
      value={current ?? ""}
      disabled={isPending}
      onChange={(e) => {
        const raw = e.target.value;
        const next = (raw === "" ? null : raw) as CandidateScreeningStatus | null;
        if (next === current) return;
        startTransition(async () => {
          await setScreeningStatus(candidateId, next);
        });
      }}
      style={{ fontFamily: "inherit", cursor: "pointer" }}
    >
      <option value="">Screening: Not reviewed</option>
      {CANDIDATE_SCREENING_STATUSES.map((s) => (
        <option key={s.id} value={s.id}>
          Screening: {s.label}
        </option>
      ))}
    </select>
  );
}
