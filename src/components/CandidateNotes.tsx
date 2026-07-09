"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CandidateNote, NoteSubjectType } from "@/lib/supabase/types";
import { addNote, setFollowupStatus } from "@/lib/notes.actions";

/**
 * Threaded / authored / @mention / follow-up notes log (Estefany 2026-07-06).
 * Reused verbatim across candidate, onboarding, and employee records via the
 * `subjectType` prop. Author + timestamp are stamped server-side (never
 * manual); the log renders newest-first.
 *
 * NOTE(mockup): keeps the current look (clean white card, gold accents). The
 * exact visual treatment of the log entries is not mockup-governed in the
 * change-set, so this uses the established dt-* design system.
 */
export function CandidateNotes({
  subjectType,
  subjectId,
  notes,
}: {
  subjectType: NoteSubjectType;
  subjectId: string;
  notes: CandidateNote[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [followup, setFollowup] = useState(false);
  const [body, setBody] = useState("");

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
            router.refresh();
          });
        }}
        style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}
      >
        <textarea
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a note. Use @Name to tag a teammate…"
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
            disabled={pending || body.trim() === ""}
            className="dt-btn dt-btn-gold"
            style={{ marginLeft: "auto", fontSize: 12 }}
          >
            <span>{pending ? "Saving…" : "Add note"}</span>
          </button>
        </div>
      </form>

      {/* Chronological log — newest first */}
      {notes.length === 0 ? (
        <div style={{ padding: "24px 0", color: "var(--dt-warm-500)", fontStyle: "italic", fontSize: 13, textAlign: "center" }}>
          No notes yet.
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
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--dt-warm-700)", marginTop: 4, whiteSpace: "pre-wrap" }}>
                {renderBody(note.body)}
              </div>
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
