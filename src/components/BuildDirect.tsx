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
 * No external dependencies beyond React. Tailwind classes used for styling
 * — assumes Tailwind is configured in the host project.
 */
export default function BuildDirect() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<Severity>("normal");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [state, setState] = useState<SubmissionState>({ status: "idle" });

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      // Small delay so the close animation completes first
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

  // The floating button
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Report an issue or request a fix"
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-neutral-900 px-4 py-3 text-sm font-medium text-white shadow-lg ring-1 ring-black/10 transition hover:bg-neutral-800 hover:shadow-xl"
        style={{ fontFamily: "system-ui, sans-serif" }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
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

  // The modal
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && setOpen(false)}
      style={{ fontFamily: "system-ui, sans-serif" }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        {state.status === "success" ? (
          <div className="text-center">
            <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-neutral-900">Submitted — thank you.</h2>
            <p className="mt-2 text-sm text-neutral-600">
              Ticket <span className="font-mono font-medium text-neutral-900">#{state.ticketId}</span> is in our queue. Antonio's been notified. Expect a fix within 4 hours on weekends, 30 minutes during business hours.
            </p>
            <button
              onClick={() => setOpen(false)}
              className="mt-5 inline-flex items-center justify-center rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-neutral-900">Build Direct</h2>
                <p className="mt-0.5 text-xs text-neutral-500">
                  Spotted a bug, polish request, or question? Send it to us — we'll fix it.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="-mr-2 -mt-2 rounded-lg p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <label className="mb-3 block">
              <span className="mb-1 block text-xs font-medium text-neutral-700">Title</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What's the issue, in one line"
                required
                maxLength={120}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none ring-0 placeholder:text-neutral-400 focus:border-neutral-900"
              />
            </label>

            <label className="mb-3 block">
              <span className="mb-1 block text-xs font-medium text-neutral-700">Description</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What happened, where, and what you expected to happen"
                required
                rows={4}
                maxLength={2000}
                className="w-full resize-y rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900"
              />
            </label>

            <div className="mb-3 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-neutral-700">Severity</span>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as Severity)}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900"
                >
                  <option value="low">Low — cosmetic / nice-to-have</option>
                  <option value="normal">Normal — broken but workable</option>
                  <option value="high">High — blocking my team</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-neutral-700">Screenshot (optional)</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => e.target.files?.[0] && handleScreenshot(e.target.files[0])}
                  className="block w-full text-xs text-neutral-600 file:mr-2 file:rounded-lg file:border file:border-neutral-300 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-neutral-700 hover:file:bg-neutral-50"
                />
              </label>
            </div>

            {screenshot && (
              <div className="mb-3">
                <img
                  src={screenshot}
                  alt="Attached screenshot preview"
                  className="max-h-32 rounded-lg border border-neutral-200"
                />
                <button
                  type="button"
                  onClick={() => setScreenshot(null)}
                  className="mt-1 text-xs text-neutral-500 hover:text-neutral-700"
                >
                  Remove screenshot
                </button>
              </div>
            )}

            {state.status === "error" && (
              <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                Couldn't send — {state.error}. Email Antonio directly at artemisexecutiveclub@gmail.com.
              </div>
            )}

            <div className="flex items-center justify-between">
              <p className="text-xs text-neutral-500">
                Auto-captured: this page URL + your browser info
              </p>
              <button
                type="submit"
                disabled={state.status === "submitting" || !title.trim() || !description.trim()}
                className="inline-flex items-center justify-center rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
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
