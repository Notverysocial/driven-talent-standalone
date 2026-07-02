"use client";

import { useState, useTransition } from "react";
import type { UattendIngestSummary } from "@/lib/uattend/ingest.server";
import { pullUattendWeek } from "./actions";

// Triggers a uAttend pull for the selected week and shows a compact summary of
// what landed (mode = mock until the live key is connected on /integrations).
export function UattendPullButton({ weekStart }: { weekStart: string }) {
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<UattendIngestSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    setError(null);
    startTransition(async () => {
      try {
        setSummary(await pullUattendWeek(weekStart));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Pull failed");
      }
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button type="button" onClick={run} disabled={pending} className="dt-btn">
        {pending ? "Pulling…" : "↻ Pull this week from uAttend"}
      </button>
      {error && <div style={{ fontSize: 11.5, color: "var(--dt-danger)" }}>{error}</div>}
      {summary && (
        <div style={{ fontSize: 11, color: "var(--dt-warm-700)", lineHeight: 1.6 }}>
          <span
            style={{
              fontWeight: 600,
              color: summary.mode === "live" ? "var(--dt-success)" : "var(--dt-gold-deep)",
            }}
          >
            {summary.mode === "live" ? "LIVE" : "MOCK"}
          </span>{" "}
          · {summary.timecardsUpserted} time cards · {summary.matchedByMap + summary.matchedByName} matched
          {summary.matchedByName > 0 ? ` (${summary.matchedByName} by name)` : ""}
          {summary.unmatched.length > 0 && (
            <span style={{ color: "var(--dt-warning)" }}>
              {" "}· unmatched ({summary.unmatched.length}): {summary.unmatched.map((u) => u.name).join(", ")}
            </span>
          )}
          {summary.unassigned.length > 0 && (
            <span style={{ color: "var(--dt-warning)" }}>
              {" "}· unassigned ({summary.unassigned.length}): {summary.unassigned.map((u) => u.name).join(", ")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
