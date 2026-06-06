"use client";

import { useState, useCallback, useEffect } from "react";

type Severity = "low" | "normal" | "high";

interface SubmissionState {
  status: "idle" | "submitting" | "success" | "error";
  ticketId?: string;
  error?: string;
}

/**
 * Build Direct widget — floating feedback button.
 *
 * Drop <BuildDirect /> anywhere in the global layout (e.g. <body> in
 * app/layout.tsx) and it renders bottom-right on every page.
 *
 * On submit it POSTs to /api/build-direct/submit with:
 *   - title (string)
 *   - description (string)
 *   - severity ("low" | "normal" | "high")
 *   - pageUrl (auto-captured from window.location)
 *   - screenshot (optional, base64 PNG)
 *
 * The endpoint creates a ClickUp task in list 901714336938 ("DT Live Fix Queue")
 * and emails Antonio. The user receives a ticket ID for tracking.
 *
 * Layout is all inline styles (no Tailwind dependency) — works regardless of
 * the host project's CSS pipeline. The existing dashboard already has a
 * "Report a bug" FAB in bottom-right, so this one sits OFFSET to its left
 * to avoid collision.
 */
export default function BuildDirect() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<Severity>("normal");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [state, setState] = useState<SubmissionState>({ status: "idle" });

  // Reset state after success when modal closes
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        if (state.status === "success") {
          setTitle("");
          setDescription("");
          setSeverity("normal");
          setScreenshot(null);
          setState({ status: "idle" });
        }
      }, 200);
      return () => clearTimeout(t);
    }
  }, [open, state.status]);

  const handleScreenshot = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("Screenshot too large (max 5MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setScreenshot(reader.result as string);
    };
    reader.readAsDataURL(file);
  }, []);

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
            userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
            screenshot,
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
    [title, description, severity, screenshot]
  );

  const fonts = "system-ui, -apple-system, sans-serif";

  // The floating button (closed state)
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open Build Direct — report an issue or request a fix"
        style={{
          position: "fixed",
          bottom: 24,
          right: 96,
          zIndex: 9000,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          borderRadius: 9999,
          background: "#111111",
          color: "#ffffff",
          padding: "12px 18px",
          border: "none",
          fontFamily: fonts,
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: "0.01em",
          boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
          cursor: "pointer",
          transition: "transform 120ms ease, box-shadow 120ms ease",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
          (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 8px 28px rgba(0,0,0,0.24)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
          (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 20px rgba(0,0,0,0.18)";
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>
        Build Direct
      </button>
    );
  }

  // The modal (open state)
  return (
    <div
      onClick={(e) => e.target === e.currentTarget && setOpen(false)}
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
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0a0a0a" }}>
              Submitted — thank you.
            </h2>
            <p style={{ margin: "10px 0 0 0", fontSize: 13, color: "#525252", lineHeight: 1.5 }}>
              Ticket{" "}
              <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 600, color: "#0a0a0a" }}>
                #{state.ticketId}
              </span>{" "}
              is in our queue. Antonio&apos;s been notified. Expect a response within 4 hours on weekends, under 30 minutes during business hours.
            </p>
            <button
              onClick={() => setOpen(false)}
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
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0a0a0a" }}>Build Direct</h2>
                <p style={{ margin: "4px 0 0 0", fontSize: 12, color: "#737373" }}>
                  Spotted a bug, polish request, or question? We&apos;ll fix it.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
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
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <Field label="Title">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What's the issue, in one line"
                required
                maxLength={120}
                style={inputStyle}
              />
            </Field>

            <Field label="Description">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What happened, where, and what you expected to happen"
                required
                rows={4}
                maxLength={2000}
                style={{ ...inputStyle, resize: "vertical", minHeight: 90 }}
              />
            </Field>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <Field label="Severity">
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as Severity)}
                  style={inputStyle}
                >
                  <option value="low">Low — cosmetic</option>
                  <option value="normal">Normal — broken but workable</option>
                  <option value="high">High — blocking my team</option>
                </select>
              </Field>
              <Field label="Screenshot (optional)">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => e.target.files?.[0] && handleScreenshot(e.target.files[0])}
                  style={{ ...inputStyle, padding: "6px 8px" }}
                />
              </Field>
            </div>

            {screenshot && (
              <div style={{ marginBottom: 12 }}>
                <img
                  src={screenshot}
                  alt="Attached screenshot preview"
                  style={{ maxHeight: 120, borderRadius: 8, border: "1px solid #e5e5e5" }}
                />
                <button
                  type="button"
                  onClick={() => setScreenshot(null)}
                  style={{
                    display: "block",
                    marginTop: 4,
                    background: "transparent",
                    border: "none",
                    color: "#737373",
                    fontSize: 11,
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  Remove screenshot
                </button>
              </div>
            )}

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
                Couldn&apos;t send — {state.error}. Email Antonio directly at artemisexecutiveclub@gmail.com.
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <p style={{ margin: 0, fontSize: 11, color: "#a3a3a3" }}>
                Auto-captured: page URL + browser info
              </p>
              <button
                type="submit"
                disabled={state.status === "submitting" || !title.trim() || !description.trim()}
                style={{
                  padding: "10px 18px",
                  background:
                    state.status === "submitting" || !title.trim() || !description.trim() ? "#a3a3a3" : "#111111",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor:
                    state.status === "submitting" || !title.trim() || !description.trim() ? "not-allowed" : "pointer",
                  fontFamily: fonts,
                }}
              >
                {state.status === "submitting" ? "Sending…" : "Send to Antonio"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span
        style={{
          display: "block",
          marginBottom: 4,
          fontSize: 11,
          fontWeight: 600,
          color: "#404040",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
