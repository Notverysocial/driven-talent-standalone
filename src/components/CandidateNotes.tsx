"use client";

import { useRef, useState, useTransition } from "react";
import {
  ATTACHMENT_ACCEPT,
  NOTE_ATTACHMENT_BUCKET,
  attachmentHref,
  checkAttachments,
  formatBytes,
  resolveMime,
  type NoteAttachment,
  type UploadedAttachment,
} from "@/lib/note-attachments";
import { createClient as createBrowserSupabase } from "@/lib/supabase/client";
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
import {
  addNote,
  discardNoteAttachmentUploads,
  prepareNoteAttachmentUploads,
  setFollowupStatus,
} from "@/lib/notes.actions";

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
export type DisplayNote = CandidateNote & {
  from_applicant_stage?: boolean;
  /** Files attached to this note (migration 0052). */
  attachments?: NoteAttachment[];
};

export function CandidateNotes({
  subjectType,
  subjectId,
  notes,
  allowPhoneScreen = false,
  order = "newest-first",
  compact = false,
}: {
  subjectType: NoteSubjectType;
  subjectId: string;
  notes: DisplayNote[];
  /** Show the phone-screen outcome composer (applicant + candidate views). */
  allowPhoneScreen?: boolean;
  /** Record pages read newest-first; a list card reads as a thread, oldest-first. */
  order?: "newest-first" | "oldest-first";
  /** List-card mode: the thread first, the composer behind "+ Add note". */
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [followup, setFollowup] = useState(false);
  const [body, setBody] = useState("");
  // Phone-screen mode. `outcome` doubles as the mode flag: a note carries an
  // outcome exactly when it is a phone screen, matching the DB constraint.
  const [callMode, setCallMode] = useState(false);
  const [outcome, setOutcome] = useState<CallOutcome | "">("");
  // Attachments. Checked the moment they are picked, with the same rules the
  // server applies — so an oversized batch is caught here with a reason, not
  // refused by the framework as a bare 400 (the #92 failure shape).
  const [files, setFiles] = useState<File[]>([]);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const filesTotal = files.reduce((n, f) => n + f.size, 0);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(!compact);
  const shown =
    order === "oldest-first"
      ? [...notes].sort((a, b) => a.created_at.localeCompare(b.created_at))
      : notes;

  // Files go browser -> private bucket on signed upload URLs; the Server
  // Action only gets a manifest. Posting the bytes through it is what broke
  // on Vercel above ~4.5 MB (see DIRECT-TO-STORAGE in lib/note-attachments).
  async function uploadAttachments(
    picked: File[],
  ): Promise<{ ok: true; noteId: string; manifest: UploadedAttachment[] } | { ok: false; error: string }> {
    let prep: Awaited<ReturnType<typeof prepareNoteAttachmentUploads>>;
    try {
      prep = await prepareNoteAttachmentUploads(
        subjectType,
        subjectId,
        picked.map((f) => ({ name: f.name, size: f.size, type: f.type })),
      );
    } catch {
      return { ok: false, error: "Couldn't prepare the upload. Please try again." };
    }
    if (!prep.ok) return prep;
    if (prep.tickets.length !== picked.length) {
      return { ok: false, error: "Couldn't prepare the upload. Please try again." };
    }
    const sb = createBrowserSupabase();
    const done: UploadedAttachment[] = [];
    for (let i = 0; i < picked.length; i++) {
      const f = picked[i];
      const t = prep.tickets[i];
      setUploadMsg(picked.length > 1 ? `Uploading ${i + 1} of ${picked.length}…` : "Uploading…");
      const { error } = await sb.storage
        .from(NOTE_ATTACHMENT_BUCKET)
        .uploadToSignedUrl(t.path, t.token, f, { contentType: resolveMime(f.name, f.type) });
      if (error) {
        await discardNoteAttachmentUploads(subjectType, subjectId, prep.noteId, done.map((d) => d.path)).catch(() => {});
        return { ok: false, error: `Couldn't upload "${f.name}" (${error.message}). Nothing was saved — please try again.` };
      }
      done.push({ id: t.id, path: t.path, name: f.name });
    }
    setUploadMsg("Saving…");
    return { ok: true, noteId: prep.noteId, manifest: done };
  }

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

  const composer = (
      <form
        action={async (fd) => {
          startTransition(async () => {
            setSubmitErr(null);
            const picked = files.filter((f) => f.size > 0);
            let up: { noteId: string; manifest: UploadedAttachment[] } | null = null;
            if (picked.length > 0) {
              const r = await uploadAttachments(picked);
              if (!r.ok) {
                setUploadMsg(null);
                setSubmitErr(r.error);
                return;
              }
              up = r;
              fd.set("note_id", r.noteId);
              fd.set("attachments_manifest", JSON.stringify(r.manifest));
            }
            let result: Awaited<ReturnType<typeof addNote>>;
            try {
              result = await addNote(subjectType, subjectId, fd);
            } catch {
              // The save failed in transit: don't leave its files in the bucket.
              if (up) {
                await discardNoteAttachmentUploads(subjectType, subjectId, up.noteId, up.manifest.map((m) => m.path)).catch(() => {});
              }
              setUploadMsg(null);
              setSubmitErr("Couldn't save the note. Please try again.");
              return;
            }
            setUploadMsg(null);
            if (!result.ok) {
              setSubmitErr(result.error);
              return;
            }
            setSubmitErr(null);
            setBody("");
            setFollowup(false);
            setCallMode(false);
            setOutcome("");
            setFiles([]);
            setFileErr(null);
            if (fileInput.current) fileInput.current.value = "";
            if (compact) setComposerOpen(false);
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
        {/* Attachments — resumes, screenshots, ID documents. Stored privately
            and served only through short-lived signed links. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 12.5, color: "var(--dt-warm-700)", flexWrap: "wrap" }}>
            <span className="dt-filter-label" style={{ margin: 0 }}>Attach files</span>
            <input
              ref={fileInput}
              type="file"
              data-testid="note-attachments-input"
              multiple
              accept={ATTACHMENT_ACCEPT}
              disabled={pending}
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                const check = checkAttachments(picked);
                setFiles(picked);
                setFileErr(check.ok ? null : check.error);
                setSubmitErr(null);
              }}
              style={{ fontSize: 12 }}
            />
          </label>
          {fileErr ? (
            <div style={{ color: "var(--dt-danger)", fontSize: 12 }}>{fileErr}</div>
          ) : files.length > 0 ? (
            <div className="tiny muted" style={{ fontSize: 11.5 }}>
              {files.length} {files.length === 1 ? "file" : "files"} · {formatBytes(filesTotal)} — up to 25 MB each, 24 MB per note
            </div>
          ) : (
            <div className="tiny muted" style={{ fontSize: 11 }}>
              PDF, Word, Excel, text or images · up to 25 MB each
            </div>
          )}
        </div>
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
          {submitErr && (
            <span style={{ color: "var(--dt-danger)", fontSize: 12, flex: "1 1 100%" }}>{submitErr}</span>
          )}
          <button
            type="submit"
            disabled={
              pending ||
              !!fileErr ||
              (callMode ? outcome === "" : body.trim() === "" && files.length === 0)
            }
            className="dt-btn dt-btn-gold"
            style={{ marginLeft: "auto", fontSize: 12 }}
          >
            <span>
              {pending ? (uploadMsg ?? "Saving…") : callMode ? "Log call" : "Add note"}
            </span>
          </button>
        </div>
      </form>
  );

  // Chronological log — newest first on record pages, oldest first on cards.
  const log =
      shown.length === 0 ? (
        compact ? (
          <div style={{ padding: "4px 0", color: "var(--dt-warm-500)", fontStyle: "italic", fontSize: 12.5 }}>
            No notes yet.
          </div>
        ) : (
        <div style={{ padding: "24px 0", color: "var(--dt-warm-500)", fontStyle: "italic", fontSize: 13, textAlign: "center" }}>
          {allowPhoneScreen
            ? "No notes yet. Add a comment, or log a phone screen above."
            : "No notes yet."}
        </div>
        )
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {shown.map((note, i) => (
            <div
              key={note.id}
              data-testid={`note-${note.id}`}
              style={{
                padding: compact ? "10px 2px" : "14px 2px",
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
              {note.attachments && note.attachments.length > 0 && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                  {note.attachments.map((a) => (
                    <div
                      key={a.id}
                      data-testid={`note-attachment-${a.id}`}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
                        fontSize: 12.5, padding: "6px 10px",
                        border: "1px solid var(--dt-warm-150)", background: "var(--dt-warm-50)",
                      }}
                    >
                      <span aria-hidden>📎</span>
                      <a
                        href={attachmentHref(a.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontWeight: 500, color: "var(--dt-warm-700)" }}
                      >
                        {a.file_name}
                      </a>
                      <span className="tiny muted">{formatBytes(a.size_bytes)}</span>
                      <span className="tiny muted">
                        · uploaded by {a.uploaded_by_name} · {fmt(a.created_at)}
                      </span>
                      <a
                        href={`${attachmentHref(a.id)}?download=1`}
                        className="tiny"
                        style={{ marginLeft: "auto", color: "var(--dt-gold-deep)" }}
                      >
                        Download
                      </a>
                    </div>
                  ))}
                </div>
              )}
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
      );

  if (!compact) {
    return (
      <div>
        {composer}
        {log}
      </div>
    );
  }
  return (
    <div>
      {log}
      {composerOpen ? (
        <div style={{ marginTop: 10 }}>{composer}</div>
      ) : (
        <button
          type="button"
          onClick={() => setComposerOpen(true)}
          className="dt-btn dt-btn-ghost tiny"
          style={{ marginTop: 6, fontSize: 11, padding: "4px 10px" }}
        >
          + Add note
        </button>
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
