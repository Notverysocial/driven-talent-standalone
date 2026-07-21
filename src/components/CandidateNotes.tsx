"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CallOutcome, CandidateNote, NoteSubjectType } from "@/lib/supabase/types";
// Shared with the server action so the labels cannot drift apart.
import { CALL_OUTCOMES as OUTCOMES, outcomeLabel } from "@/lib/notes";
const OUTCOME_TONE: Record<CallOutcome, { bg: string; fg: string }> = {
  reached:      { bg: "rgba(79,122,58,0.12)",  fg: "var(--dt-success)" },
  no_answer:    { bg: "rgba(245,166,35,0.14)", fg: "var(--dt-gold-deep)" },
  left_message: { bg: "rgba(245,166,35,0.14)", fg: "var(--dt-gold-deep)" },
  declined:     { bg: "rgba(176,58,46,0.10)",  fg: "var(--dt-danger)" },
};
import { addNote, setFollowupStatus } from "@/lib/notes.actions";

/**
 * Threaded / authored / @mention / follow-up notes log (Estefany 2026-07-06).
 * Reused verbatim across candidate, onboarding, and employee records via the
 * `subjectType` prop. Author + timestamp are stamped server-side (never
 * manual); the log renders newest-first.
 *
 * Extended 2026-07-20 for Leangel's request, WITHOUT forking the component:
 *   - `subjectType="applicant"` now works, so the same log covers the stage
 *     before promotion (migration 0050 widened the CHECK constraint).
 *   - `allowPhoneScreen` reveals a call-outcome composer. Opt-in rather than
 *     always-on so enabling it per surface stays a one-prop decision.
 *   - entries flagged `from_applicant_stage` are labelled, so notes carried
 *     across promotion are visibly attributed to the earlier stage instead of
 *     silently appearing as candidate notes.
 *
 * NOTE(mockup): keeps the current look (clean white card, gold accents). The
 * exact visual treatment of the log entries is not mockup-governed in the
 * change-set, so this uses the established dt-* design system.
 */
export type DisplayNote = CandidateNote & { from_applicant_stage?: boolean };

