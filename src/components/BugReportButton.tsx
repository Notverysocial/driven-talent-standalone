"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { createBugReport } from "@/app/bug-reports/actions";
import {
  BUG_SEVERITIES,
  BUG_SEVERITY_LABEL,
} from "@/lib/bug-reports";

type Phase = "idle" | "submitting" | "done";

export function BugReportButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const firstFieldRef = useRef<HTMLTextAreaElement | null>(null);

  // Suppress on the queue page itself — admins don't need to re-file a bug
  // from the queue view, and the floating button gets in the way of the
  // triage UI.
  const isQueuePage = pathname?.startsWith("/bug-reports") ?? false;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    // Defer focus to give the dialog a tick to mount.
    const t = setTimeout(() => firstFieldRef.current?.focus(), 30);
    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open]);

  if (isQueuePage) return null;

  function closeAndReset() {
    setOpen(false);
    // Re-arm the form for the next report after the dialog finishes closing.
    setTimeout(() => {
      setPhase("idle");
      setError(null);
    }, 200);
  }

  function onSubmit(formData: FormData) {
    setError(null);
    setPhase("submitting");
    startTransition(async () => {
      try {
        await createBugReport(formData);
        setPhase("done");
      } catch (e) {
        setPhase("idle");
        setError(e instanceof Error ? e.message : "Failed to submit");
      }
    });
  }

  const ua =
    typeof navigator !== "undefined" ? navigator.userAgent : "";

  return (
    <>
      <button
        type="button"
        className="dt-bug-fab"
        aria-label="Report a bug"
        onClick={() => setOpen(true)}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M8 2l1.5 2.5h5L16 2" />
          <rect x="6" y="6" width="12" height="12" rx="6" />
          <path d="M3 10h3M3 14h3M18 10h3M18 14h3M9 22v-4M15 22v-4" />
        </svg>
        <span>Report a bug</span>
      </button>

      {open && (
        <div
          className="dt-bug-modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeAndReset();
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dt-bug-modal-title"
            className="dt-card gold-edge dt-bug-modal"
          >
            <div className="dt-card-head">
              <div>
                <h3 id="dt-bug-modal-title">Report a bug</h3>
                <div className="sub">
                  Goes to the dev queue. Be specific — they&rsquo;ll follow up.
                </div>
              </div>
              <button
                type="button"
                className="dt-btn dt-btn-ghost"
                onClick={closeAndReset}
                aria-label="Close"
                style={{ padding: "4px 8px", fontSize: 14, letterSpacing: 0 }}
              >
                ✕
              </button>
            </div>

            {phase === "done" ? (
              <div
                style={{
                  padding: "32px 26px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                  alignItems: "flex-start",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "var(--dt-gold-deep)",
                  }}
                >
                  ✓ Submitted
                </div>
                <div style={{ fontSize: 13.5, color: "var(--dt-warm-700)", lineHeight: 1.5 }}>
                  Thanks — the report is in the dev queue. You can file another
                  or close this dialog.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="dt-btn"
                    onClick={() => {
                      setPhase("idle");
                      setError(null);
                    }}
                  >
                    <span>File another</span>
                  </button>
                  <button
                    type="button"
                    className="dt-btn dt-btn-primary"
                    onClick={closeAndReset}
                  >
                    <span>Done</span>
                  </button>
                </div>
              </div>
            ) : (
              <form
                action={onSubmit}
                style={{
                  padding: "18px 26px 22px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                }}
              >
                <input type="hidden" name="page_path" value={pathname ?? ""} />
                <input type="hidden" name="user_agent" value={ua} />

                <div
                  style={{
                    fontSize: 11,
                    letterSpacing: "0.14em",
                    color: "var(--dt-warm-500)",
                  }}
                >
                  <span style={{ textTransform: "uppercase" }}>On page</span>
                  {" · "}
                  <span className="tab-num" style={{ color: "var(--dt-black)" }}>
                    {pathname || "/"}
                  </span>
                </div>

                <label className="dt-filter">
                  <span className="dt-filter-label">
                    What went wrong? <span style={{ color: "var(--dt-danger)" }}>*</span>
                  </span>
                  <textarea
                    ref={firstFieldRef}
                    name="description"
                    rows={4}
                    required
                    className="dt-filter-input"
                    style={{ resize: "vertical", minHeight: 80 }}
                    placeholder="Briefly describe what you saw vs. what you expected."
                  />
                </label>

                <label className="dt-filter">
                  <span className="dt-filter-label">Steps to reproduce</span>
                  <textarea
                    name="steps_to_reproduce"
                    rows={3}
                    className="dt-filter-input"
                    style={{ resize: "vertical", minHeight: 60 }}
                    placeholder="1. ... 2. ... 3. ..."
                  />
                </label>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <label className="dt-filter">
                    <span className="dt-filter-label">Severity</span>
                    <select
                      name="severity"
                      defaultValue="medium"
                      className="dt-filter-input"
                    >
                      {BUG_SEVERITIES.map((s) => (
                        <option key={s} value={s}>
                          {BUG_SEVERITY_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="dt-filter">
                    <span className="dt-filter-label">Your name</span>
                    <input
                      name="reporter_name"
                      type="text"
                      className="dt-filter-input"
                      placeholder="So dev knows who to ask"
                    />
                  </label>
                </div>

                <label className="dt-filter">
                  <span className="dt-filter-label">Email (optional)</span>
                  <input
                    name="reporter_email"
                    type="email"
                    className="dt-filter-input"
                    placeholder="For follow-up if dev needs more info"
                  />
                </label>

                <label className="dt-filter">
                  <span className="dt-filter-label">Screenshot link (optional)</span>
                  <input
                    name="attachment_path"
                    type="text"
                    className="dt-filter-input"
                    placeholder="Paste a Drive / Slack / image URL"
                  />
                </label>

                {error && (
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--dt-danger)",
                      background: "rgba(178, 58, 58, 0.06)",
                      border: "1px solid rgba(178, 58, 58, 0.2)",
                      padding: "8px 12px",
                    }}
                  >
                    {error}
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 8,
                    marginTop: 4,
                  }}
                >
                  <button
                    type="button"
                    className="dt-btn"
                    onClick={closeAndReset}
                    disabled={isPending || phase === "submitting"}
                  >
                    <span>Cancel</span>
                  </button>
                  <button
                    type="submit"
                    className="dt-btn dt-btn-gold"
                    disabled={isPending || phase === "submitting"}
                  >
                    <span>
                      {phase === "submitting" ? "Submitting…" : "Submit report"}
                    </span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
