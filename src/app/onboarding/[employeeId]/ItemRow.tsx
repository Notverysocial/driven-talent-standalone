"use client";

import { useState, useTransition } from "react";
import { ONBOARDING_STATUSES } from "@/lib/onboarding";
import type { OnboardingStatus } from "@/lib/supabase/types";
import { setItemNotes, setItemStatus } from "../actions";

const STATUS_BG: Record<OnboardingStatus, string> = {
  not_started: "var(--dt-warm-50)",
  in_progress: "var(--dt-gold-50)",
  done:        "#EAF1E0",
  na:          "var(--dt-warm-100)",
};
const STATUS_FG: Record<OnboardingStatus, string> = {
  not_started: "var(--dt-warm-700)",
  in_progress: "var(--dt-gold-deep)",
  done:        "var(--dt-success)",
  na:          "var(--dt-warm-500)",
};

export function ItemRow({
  itemId,
  employeeId,
  ord,
  label,
  detail,
  status,
  doneOn,
  notes,
}: {
  itemId: string;
  employeeId: string;
  ord: number;
  label: string;
  detail: string | null;
  status: OnboardingStatus;
  doneOn: string | null;
  notes: string | null;
}) {
  const [localNotes, setLocalNotes] = useState(notes ?? "");
  const [isPending, startTransition] = useTransition();

  const onStatusChange = (next: OnboardingStatus) => {
    if (next === status) return;
    startTransition(async () => {
      await setItemStatus(itemId, employeeId, next);
    });
  };

  const commitNotes = () => {
    if (localNotes === (notes ?? "")) return;
    startTransition(async () => {
      await setItemNotes(itemId, employeeId, localNotes);
    });
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "44px minmax(0, 1.2fr) 150px minmax(0, 1fr)",
        gap: 16,
        alignItems: "flex-start",
        padding: "16px 18px",
        borderBottom: "1px solid var(--dt-warm-100)",
        opacity: isPending ? 0.6 : 1,
        transition: "opacity 100ms",
      }}
    >
      <div
        className="tab-num"
        style={{
          fontFamily: "var(--dt-display)",
          fontSize: 18,
          fontWeight: 300,
          color: "var(--dt-warm-400)",
          lineHeight: 1,
          paddingTop: 4,
        }}
      >
        {String(ord).padStart(2, "0")}
      </div>

      <div>
        <div style={{ fontSize: 13.5, fontWeight: 400, lineHeight: 1.4 }}>{label}</div>
        {detail && (
          <div style={{ fontSize: 11.5, color: "var(--dt-warm-500)", marginTop: 4, lineHeight: 1.4 }}>
            {detail}
          </div>
        )}
        {status === "done" && doneOn && (
          <div style={{ fontSize: 10.5, color: "var(--dt-success)", marginTop: 6, letterSpacing: "0.06em" }}>
            ✓ {new Date(doneOn).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </div>
        )}
      </div>

      <select
        value={status}
        onChange={(e) => onStatusChange(e.target.value as OnboardingStatus)}
        disabled={isPending}
        style={{
          padding: "8px 10px",
          fontSize: 12,
          fontWeight: 400,
          fontFamily: "inherit",
          background: STATUS_BG[status],
          color: STATUS_FG[status],
          border: "1px solid var(--dt-warm-150)",
          cursor: "pointer",
          outline: "none",
          width: "100%",
        }}
      >
        {ONBOARDING_STATUSES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>

      <textarea
        value={localNotes}
        onChange={(e) => setLocalNotes(e.target.value)}
        onBlur={commitNotes}
        disabled={isPending}
        placeholder="Add a note…"
        rows={2}
        style={{
          width: "100%",
          padding: "8px 10px",
          fontSize: 12,
          fontFamily: "inherit",
          background: "var(--dt-warm-50)",
          border: "1px solid var(--dt-warm-150)",
          resize: "vertical",
          outline: "none",
          minHeight: 38,
        }}
      />
    </div>
  );
}
