"use client";

import { useState } from "react";
import { Badge } from "@/components/Badge";
import type { WellnessEntryType, WellnessNote } from "@/lib/supabase/types";
import { addWellnessNote } from "./wellness-actions";

const TYPE_LABEL: Record<WellnessEntryType, string> = {
  note: "Note",
  follow_up: "Follow-up",
  wellness_check: "Wellness check",
  incident: "Incident",
  accident: "Accident",
  return_to_work: "Return to work",
  other: "Other",
};

const TYPE_TONE: Record<
  WellnessEntryType,
  "warm" | "gold" | "amber" | "green" | "red" | "dark"
> = {
  note: "warm",
  follow_up: "amber",
  wellness_check: "green",
  incident: "red",
  accident: "red",
  return_to_work: "green",
  other: "dark",
};

function fmtStamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Phase-1 #6 — immutable wellness / follow-up timeline. Append-only; there is
// no edit/delete affordance by design (case-management record). Entries are
// stamped with date, time, and author.
export function WellnessTimeline({
  employeeId,
  employeeName,
  notes,
  defaultAuthor,
}: {
  employeeId: string;
  employeeName: string;
  notes: WellnessNote[];
  defaultAuthor: string;
}) {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="dt-card" style={{ marginTop: 22 }}>
      <div className="dt-card-head">
        <div>
          <h3>Wellness &amp; Follow-up Timeline</h3>
          <div className="sub">
            Immutable case record · {notes.length} {notes.length === 1 ? "entry" : "entries"} · workplace-accident / incident follow-up
          </div>
        </div>
        <button
          type="button"
          className="dt-btn dt-btn-gold"
          onClick={() => setAddOpen((o) => !o)}
        >
          {addOpen ? "Cancel" : "+ Add entry"}
        </button>
      </div>

      {addOpen && (
        <form
          action={addWellnessNote.bind(null, employeeId)}
          onSubmit={() => setAddOpen(false)}
          style={{
            margin: "8px 18px 18px",
            padding: "16px 18px",
            background: "var(--dt-warm-50)",
            border: "1px dashed var(--dt-warm-200)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.4fr", gap: 10 }}>
            <label className="dt-filter">
              <span className="dt-filter-label">Type</span>
              <select name="entry_type" className="dt-filter-input" defaultValue="note">
                {(Object.keys(TYPE_LABEL) as WellnessEntryType[]).map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="dt-filter">
              <span className="dt-filter-label">When (optional)</span>
              <input name="occurred_at" type="datetime-local" className="dt-filter-input" />
            </label>
            <label className="dt-filter">
              <span className="dt-filter-label">Author</span>
              <input
                name="author_name"
                type="text"
                defaultValue={defaultAuthor}
                className="dt-filter-input"
                required
              />
            </label>
          </div>
          <label className="dt-filter">
            <span className="dt-filter-label">Entry</span>
            <textarea
              name="body"
              rows={3}
              required
              className="dt-filter-input"
              style={{ resize: "vertical", minHeight: 70 }}
              placeholder={`What happened / follow-up for ${employeeName}…`}
            />
          </label>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <span className="muted" style={{ fontSize: 10.5 }}>
              Entries are permanent — they can&apos;t be edited or deleted once saved.
            </span>
            <button type="submit" className="dt-btn dt-btn-primary">
              Save entry
            </button>
          </div>
        </form>
      )}

      <div style={{ padding: "4px 0 8px" }}>
        {notes.length === 0 ? (
          <div
            style={{
              padding: "28px 22px",
              textAlign: "center",
              color: "var(--dt-warm-500)",
              fontSize: 13,
              fontStyle: "italic",
            }}
          >
            No timeline entries yet.
          </div>
        ) : (
          notes.map((n, i) => (
            <div
              key={n.id}
              style={{
                display: "grid",
                gridTemplateColumns: "150px 1fr",
                gap: 16,
                padding: "14px 22px",
                borderBottom: i === notes.length - 1 ? "none" : "1px solid var(--dt-warm-100)",
              }}
            >
              <div>
                <Badge tone={TYPE_TONE[n.entry_type]}>{TYPE_LABEL[n.entry_type]}</Badge>
                <div className="tab-num" style={{ fontSize: 10.5, color: "var(--dt-warm-500)", marginTop: 6 }}>
                  {fmtStamp(n.occurred_at)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                  {n.body}
                </div>
                <div style={{ fontSize: 11, color: "var(--dt-warm-500)", marginTop: 6 }}>
                  — {n.author_name}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
