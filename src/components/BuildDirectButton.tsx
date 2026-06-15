"use client";

import { useCallback, useState } from "react";

type Severity = "low" | "normal" | "high";

interface SubmissionState {
  status: "idle" | "submitting" | "success" | "error";
  ticketId?: string;
  error?: string;
}

/**
 * Build Direct — dashboard header button + modal.
 *
 * Renders a `.dt-btn` outline button that sits alongside the other Topbar
 * actions (Timecards / Pipeline / View Roster) and opens a request modal.
 * On submit it POSTs to /api/build-direct/submit, which inserts a row into
 * the in-app `bug_reports` triage queue and returns the row UUID as
 * `ticketId`.
 *
 * Self-contained on purpose: it does not depend on the floating
 * `<BuildDirect />` widget, so the dashboard header trigger keeps working
 * regardless of that component's state.
 *
 * `label` is passed from the dashboard server component so the text stays
 * in the i18n dictionary (e.g. "+ Build Direct").
 */
export default function BuildDirectButton({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<Severity>("normal");
  const [state, setState] = useState<SubmissionState>({ status: "idle" });

  const close = useCallback(() => {
    setOpen(false);
    if (state.status === "success") {
      setTitle("");
      setDescription("");
      setSeverity("normal");
      setState({ status: "idle" });
    }
  }, [state.status]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!title.trim() || !description.trim()) return;

      setState({ status: "submitting" });

      try {
        const res = await fetch("/api/build-direct/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim(),
            severity,
            pageUrl: typeof window !== "undefined" ? window.location.href : "",
            userAgent:
              typeof navigator !== "undefined" ? navigator.userAgent : "",
          }),
        });

        if (!res.ok) {
          const errorText = await res.text().catch(() => "Unknown error");
          throw new Error(errorText || `HTTP ${res.status}`);
        }

        const data = await res.json();
        setState({ status: "success", ticketId: data.ticketId });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setState({ status: "error", error: message });
      }
    },
    [title, description, severity],
  );

  const fonts = "system-ui, -apple-system, sans-serif";

  return (
    <>
      <button type="button" className="dt-btn" onClick={() => setOpen(true)}>
        {label}
      </button>

      {open && (
        <div
          onClick={(e) => e.target === e.currentTarget && close()}
          role="dialog"
          aria-modal="true"
          aria-label="Build Direct submission form"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9001,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            fontFamily: fonts,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 520,
              background: "#ffffff",
              borderRadius: 16,
              padding: 24,
              boxShadow: "0 24px 60px rgba(0,0,0,0.30)",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
          >
            {state.status === "success" ? (
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    background: "#dcfce7",
                    marginBottom: 12,
                  }}
                >
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#16a34a"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: 18,
                    fontWeight: 700,
                    color: "#0a0a0a",
                  }}
                >
                  Submitted. Thank you.
                </h2>
                <p
                  style={{
                    margin: "10px 0 0 0",
                    fontSize: 13,
                    color: "#525252",
                    lineHeight: 1.5,
                  }}
                >
                  Ticket{" "}
                  <span
                    style={{
                      fontFamily: "ui-monospace, monospace",
                      fontWeight: 600,
                      color: "#0a0a0a",
                    }}
                  >
                    #{state.ticketId}
                  </span>{" "}
                  is in the build queue.
                </p>
                <button
                  onClick={close}
                  style={{
                    marginTop: 20,
                    padding: "10px 20px",
                    background: "#111111",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: fonts,
                  }}
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    marginBottom: 16,
                  }}
                >
                  <div>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: 18,
                        fontWeight: 700,
                        color: "#0a0a0a",
                      }}
                    >
                      Build Direct
                    </h2>
                    <p
                      style={{
                        margin: "4px 0 0 0",
                        fontSize: 12,
                        color: "#737373",
                      }}
                    >
                      Spotted a bug, polish request, or question? We&apos;ll fix
                      it.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={close}
                    aria-label="Close"
                    style={{
                      marginTop: -8,
                      marginRight: -8,
                      padding: 8,
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      color: "#737373",
                      borderRadius: 8,
                    }}
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                </div>

                <label style={{ display: "block", marginBottom: 12 }}>
                  <span style={labelStyle}>Title</span>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="What's the issue, in one line"
                    required
                    maxLength={120}
                    style={inputStyle}
                  />
                </label>

                <label style={{ display: "block", marginBottom: 12 }}>
                  <span style={labelStyle}>Description</span>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What happened, where, and what you expected to happen"
                    required
                    rows={4}
                    maxLength={2000}
                    style={{ ...inputStyle, resize: "vertical", minHeight: 90 }}
                  />
                </label>

                <label style={{ display: "block", marginBottom: 12 }}>
                  <span style={labelStyle}>Severity</span>
                  <select
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value as Severity)}
                    style={inputStyle}
                  >
                    <option value="low">Low: cosmetic</option>
                    <option value="normal">Normal: broken but workable</option>
                    <option value="high">High: blocking my team</option>
                  </select>
                </label>

                {state.status === "error" && (
                  <div
                    style={{
                      marginBottom: 12,
                      padding: "8px 12px",
                      background: "#fef2f2",
                      color: "#b91c1c",
                      fontSize: 11,
                      borderRadius: 8,
                      lineHeight: 1.5,
                    }}
                  >
                    Couldn&apos;t send. {state.error}
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <p style={{ margin: 0, fontSize: 11, color: "#a3a3a3" }}>
                    Auto-captured: page URL + browser info
                  </p>
                  <button
                    type="submit"
                    disabled={
                      state.status === "submitting" ||
                      !title.trim() ||
                      !description.trim()
                    }
                    style={{
                      padding: "10px 18px",
                      background:
                        state.status === "submitting" ||
                        !title.trim() ||
                        !description.trim()
                          ? "#a3a3a3"
                          : "#111111",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor:
                        state.status === "submitting" ||
                        !title.trim() ||
                        !description.trim()
                          ? "not-allowed"
                          : "pointer",
                      fontFamily: fonts,
                    }}
                  >
                    {state.status === "submitting" ? "Sending..." : "Send"}
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

const inputStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 8,
  border: "1px solid #d4d4d4",
  padding: "8px 12px",
  fontSize: 13,
  color: "#0a0a0a",
  outline: "none",
  fontFamily: "system-ui, -apple-system, sans-serif",
  background: "#ffffff",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 4,
  fontSize: 11,
  fontWeight: 600,
  color: "#404040",
};
