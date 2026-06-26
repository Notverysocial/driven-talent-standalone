"use client";

import { useState, useTransition } from "react";
import { ONBOARDING_STATUSES } from "@/lib/onboarding";
import type { AppNotification, OnboardingStatus } from "@/lib/supabase/types";
import { mentionTeammateOnItem, setItemNotes, setItemStatus } from "../actions";

export type ItemTeamMember = { id: string; full_name: string; title: string | null };

function fmtMentionTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

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
  teamMembers,
  mentions,
}: {
  itemId: string;
  employeeId: string;
  ord: number;
  label: string;
  detail: string | null;
  status: OnboardingStatus;
  doneOn: string | null;
  notes: string | null;
  teamMembers: ItemTeamMember[];
  mentions: AppNotification[];
}) {
  const [localNotes, setLocalNotes] = useState(notes ?? "");
  const [isPending, startTransition] = useTransition();
  const [tagOpen, setTagOpen] = useState(false);

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
        borderBottom: "1px solid var(--dt-warm-100)",
        opacity: isPending ? 0.6 : 1,
        transition: "opacity 100ms",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "44px minmax(0, 1.2fr) 150px minmax(0, 1fr)",
          gap: 16,
          alignItems: "flex-start",
          padding: "16px 18px 8px",
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

      {/* Team tagging (Phase-1 #5) — @mention a teammate + inline thread */}
      <div style={{ padding: "0 18px 14px 62px" }}>
        {mentions.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
            {mentions.map((m) => (
              <div
                key={m.id}
                style={{
                  fontSize: 11.5,
                  lineHeight: 1.5,
                  background: "var(--dt-gold-50)",
                  borderLeft: "2px solid var(--dt-gold)",
                  padding: "6px 10px",
                }}
              >
                <span style={{ fontWeight: 500 }}>{m.actor_name ?? "Someone"}</span>
                {" → "}
                <span style={{ fontWeight: 500 }}>@{m.recipient_name}</span>
                <span style={{ color: "var(--dt-warm-700)" }}>: {m.body}</span>
                <span className="tab-num" style={{ color: "var(--dt-warm-500)", marginLeft: 8 }}>
                  {fmtMentionTime(m.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}

        {!tagOpen ? (
          <button
            type="button"
            onClick={() => setTagOpen(true)}
            className="dt-btn dt-btn-ghost"
            style={{ fontSize: 10.5, padding: "2px 8px" }}
          >
            @ Tag teammate
          </button>
        ) : (
          <form
            action={mentionTeammateOnItem.bind(null, employeeId, itemId)}
            onSubmit={() => setTagOpen(false)}
            style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}
          >
            <select name="team_member_id" required className="dt-filter-input" style={{ fontSize: 11.5, padding: "5px 8px", width: "auto" }}>
              <option value="">Select teammate…</option>
              {teamMembers.map((tm) => (
                <option key={tm.id} value={tm.id}>
                  {tm.full_name}
                  {tm.title ? ` · ${tm.title}` : ""}
                </option>
              ))}
            </select>
            <input
              name="message"
              required
              placeholder="Message…"
              className="dt-filter-input"
              style={{ fontSize: 11.5, padding: "5px 8px", flex: "1 1 200px" }}
            />
            <button type="submit" className="dt-btn dt-btn-primary" style={{ fontSize: 10.5, padding: "4px 10px" }}>
              Notify
            </button>
            <button
              type="button"
              onClick={() => setTagOpen(false)}
              className="dt-btn dt-btn-ghost"
              style={{ fontSize: 10.5, padding: "4px 8px" }}
            >
              Cancel
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
