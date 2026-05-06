"use client";

import { useTransition } from "react";
import { CANDIDATE_STATUSES } from "@/lib/candidates";
import type { CandidateStatus } from "@/lib/supabase/types";
import { advanceToPlacement, setStatus } from "../actions";

export function StatusActions({
  candidateId,
  currentStatus,
}: {
  candidateId: string;
  currentStatus: CandidateStatus;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <>
      <select
        className="dt-btn"
        value={currentStatus}
        disabled={isPending}
        onChange={(e) => {
          const next = e.target.value as CandidateStatus;
          if (next === currentStatus) return;
          startTransition(async () => {
            await setStatus(candidateId, next);
          });
        }}
        style={{
          fontFamily: "inherit",
          cursor: "pointer",
        }}
      >
        {CANDIDATE_STATUSES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      <button
        className="dt-btn dt-btn-gold"
        disabled={isPending || currentStatus === "hired"}
        onClick={() => {
          if (!confirm("Hire this candidate? An employee record + 13-step onboarding will be created.")) return;
          startTransition(async () => {
            await advanceToPlacement(candidateId);
          });
        }}
      >
        <span>{currentStatus === "hired" ? "Hired" : "Hire Candidate"}</span>
      </button>
    </>
  );
}
