"use client";

import { useState, useTransition } from "react";
import type { Recruiter } from "@/lib/supabase/types";
import { addRecruiter, removeRecruiter, setRecruiterActive } from "./actions";

// Phase-1 #3 — self-serve recruiter management. Rendered only for admins (the
// parent gates on role). The server actions also assert the admin role, so
// this is defence-in-depth, not the only guard.
export function RecruiterAdmin({ recruiters }: { recruiters: Recruiter[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<void>) => {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Action failed");
      }
    });
  };

  return (
    <div className="dt-card" style={{ marginBottom: 18, padding: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="dt-card-head"
        style={{
          width: "100%",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          font: "inherit",
        }}
      >
        <div>
          <h3>Manage Recruiters</h3>
          <div className="sub">
            {recruiters.length} on the roster · admin only · add or retire
          </div>
        </div>
        <span className="dt-btn dt-btn-ghost" style={{ fontSize: 11 }}>
          {open ? "Hide" : "Manage"}
        </span>
      </button>

      {open && (
        <div style={{ padding: "16px 22px" }}>
          {error && (
            <div
              role="alert"
              style={{ color: "var(--dt-danger)", fontSize: 12, marginBottom: 12 }}
            >
              {error}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {recruiters.map((r) => (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 0",
                  borderBottom: "1px solid var(--dt-warm-100)",
                }}
              >
                <span style={{ flex: 1, fontSize: 13, opacity: r.active ? 1 : 0.5 }}>
                  {r.name}
                  {r.email && (
                    <span className="muted" style={{ fontSize: 11, marginLeft: 8 }}>
                      {r.email}
                    </span>
                  )}
                  {!r.active && (
                    <span
                      style={{
                        fontSize: 10,
                        marginLeft: 8,
                        color: "var(--dt-warm-500)",
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                      }}
                    >
                      Retired
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  className="dt-btn dt-btn-ghost"
                  style={{ fontSize: 10.5, padding: "3px 10px" }}
                  disabled={pending}
                  onClick={() => run(() => setRecruiterActive(r.id, !r.active))}
                >
                  {r.active ? "Retire" : "Reactivate"}
                </button>
                <button
                  type="button"
                  className="dt-btn dt-btn-ghost"
                  style={{ fontSize: 10.5, padding: "3px 10px", color: "var(--dt-danger)" }}
                  disabled={pending}
                  onClick={() => {
                    if (
                      confirm(
                        `Remove ${r.name} from the roster? Their existing candidates keep their name and move to an "other" tab.`,
                      )
                    ) {
                      run(() => removeRecruiter(r.id));
                    }
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <form
            action={(fd) => run(() => addRecruiter(fd))}
            style={{ display: "grid", gridTemplateColumns: "1.2fr 1.2fr auto", gap: 8, alignItems: "end" }}
          >
            <label className="dt-filter">
              <span className="dt-filter-label">New recruiter name</span>
              <input name="name" type="text" required className="dt-filter-input" placeholder="Full name" />
            </label>
            <label className="dt-filter">
              <span className="dt-filter-label">Email (optional)</span>
              <input name="email" type="email" className="dt-filter-input" placeholder="name@driven…" />
            </label>
            <button type="submit" className="dt-btn dt-btn-primary" disabled={pending}>
              + Add
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
