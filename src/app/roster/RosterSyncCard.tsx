"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/Badge";
import type { RosterSyncRun } from "@/lib/supabase/types";
import { syncRosterFromUattend } from "./sync-actions";

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Roster auto add/remove control. One click reconciles the active roster
// against the uAttend feed; the result (added / removed) is shown inline and
// recorded to roster_sync_runs.
export function RosterSyncCard({ lastRuns }: { lastRuns: RosterSyncRun[] }) {
  const [pending, startTransition] = useTransition();
  const [run, setRun] = useState<RosterSyncRun | null>(lastRuns[0] ?? null);
  const [error, setError] = useState<string | null>(null);

  const sync = () => {
    setError(null);
    startTransition(async () => {
      try {
        setRun(await syncRosterFromUattend("Roxanna"));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Sync failed");
      }
    });
  };

  return (
    <div
      className="dt-card"
      style={{ padding: "14px 18px", marginBottom: 16, display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>Roster sync</div>
        <div style={{ fontSize: 11.5, color: "var(--dt-warm-500)", marginTop: 2 }}>
          uAttend is the source of truth — new hires added, terminations retired automatically.
        </div>
        {error && <div style={{ fontSize: 11.5, color: "var(--dt-danger)", marginTop: 4 }}>{error}</div>}
        {run && (
          <div style={{ fontSize: 11.5, color: "var(--dt-warm-700)", marginTop: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Badge tone="green">+{run.added_count} added</Badge>
            <Badge tone={run.removed_count > 0 ? "amber" : "warm"}>−{run.removed_count} retired</Badge>
            <span className="muted">last run {fmtWhen(run.ran_at)}</span>
            {run.details.length > 0 && (
              <span className="muted">
                · {run.details.map((d) => `${d.name} (${d.action})`).slice(0, 4).join(", ")}
                {run.details.length > 4 ? "…" : ""}
              </span>
            )}
          </div>
        )}
      </div>
      <button type="button" className="dt-btn" disabled={pending} onClick={sync}>
        {pending ? "Syncing…" : "↻ Sync from uAttend"}
      </button>
    </div>
  );
}
