"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState, useTransition } from "react";
import { Badge } from "@/components/Badge";
import { INTAKE_STATUSES, type ApplicationIntake } from "@/lib/recruiting";
import { promoteIntakeToCandidate, setIntakeStatus } from "./actions";

export function IntakeCard({
  intake,
  createdLabel,
}: {
  intake: ApplicationIntake;
  createdLabel: string;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
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
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontWeight: 500, fontSize: 14 }}>
              {intake.full_name ?? "Unknown applicant"}
            </div>
            <Badge tone={tone}>{label}</Badge>
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
          {intake.conversation_id && (
            <Link
              href="/inbox"
              className="dt-btn"
              style={{ fontSize: 11, padding: "4px 10px", justifyContent: "center" }}
            >
              Open in Inbox
            </Link>
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
