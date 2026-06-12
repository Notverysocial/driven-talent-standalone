"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CANDIDATE_STATUSES } from "@/lib/candidates";
import type { CandidateStatus } from "@/lib/supabase/types";
import { setStatus } from "./actions";

/**
 * Inline stage selector that lives on each row of the /candidates
 * HIRING PIPELINE table.  Operator picks a new stage, the action
 * updates `candidates.status` in the DB, and the row hops columns
 * after revalidation.
 *
 * "Move back" is supported by just picking an earlier stage from the
 * same dropdown — no separate undo affordance required for V1.
 */
export function CandidateStageMenu({
  candidateId,
  currentStatus,
}: {
  candidateId: string;
  currentStatus: CandidateStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "stretch", gap: 2 }}>
      <select
        aria-label="Move candidate to stage"
        disabled={pending}
        value={currentStatus}
        onChange={(e) => {
          const next = e.target.value as CandidateStatus;
          if (next === currentStatus) return;
          setError(null);
          startTransition(async () => {
            try {
              await setStatus(candidateId, next);
              router.refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Move failed.");
            }
          });
        }}
        onClick={(e) => e.stopPropagation()}
        style={{
          fontSize: 11,
          padding: "3px 6px",
          borderRadius: 4,
          border: "1px solid var(--dt-warm-200, #ddd)",
          background: pending ? "var(--dt-warm-50, #fafafa)" : "#fff",
          color: "var(--dt-warm-700, #444)",
          cursor: pending ? "wait" : "pointer",
          fontFamily: "inherit",
          minWidth: 110,
        }}
      >
        {CANDIDATE_STATUSES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.id === currentStatus ? `● ${s.label}` : `→ ${s.label}`}
          </option>
        ))}
      </select>
      {error && (
        <div role="alert" style={{ fontSize: 10, color: "var(--dt-danger)" }}>
          {error}
        </div>
      )}
    </div>
  );
}
