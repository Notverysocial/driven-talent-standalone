"use client";

import { useState } from "react";
import type { Candidate } from "@/lib/supabase/types";
import {
  PIPELINE_STAGES,
  type PipelineStageKey,
  isStageComplete,
  currentStageIndex,
  pipelineProgressPct,
  isReadyForOnboarding,
} from "@/lib/pipeline";
import { savePipelineStage } from "./pipeline-actions";
import { advanceToPlacement } from "../actions";

function ynValue(v: boolean | null): string {
  return v === true ? "yes" : v === false ? "no" : "";
}

function YN({ name, value, label }: { name: string; value: boolean | null; label: string }) {
  return (
    <label className="dt-filter" style={{ minWidth: 150 }}>
      <span className="dt-filter-label">{label}</span>
      <select name={name} defaultValue={ynValue(value)} className="dt-filter-input">
        <option value="">—</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </label>
  );
}

function dateVal(v: string | null): string {
  return v ? v.slice(0, 10) : "";
}
function dtLocalVal(v: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  // YYYY-MM-DDTHH:mm for <input type="datetime-local">
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PipelineTracker({ cand }: { cand: Candidate }) {
  const currentIdx = currentStageIndex(cand);
  const pct = pipelineProgressPct(cand);
  // Auto-open the first incomplete stage (or Evaluation when opened via the
  // "Interview" summary — see interview control below).
  const [open, setOpen] = useState<PipelineStageKey | null>(() => {
    const next = PIPELINE_STAGES.find((s) => !isStageComplete(cand, s.key));
    return next ? next.key : "client_decision";
  });

  return (
    <div>
      {/* Progress bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
        {PIPELINE_STAGES.map((s) => {
          const done = isStageComplete(cand, s.key);
          const isCurrent = s.index === currentIdx + 1 && !done;
          return (
            <div
              key={s.key}
              title={s.label}
              style={{
                flex: 1,
                height: 6,
                borderRadius: 3,
                background: done
                  ? "var(--dt-gold)"
                  : isCurrent
                  ? "var(--dt-gold-soft, #F4D896)"
                  : "var(--dt-warm-150)",
              }}
            />
          );
        })}
      </div>
      <div className="tiny muted" style={{ marginBottom: 14, letterSpacing: "0.06em" }}>
        {pct}% · {currentIdx} of {PIPELINE_STAGES.length} stages complete
      </div>

      {/* Ready-for-Onboarding surface (Stage 5 accepted -> move to onboarding) */}
      {isReadyForOnboarding(cand) && (
        <div
          style={{
            marginBottom: 16,
            padding: "12px 14px",
            borderRadius: 6,
            background: "rgba(79,122,58,0.10)",
            border: "1px solid rgba(79,122,58,0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: 13, color: "var(--dt-success)", fontWeight: 500 }}>
            Client accepted — ready for onboarding.
          </div>
          {cand.status !== "hired" && (
            <form action={advanceToPlacement.bind(null, cand.id)}>
              <button type="submit" className="dt-btn dt-btn-gold" style={{ fontSize: 12 }}>
                <span>Move to Onboarding →</span>
              </button>
            </form>
          )}
        </div>
      )}

      {/* Stage panels */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {PIPELINE_STAGES.map((s) => {
          const done = isStageComplete(cand, s.key);
          const isOpen = open === s.key;
          return (
            <div key={s.key} style={{ border: "1px solid var(--dt-warm-150)", borderRadius: 6, overflow: "hidden" }}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : s.key)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  background: isOpen ? "var(--dt-warm-50)" : "#fff",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "inherit",
                }}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 600,
                    background: done ? "var(--dt-gold)" : "var(--dt-warm-150)",
                    color: done ? "#0a0a0a" : "var(--dt-warm-500)",
                  }}
                >
                  {done ? "✓" : s.index}
                </span>
                <span style={{ fontSize: 13.5, fontWeight: 500, flex: 1 }}>{s.label}</span>
                <span className="tiny muted">{isOpen ? "▴" : "▾"}</span>
              </button>

              {isOpen && (
                <form
                  action={savePipelineStage.bind(null, cand.id, s.key)}
                  style={{ padding: "14px", borderTop: "1px solid var(--dt-warm-100)", display: "flex", flexDirection: "column", gap: 12 }}
                >
                  {s.key === "prescreen" && (
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <YN name="call_answered" value={cand.call_answered} label="Answered?" />
                      <YN name="voicemail_or_text_sent" value={cand.voicemail_or_text_sent} label="Left voicemail / text?" />
                      <label className="dt-filter" style={{ minWidth: 160 }}>
                        <span className="dt-filter-label">Last contact date</span>
                        <input type="date" name="last_contact_date" defaultValue={dateVal(cand.last_contact_date)} className="dt-filter-input" />
                      </label>
                    </div>
                  )}

                  {s.key === "video_interview" && (
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <YN name="interview_scheduled" value={cand.interview_scheduled} label="Scheduled?" />
                      <label className="dt-filter" style={{ minWidth: 220 }}>
                        <span className="dt-filter-label">Interview date &amp; time</span>
                        <input type="datetime-local" name="interview_at" defaultValue={dtLocalVal(cand.interview_at)} className="dt-filter-input" />
                      </label>
                    </div>
                  )}

                  {s.key === "evaluation" && (
                    <>
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <YN name="showed_up" value={cand.showed_up} label="Showed up?" />
                        <YN name="resume_on_file" value={cand.resume_on_file} label="Resume on file?" />
                        <label className="dt-filter" style={{ minWidth: 150 }}>
                          <span className="dt-filter-label">Strong candidate?</span>
                          <select name="strong_candidate" defaultValue={cand.strong_candidate ?? ""} className="dt-filter-input">
                            <option value="">—</option>
                            <option value="yes">Yes</option>
                            <option value="no">No</option>
                            <option value="maybe">Maybe</option>
                          </select>
                        </label>
                      </div>
                      <label className="dt-filter">
                        <span className="dt-filter-label">If no-show, reason</span>
                        <input type="text" name="no_show_reason" defaultValue={cand.no_show_reason ?? ""} className="dt-filter-input" />
                      </label>
                      <label className="dt-filter">
                        <span className="dt-filter-label">Interview notes &amp; overall impression</span>
                        <textarea name="interview_notes" rows={3} defaultValue={cand.interview_notes ?? ""} className="dt-filter-input" style={{ resize: "vertical" }} />
                      </label>
                      <label className="dt-filter">
                        <span className="dt-filter-label">Could fit other positions? Which?</span>
                        <input type="text" name="other_positions_fit" defaultValue={cand.other_positions_fit ?? ""} className="dt-filter-input" />
                      </label>
                    </>
                  )}

                  {s.key === "sent_to_client" && (
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <YN name="updated_profile_ready" value={cand.updated_profile_ready} label="Updated profile/resume ready?" />
                      <YN name="sent_to_client" value={cand.sent_to_client} label="Sent to client?" />
                      <label className="dt-filter" style={{ minWidth: 160 }}>
                        <span className="dt-filter-label">Date sent</span>
                        <input type="date" name="sent_at" defaultValue={dateVal(cand.sent_at)} className="dt-filter-input" />
                      </label>
                    </div>
                  )}

                  {s.key === "client_decision" && (
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <label className="dt-filter" style={{ minWidth: 160 }}>
                        <span className="dt-filter-label">Response</span>
                        <select name="client_response" defaultValue={cand.client_response ?? ""} className="dt-filter-input">
                          <option value="">—</option>
                          <option value="accepted">Accepted</option>
                          <option value="rejected">Rejected</option>
                          <option value="pending">Pending</option>
                        </select>
                      </label>
                      <label className="dt-filter" style={{ minWidth: 160 }}>
                        <span className="dt-filter-label">Date of response</span>
                        <input type="date" name="client_response_date" defaultValue={dateVal(cand.client_response_date)} className="dt-filter-input" />
                      </label>
                    </div>
                  )}

                  <div>
                    <button type="submit" className="dt-btn dt-btn-gold" style={{ fontSize: 12 }}>
                      <span>Save {s.short}</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
