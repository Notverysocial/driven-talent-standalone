"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { markCandidateDoNotReturn } from "../actions";
import { reactivateCandidate } from "../actions";

// Do Not Return control (card 526923b0) for the candidate header. When the
// candidate is not yet flagged, offers "Mark Do Not Return" behind a reason
// prompt. When already flagged, offers to remove them from the list.
export function DoNotReturnActions({
  candidateId,
  isDnr,
}: {
  candidateId: string;
  isDnr: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPending) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const t = setTimeout(() => textRef.current?.focus(), 30);
    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open, isPending]);

  if (isDnr) {
    return (
      <button
        type="button"
        className="dt-btn"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await reactivateCandidate(candidateId);
          })
        }
      >
        <span>{isPending ? "Working…" : "Remove from Do Not Return"}</span>
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        className="dt-btn"
        disabled={isPending}
        onClick={() => setOpen(true)}
        style={{ borderColor: "var(--dt-danger)", color: "var(--dt-danger)" }}
      >
        <span>Mark Do Not Return</span>
      </button>

      {open && (
        <div
          className="dt-bug-modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !isPending) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="dnr-title"
            className="dt-card gold-edge dt-bug-modal"
            style={{ maxWidth: 460 }}
          >
            <div className="dt-card-head">
              <div>
                <h3 id="dnr-title">Add to Do Not Return list</h3>
                <div className="sub">
                  This candidate will be flagged so recruiters don&apos;t
                  re-engage them, and set to &ldquo;Do Not Send&rdquo;.
                </div>
              </div>
            </div>
            <div style={{ padding: "6px 26px 0" }}>
              <label
                className="dt-filter-label"
                htmlFor="dnr-reason"
                style={{ display: "block", marginBottom: 6 }}
              >
                Reason (why not re-engage?)
              </label>
              <textarea
                id="dnr-reason"
                ref={textRef}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="dt-filter-input"
                style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
                placeholder="e.g. No-showed two placements, unprofessional on site…"
              />
            </div>
            <div
              style={{
                padding: "16px 26px 22px",
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button
                type="button"
                className="dt-btn"
                onClick={() => setOpen(false)}
                disabled={isPending}
              >
                <span>Cancel</span>
              </button>
              <button
                type="button"
                className="dt-btn dt-btn-primary"
                disabled={isPending || reason.trim() === ""}
                onClick={() =>
                  startTransition(async () => {
                    await markCandidateDoNotReturn(candidateId, reason);
                    setOpen(false);
                  })
                }
                style={{
                  background: "var(--dt-danger)",
                  borderColor: "var(--dt-danger)",
                  color: "#fff",
                }}
              >
                <span>{isPending ? "Working…" : "Add to Do Not Return"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
