"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reactivateCandidate } from "./actions";

/**
 * Quick-action on each talent-pool row. Moves the candidate to
 * lifecycle_status='in_process' so they re-enter the active funnel, then
 * refreshes so the row hops to the In Process tab.
 */
export function ReactivateButton({ candidateId }: { candidateId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 2 }}>
      <button
        type="button"
        className="dt-btn dt-btn-sm"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              await reactivateCandidate(candidateId);
              router.refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed.");
            }
          });
        }}
        style={{ cursor: pending ? "wait" : "pointer", whiteSpace: "nowrap" }}
      >
        {pending ? "Reactivating…" : "Reactivate"}
      </button>
      {error && (
        <span role="alert" style={{ fontSize: 10, color: "var(--dt-danger)" }}>
          {error}
        </span>
      )}
    </span>
  );
}
