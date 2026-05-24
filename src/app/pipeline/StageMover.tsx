"use client";

import { useTransition } from "react";
import {
  SALES_LEAD_STAGES,
} from "@/lib/sales-pipeline";
import type { SalesLeadStage } from "@/lib/supabase/types";
import { setLeadOwner, setLeadStage } from "./actions";

export function StageMover({
  leadId,
  stage,
  owner,
  owners,
}: {
  leadId: string;
  stage: SalesLeadStage;
  owner: string | null;
  owners: string[];
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div
      style={{
        marginTop: 10,
        paddingTop: 8,
        borderTop: "1px dashed var(--dt-warm-150)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <select
        value={stage}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as SalesLeadStage;
          startTransition(async () => {
            await setLeadStage(leadId, next);
          });
        }}
        className="dt-filter-input"
        style={{ fontSize: 11, padding: "3px 6px" }}
        aria-label="Stage"
      >
        {SALES_LEAD_STAGES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>

      <div style={{ display: "flex", gap: 4 }}>
        <input
          list={`owner-options-${leadId}`}
          defaultValue={owner ?? ""}
          disabled={pending}
          placeholder="Assign owner…"
          onBlur={(e) => {
            const next = e.currentTarget.value.trim() || null;
            if (next === (owner ?? null)) return;
            startTransition(async () => {
              await setLeadOwner(leadId, next);
            });
          }}
          className="dt-filter-input"
          style={{ fontSize: 11, padding: "3px 6px", flex: 1, minWidth: 0 }}
          aria-label="Owner"
        />
        <datalist id={`owner-options-${leadId}`}>
          {owners.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      </div>
    </div>
  );
}
