"use client";

import { useState, useTransition } from "react";
import { deleteCandidate } from "../actions";
import type { DeleteCandidateImpact } from "../actions";

// Guarded delete control. Admin-only at the action layer (assertRole("admin"));
// this component is simply not rendered for anyone else.
//
// The confirmation asks the operator to TYPE the candidate's name rather than
// clicking "OK". Nothing in the schema protects a candidate — no FK restricts
// the delete — so this dialog is the last thing standing between a stray click
// and interviews, notes and call history going away. It also says exactly what
// will happen, counted from the real rows, instead of a generic "are you sure".

export function DeleteCandidateButton({
  candidateId,
  candidateName,
  impact,
  blockedReason,
}: {
  candidateId: string;
  candidateName: string;
  impact: DeleteCandidateImpact;
  /** Set when this candidate must not be deleted at all (e.g. hired). */
  blockedReason: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const matches = typed.trim().toLowerCase() === candidateName.trim().toLowerCase();

  if (blockedReason) {
    return (
      <button
        type="button"
        className="dt-btn"
        disabled
        title={blockedReason}
        style={{ opacity: 0.5, cursor: "not-allowed", fontSize: 12 }}
      >
        Delete
      </button>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        className="dt-btn"
        onClick={() => setOpen(true)}
        style={{ fontSize: 12, color: "var(--dt-danger)", borderColor: "var(--dt-danger)" }}
      >
        Delete
      </button>
    );
  }

  const willRemove: string[] = [];
  if (impact.interviews > 0) willRemove.push(`${impact.interviews} interview record(s)`);
  if (impact.notes > 0) willRemove.push(`${impact.notes} note(s)`);
  const willDetach: string[] = [];
  if (impact.calls > 0) willDetach.push(`${impact.calls} inbound call(s)`);
  if (impact.intakes > 0) willDetach.push(`${impact.intakes} website application(s)`);
  if (impact.bonuses > 0) willDetach.push(`${impact.bonuses} bonus record(s)`);

  return (
    <div
      style={{
        border: "1px solid var(--dt-danger)",
        background: "rgba(178,58,58,0.05)",
        borderRadius: 6,
        padding: "12px 14px",
        maxWidth: 460,
        fontSize: 12.5,
        lineHeight: 1.55,
      }}
    >
      <div style={{ fontWeight: 600, color: "var(--dt-danger)", marginBottom: 6 }}>
        Delete {candidateName} permanently?
      </div>
      {willRemove.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          This also deletes <strong>{willRemove.join(" and ")}</strong>.
        </div>
      )}
      {willDetach.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          It detaches {willDetach.join(", ")} — those records stay, but stop pointing here.
        </div>
      )}
      {willRemove.length === 0 && willDetach.length === 0 && (
        <div style={{ marginBottom: 4 }}>Nothing else is linked to this candidate.</div>
      )}
      <div style={{ marginTop: 8, marginBottom: 6 }}>
        Type <strong>{candidateName}</strong> to confirm:
      </div>
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        className="dt-filter-input"
        placeholder={candidateName}
        style={{ width: "100%", marginBottom: 8 }}
        autoFocus
      />
      {err && (
        <div style={{ color: "var(--dt-danger)", marginBottom: 8 }}>{err}</div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="dt-btn"
          disabled={!matches || isPending}
          onClick={() =>
            startTransition(async () => {
              try {
                await deleteCandidate(candidateId);
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Delete failed");
              }
            })
          }
          style={{
            fontSize: 12,
            background: matches ? "var(--dt-danger)" : undefined,
            color: matches ? "#fff" : undefined,
            opacity: matches && !isPending ? 1 : 0.55,
            cursor: matches && !isPending ? "pointer" : "not-allowed",
          }}
        >
          {isPending ? "Deleting…" : "Delete permanently"}
        </button>
        <button
          type="button"
          className="dt-btn dt-btn-ghost"
          onClick={() => {
            setOpen(false);
            setTyped("");
            setErr(null);
          }}
          style={{ fontSize: 12 }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
