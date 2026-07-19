"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState, useTransition } from "react";
import { Badge } from "@/components/Badge";
import { Avatar } from "@/components/Avatar";
import { CalendlyScheduler } from "@/components/CalendlyScheduler";
import {
  buildCalendlyBookingUrl,
  CALENDLY_EVENT_TYPES,
} from "@/lib/integrations/calendly-events";
import { INTAKE_STATUSES, type ApplicationIntake } from "@/lib/recruiting";
import { IntakeResumeLink } from "./IntakeResumeLink";
import {
  promoteIntakeToCandidate,
  setIntakeStatus,
  updateIntake,
  claimIntake,
  reassignIntake,
} from "./actions";

export type IntakeCalendlyContext = {
  connected: boolean;
  schedulingUrl: string | null;
  phoneScreenSlug: string;
};

export function IntakeCard({
  intake,
  createdLabel,
  calendly,
  recruiters = [],
}: {
  intake: ApplicationIntake;
  createdLabel: string;
  calendly: IntakeCalendlyContext;
  recruiters?: string[];
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<
    | { kind: "ok"; message: string }
    | { kind: "err"; message: string }
    | null
  >(null);

  function handlePromote() {
    setFeedback(null);
    startTransition(async () => {
      const result = await promoteIntakeToCandidate(intake.id);
      if (result.ok) {
        setFeedback({
          kind: "ok",
          message: "Promoted to pipeline. Opening candidate…",
        });
        // Brief delay so the banner is visible before navigating.
        setTimeout(() => router.push(`/candidates/${result.candidateId}`), 600);
      } else {
        setFeedback({ kind: "err", message: result.error });
      }
    });
  }

  const tone =
    INTAKE_STATUSES.find((s) => s.id === intake.status)?.tone ?? "warm";
  const label =
    INTAKE_STATUSES.find((s) => s.id === intake.status)?.label ?? intake.status;
  const payloadEntries = Object.entries(intake.intake_payload ?? {});
  // Yellow NEW badge for any intake created within the last 24 hours,
  // regardless of status (per ticket 86e1vw2bm).
  const isRecent = Boolean(
    intake.created_at &&
      Date.now() - new Date(intake.created_at).getTime() < 24 * 60 * 60 * 1000,
  );

  // Offer a phone-screen booking on still-actionable intakes only.
  const showScheduler =
    intake.status !== "rejected" &&
    intake.status !== "spam" &&
    intake.status !== "promoted";
  const phoneScreenUrl = calendly.schedulingUrl
    ? buildCalendlyBookingUrl({
        schedulingUrl: calendly.schedulingUrl,
        slug: calendly.phoneScreenSlug,
        name: intake.full_name,
        email: intake.email,
      })
    : null;

  const claimedWhen = intake.claimed_at
    ? (() => {
        const d = new Date(intake.claimed_at);
        const sameDay = new Date().toDateString() === d.toDateString();
        const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
        return sameDay
          ? `today at ${time}`
          : `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} at ${time}`;
      })()
    : null;

  return (
    <div
      style={{
        padding: "16px 22px",
        borderTop: "1px solid var(--dt-warm-100)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
        <Link
          href={`/applications/${intake.id}`}
          style={{
            flex: 1,
            minWidth: 0,
            display: "block",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 500, fontSize: 14 }}>
              {intake.full_name ?? "Unknown applicant"}
            </div>
            <Badge tone={tone}>{label}</Badge>
            {isRecent && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  color: "#0a0a0a",
                  background: "#F5C518",
                  padding: "2px 7px",
                  borderRadius: 3,
                  textTransform: "uppercase",
                }}
                title="Submitted within the last 24 hours"
              >
                NEW
              </span>
            )}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            {intake.position_of_interest ?? "No position specified"} ·{" "}
            <span className="tab-num">{createdLabel}</span>
          </div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
            {[intake.email, intake.phone, intake.city].filter(Boolean).join(" · ") || "No contact info"}
            {intake.experience_years != null && (
              <> · <span className="tab-num">{intake.experience_years} yrs</span></>
            )}
          </div>
          {intake.cover_letter && (
            <div
              style={{
                marginTop: 8,
                fontSize: 12.5,
                color: "var(--dt-warm-700, #333)",
                background: "var(--dt-warm-50)",
                padding: "8px 10px",
                borderLeft: "2px solid var(--dt-gold)",
              }}
            >
              {intake.cover_letter}
            </div>
          )}
        </Link>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 160 }}>
          {/* Change 1 — green Download resume + blue Claim for me + Reassign.
              NOTE(mockup): exact claim-card layout (avatar/timestamp/reassign
              arrangement) is governed by Mockup 1; this ships the behavior. */}
          {intake.resume_url ? (
            // Resume ref may be a private storage key (would 404 as a raw href),
            // so resolve to a signed URL on click (card 5e3f8a66).
            <IntakeResumeLink
              resumeRef={intake.resume_url}
              label="Download Resume (PDF)"
              className="dt-btn"
              style={{ fontSize: 11.5, padding: "5px 10px", justifyContent: "center", background: "#2E7D46", color: "#fff", borderColor: "#2E7D46" }}
            />
          ) : (
            <button type="button" disabled className="dt-btn" style={{ fontSize: 11.5, padding: "5px 10px", justifyContent: "center", opacity: 0.5 }} title="No resume on file">
              No resume
            </button>
          )}

          {intake.claimed_by ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
              <Avatar name={intake.claimed_by} />
              <div style={{ fontSize: 11, color: "var(--dt-warm-600, #555)", lineHeight: 1.3 }}>
                <strong style={{ fontWeight: 600 }}>{intake.claimed_by}</strong> claimed this applicant
                {claimedWhen ? `, ${claimedWhen}` : ""}
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(async () => { await claimIntake(intake.id); router.refresh(); })}
              className="dt-btn"
              style={{ fontSize: 11.5, padding: "5px 10px", justifyContent: "center", background: "#2563EB", color: "#fff", borderColor: "#2563EB" }}
            >
              {pending ? "Claiming…" : "Claim for me"}
            </button>
          )}

          {intake.claimed_by && (
            reassignOpen ? (
              <form
                action={reassignIntake.bind(null, intake.id)}
                onSubmit={() => setReassignOpen(false)}
                style={{ display: "flex", gap: 4 }}
              >
                <select name="assignee" defaultValue={intake.claimed_by ?? ""} className="dt-filter-input" style={{ fontSize: 11, flex: 1 }}>
                  <option value="">Unassign</option>
                  {recruiters.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <button type="submit" className="dt-btn" style={{ fontSize: 11, padding: "4px 8px" }}>Assign</button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setReassignOpen(true)}
                className="dt-btn dt-btn-ghost tiny"
                style={{ fontSize: 11, padding: "4px 10px", justifyContent: "center" }}
              >
                Reassign
              </button>
            )
          )}

          {intake.promoted_candidate_id ? (
            <Link
              href={`/candidates/${intake.promoted_candidate_id}`}
              className="dt-btn"
              style={{ fontSize: 11.5, padding: "5px 10px", justifyContent: "center" }}
            >
              View Candidate →
            </Link>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={handlePromote}
              className="dt-btn dt-btn-gold"
              style={{ fontSize: 11.5, padding: "5px 10px", justifyContent: "center" }}
            >
              <span>{pending ? "Promoting…" : "→ Promote to Pipeline"}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="dt-btn"
            style={{ fontSize: 11, padding: "4px 10px", justifyContent: "center" }}
          >
            Edit Info
          </button>

          {showScheduler && (
            <CalendlyScheduler
              connected={calendly.connected}
              size="sm"
              emptyHint="Connect Calendly to schedule"
              options={[
                {
                  key: "phone_screen",
                  label: "Schedule Phone Screen",
                  durationMinutes:
                    CALENDLY_EVENT_TYPES.phone_screen.durationMinutes,
                  url: phoneScreenUrl,
                },
              ]}
            />
          )}

          {intake.status !== "rejected" && intake.status !== "promoted" && (
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(async () => { await setIntakeStatus(intake.id, "rejected"); })}
              className="dt-btn"
              style={{ fontSize: 11, padding: "4px 10px", justifyContent: "center" }}
            >
              Reject
            </button>
          )}
          {intake.status === "new" && (
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(async () => { await setIntakeStatus(intake.id, "spam"); })}
              className="dt-btn"
              style={{ fontSize: 11, padding: "4px 10px", justifyContent: "center" }}
            >
              Mark Spam
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div
          role={feedback.kind === "err" ? "alert" : undefined}
          style={{
            marginTop: 10,
            padding: "8px 10px",
            borderRadius: 6,
            fontSize: 12,
            background:
              feedback.kind === "ok"
                ? "rgba(16, 185, 129, 0.08)"
                : "rgba(220, 38, 38, 0.08)",
            color:
              feedback.kind === "ok"
                ? "var(--dt-success)"
                : "var(--dt-danger)",
          }}
        >
          {feedback.message}
        </div>
      )}

      {editOpen && (
        <div
          className="dt-cal-dialog-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditOpen(false);
          }}
        >
          <div className="dt-cal-dialog" role="dialog" aria-modal="true">
            <div className="dt-cal-dialog-head">
              <div>
                <div className="crumb">Edit applicant</div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 300, letterSpacing: "0.06em" }}>
                  {intake.full_name ?? "Applicant"}
                </h3>
              </div>
              <button
                type="button"
                className="dt-btn dt-btn-ghost tiny"
                onClick={() => setEditOpen(false)}
              >
                Close ✕
              </button>
            </div>

            <form
              action={updateIntake.bind(null, intake.id)}
              onSubmit={() => setEditOpen(false)}
              className="dt-cal-dialog-body"
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <EditField label="Full Name">
                <input name="full_name" type="text" defaultValue={intake.full_name ?? ""} className="dt-filter-input" />
              </EditField>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <EditField label="Email">
                  <input name="email" type="email" defaultValue={intake.email ?? ""} className="dt-filter-input" />
                </EditField>
                <EditField label="Phone">
                  <input name="phone" type="tel" defaultValue={intake.phone ?? ""} className="dt-filter-input" />
                </EditField>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <EditField label="City">
                  <input name="city" type="text" defaultValue={intake.city ?? ""} className="dt-filter-input" />
                </EditField>
                <EditField label="Years Experience">
                  <input
                    name="experience_years"
                    type="number"
                    step="0.5"
                    min="0"
                    defaultValue={intake.experience_years != null ? String(intake.experience_years) : ""}
                    className="dt-filter-input"
                  />
                </EditField>
              </div>
              <EditField label="Position of Interest">
                <input name="position_of_interest" type="text" defaultValue={intake.position_of_interest ?? ""} className="dt-filter-input" />
              </EditField>
              <EditField label="Source">
                <input name="source" type="text" defaultValue={intake.source ?? ""} className="dt-filter-input" />
              </EditField>
              <EditField label="Cover Letter">
                <textarea
                  name="cover_letter"
                  rows={4}
                  defaultValue={intake.cover_letter ?? ""}
                  className="dt-filter-input"
                  style={{ resize: "vertical", minHeight: 70 }}
                />
              </EditField>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                <button type="button" className="dt-btn" onClick={() => setEditOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="dt-btn dt-btn-gold">
                  <span>Save</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="dt-btn-ghost"
        style={{
          marginTop: 10,
          fontSize: 11,
          color: "var(--dt-warm-500)",
          padding: 0,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        {expanded ? "Hide raw form payload ▴" : "Show raw form payload ▾"}
      </button>

      {expanded && (
        <div
          style={{
            marginTop: 8,
            background: "var(--dt-warm-50)",
            border: "1px solid var(--dt-warm-150)",
            padding: 10,
            fontSize: 11.5,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            display: "grid",
            gridTemplateColumns: "180px 1fr",
            rowGap: 4,
            columnGap: 12,
            overflowX: "auto",
          }}
        >
          {payloadEntries.length === 0 ? (
            <div style={{ color: "var(--dt-warm-500)" }}>(empty)</div>
          ) : (
            payloadEntries.map(([k, v]) => (
              <Fragment key={k}>
                <div style={{ color: "var(--dt-warm-500)" }}>{k}</div>
                <div style={{ wordBreak: "break-word" }}>
                  {typeof v === "string" ? v : JSON.stringify(v)}
                </div>
              </Fragment>
            ))
          )}
          <div style={{ color: "var(--dt-warm-500)" }}>source</div>
          <div>{intake.source ?? "—"}</div>
          <div style={{ color: "var(--dt-warm-500)" }}>user_agent</div>
          <div style={{ wordBreak: "break-all" }}>{intake.user_agent ?? "—"}</div>
        </div>
      )}
    </div>
  );
}

function EditField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="dt-filter">
      <span className="dt-filter-label">{label}</span>
      {children}
    </label>
  );
}
