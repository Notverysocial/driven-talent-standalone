"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { claimCandidate, reactivateCandidate } from "./actions";

/**
 * ATS Owner-column action for an unclaimed candidate row (Change 2, Leangel
 * 2026-07-08). Stamps the signed-in recruiter as the owner; the row then
 * surfaces under "My Candidates" and their name tab. Mirrors the Applicant
 * Tracking "Claim for me" behavior on the candidate side.
 */
export function ClaimForMeButton({ candidateId }: { candidateId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 2 }}>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              await claimCandidate(candidateId);
              router.refresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed.");
            }
          });
        }}
        className="dt-btn"
        style={{
          fontSize: 11.5,
          padding: "4px 10px",
          justifyContent: "center",
          background: "#2563EB",
          color: "#fff",
          borderColor: "#2563EB",
          cursor: pending ? "wait" : "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {pending ? "Claiming…" : "Claim for me"}
      </button>
      {error && (
        <span role="alert" style={{ fontSize: 10, color: "var(--dt-danger)" }}>
          {error}
        </span>
      )}
    </span>
  );
}

/**
 * ATS Move-column action shown on the "Available for Rehire" / "Do Not Return"
 * tabs. Pulls the candidate back into the active funnel
 * (lifecycle_status = 'in_process'). Ported from the former Talent Pool page.
 */
export function ReactivateButton({ candidateId }: { candidateId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 2 }}>
      <button
        type="button"
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
        className="dt-btn dt-btn-sm"
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