export function CandidateNotes({
  subjectType,
  subjectId,
  notes,
  allowPhoneScreen = false,
}: {
  subjectType: NoteSubjectType;
  subjectId: string;
  notes: DisplayNote[];
  /** Show the phone-screen outcome composer (applicant + candidate views). */
  allowPhoneScreen?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [followup, setFollowup] = useState(false);
  const [body, setBody] = useState("");
  // Phone-screen mode. `outcome` doubles as the mode flag: a note carries an
  // outcome exactly when it is a phone screen, matching the DB constraint.
  const [callMode, setCallMode] = useState(false);
  const [outcome, setOutcome] = useState<CallOutcome | "">("");

  function fmt(ts: string) {
    return new Date(ts).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function toggleResolved(note: CandidateNote) {
    const next = note.followup_status === "resolved" ? "in_review" : "resolved";
    startTransition(async () => {
      await setFollowupStatus(note.id, next, subjectType, subjectId);
      router.refresh();
    });
  }

  return (
    <div>
      {/* Composer */}
      <form
        action={async (fd) => {
          startTransition(async () => {
            await addNote(subjectType, subjectId, fd);
            setBody("");
            setFollowup(false);
            setCallMode(false);
            setOutcome("");
            router.refresh();
          });
        }}
        style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}
      >
        <textarea
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            callMode
              ? "What happened on the call? (optional — the outcome alone is recorded)"
              : "Add a note. Use @Name to tag a teammate…"
          }
          rows={3}
          disabled={pending}
          style={{
            width: "100%",
            padding: "12px 14px",
            background: "var(--dt-warm-50)",
            border: "1px solid var(--dt-warm-150)",
            fontSize: 13.5,
            lineHeight: 1.6,
            color: "var(--dt-warm-700)",
            fontFamily: "inherit",
            resize: "vertical",
            outline: "none",
          }}
        />
        {/* Phone-screen outcome. The gap Leangel reported: you can schedule a
            phone screen from this record and then have nowhere to say what
            happened on it. */}
        {allowPhoneScreen && (
          <div
            style={{
              border: "1px solid var(--dt-warm-150)",
              background: callMode ? "var(--dt-warm-50)" : "transparent",
              padding: callMode ? "12px 14px" : "8px 14px",
            }}
          >
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--dt-warm-700)" }}>
              <input
                type="checkbox"
                checked={callMode}
                disabled={pending}
                onChange={(e) => {
                  setCallMode(e.target.checked);
                  if (!e.target.checked) setOutcome("");
                }}
              />
              Log a phone screen
            </label>

            {callMode && (
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <div className="dt-filter-label" style={{ marginBottom: 6 }}>
                    What happened? <span style={{ color: "var(--dt-danger)" }}>*</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {OUTCOMES.map((o) => (
                      <label
                        key={o.id}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 6,
                          fontSize: 12.5, padding: "5px 10px", cursor: "pointer",
                          border: `1px solid ${outcome === o.id ? "var(--dt-gold)" : "var(--dt-warm-150)"}`,
                          background: outcome === o.id ? "var(--dt-warm-100)" : "var(--dt-white, #fff)",
                        }}
                      >
                        <input
                          type="radio"
                          name="call_outcome"
                          value={o.id}
                          checked={outcome === o.id}
                          disabled={pending}
                          onChange={() => setOutcome(o.id)}
                        />
                        {o.label}
                      </label>
                    ))}
                  </div>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                  <span className="dt-filter-label" style={{ margin: 0, whiteSpace: "nowrap" }}>
                    Next step
                  </span>
                  <input
                    name="next_step"
                    type="text"
                    placeholder="e.g. Send to client, schedule interview, call back Monday"
                    className="dt-filter-input"
                    disabled={pending}
                    style={{ flex: 1, minWidth: 0 }}
                  />
                </label>
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--dt-warm-700)" }}>
            <input
              type="checkbox"
              name="followup_required"
              checked={followup}
              onChange={(e) => setFollowup(e.target.checked)}
            />
            Follow-up required?
          </label>
          {followup && (
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
              <span className="dt-filter-label" style={{ margin: 0 }}>Assign to</span>
              <input
                name="followup_assignee"
                type="text"
                placeholder="Teammate name"
                className="dt-filter-input"
                style={{ maxWidth: 180 }}
              />
              <span
                className="tiny muted"
                style={{ letterSpacing: "0.08em", textTransform: "uppercase" }}
                title="New follow-ups open as In Review"
              >
                In Review
              </span>
            </label>
          )}
          <button
            type="submit"
            disabled={pending || (callMode ? outcome === "" : body.trim() === "")}
            className="dt-btn dt-btn-gold"
            style={{ marginLeft: "auto", fontSize: 12 }}
          >
            <span>
              {pending ? "Saving…" : callMode ? "Log call" : "Add note"}
            </span>
          </button>
        </div>
      </form>

      {/* Chronological log — newest first */}
      {notes.length === 0 ? (
        <div style={{ padding: "24px 0", color: "var(--dt-warm-500)", fontStyle: "italic", fontSize: 13, textAlign: "center" }}>
          {allowPhoneScreen
            ? "No notes yet. Add a comment, or log a phone screen above."
            : "No notes yet."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {notes.map((note, i) => (
            <div
              key={note.id}
              style={{
                padding: "14px 2px",
                borderTop: i === 0 ? "none" : "1px solid var(--dt-warm-100)",
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 500, fontSize: 13 }}>{note.author_name}</span>
                <span className="tab-num tiny muted">{fmt(note.created_at)}</span>
                {note.note_kind === "phone_screen" && note.call_outcome && (
                  <span
                    style={{
                      fontSize: 10.5, fontWeight: 600, letterSpacing: "0.06em",
                      textTransform: "uppercase", padding: "2px 8px", borderRadius: 3,
                      background: OUTCOME_TONE[note.call_outcome].bg,
                      color: OUTCOME_TONE[note.call_outcome].fg,
                    }}
                  >
                    ☎ {outcomeLabel(note.call_outcome)}
                  </span>
                )}
                {note.from_applicant_stage && (
                  // Carried across promotion. Labelled rather than silently
                  // merged, so it is clear this was written before the
                  // applicant became a candidate.
                  <span
                    className="tiny muted"
                    style={{
                      fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase",
                      padding: "2px 8px", borderRadius: 3, background: "var(--dt-warm-100)",
                    }}
                    title="Written while this person was still an applicant, before promotion to the pipeline"
                  >
                    From application
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--dt-warm-700)", marginTop: 4, whiteSpace: "pre-wrap" }}>
                {renderBody(note.body)}
              </div>
              {note.note_kind === "phone_screen" && note.next_step && (
                <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--dt-warm-700)" }}>
                  <span className="tiny muted" style={{ letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    Next step
                  </span>{" "}
                  {note.next_step}
                </div>
              )}
              {note.followup_required && (
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      padding: "2px 8px",
                      borderRadius: 3,
                      background:
                        note.followup_status === "resolved"
                          ? "rgba(79,122,58,0.12)"
                          : "rgba(245,166,35,0.14)",
                      color:
                        note.followup_status === "resolved"
                          ? "var(--dt-success)"
                          : "var(--dt-gold-deep)",
                    }}
                  >
                    Follow-up · {note.followup_status === "resolved" ? "Resolved" : "In Review"}
                  </span>
                  {note.followup_assignee && (
                    <span className="tiny muted">→ {note.followup_assignee}</span>
                  )}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => toggleResolved(note)}
                    className="dt-btn dt-btn-ghost tiny"
                    style={{ padding: "2px 8px", fontSize: 11 }}
                  >
                    {note.followup_status === "resolved" ? "Reopen" : "Mark Resolved"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Bold @mentions inline so tagged teammates stand out in the log.
function renderBody(body: string) {
  const parts = body.split(/(@[A-Za-z][\w'-]*(?:\s+[A-Z][\w'-]*)?)/g);
  return parts.map((p, i) =>
    p.startsWith("@") ? (
      <span key={i} style={{ color: "var(--dt-gold-deep)", fontWeight: 500 }}>
        {p}
      </span>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}
