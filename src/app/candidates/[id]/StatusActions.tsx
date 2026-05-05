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
        disabled={isPending || currentStatus === "placed"}
        onClick={() => {
          if (!confirm("Promote this candidate to an employee?")) return;
          startTransition(async () => {
            await advanceToPlacement(candidateId);
          });
        }}
      >
        <span>{currentStatus === "placed" ? "Placed" : "Advance to Placement"}</span>
      </button>
    </>
  );
}
