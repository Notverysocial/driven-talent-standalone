import type { ReactNode } from "react";
import type { Candidate } from "@/lib/supabase/types";

// Consolidated schedule surface (unified interface, card 0631ab59). Pulls the
// scheduling-related dates already living on the candidate record into one place
// (interview, last contact, sent-to-client, client decision) and hosts the
// Calendly booking UI beneath them. Presentational — the booking node is passed
// in as `children` so the page keeps ownership of the Calendly context.
function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function fmtDateTime(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CandidateSchedule({
  cand,
  children,
}: {
  cand: Candidate;
  children?: ReactNode;
}) {
  const rows: { label: string; value: string; strong?: boolean }[] = [
    {
      label: "Video interview",
      value: cand.interview_at
        ? fmtDateTime(cand.interview_at)
        : cand.interview_scheduled
          ? "Scheduled (time TBD)"
          : "Not scheduled",
      strong: Boolean(cand.interview_at),
    },
    { label: "Last contact", value: fmtDate(cand.last_contact_date) },
    {
      label: "Sent to client",
      value: cand.sent_to_client ? fmtDate(cand.sent_at) : "Not sent",
    },
    {
      label: "Client decision",
      value: cand.client_response
        ? `${cand.client_response[0].toUpperCase()}${cand.client_response.slice(1)}${
            cand.client_response_date ? ` · ${fmtDate(cand.client_response_date)}` : ""
          }`
        : "Pending",
    },
  ];

  return (
    <div>
      <div
        className="tiny muted"
        style={{
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          fontWeight: 400,
          marginBottom: 10,
          fontSize: 10.5,
        }}
      >
        On the record
      </div>
      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          rowGap: 8,
          columnGap: 18,
          margin: 0,
          marginBottom: children ? 22 : 0,
        }}
      >
        {rows.map((r) => (
          <div key={r.label} style={{ display: "contents" }}>
            <dt
              style={{
                fontSize: 12.5,
                color: "var(--dt-warm-500)",
                alignSelf: "center",
              }}
            >
              {r.label}
            </dt>
            <dd
              style={{
                margin: 0,
                fontSize: 13,
                fontWeight: r.strong ? 500 : 400,
                color: r.strong ? "var(--dt-gold-deep)" : "inherit",
              }}
            >
              {r.value}
            </dd>
          </div>
        ))}
      </dl>

      {children && (
        <div style={{ borderTop: "1px solid var(--dt-warm-100)", paddingTop: 16 }}>
          <div
            className="tiny muted"
            style={{
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              fontWeight: 400,
              marginBottom: 10,
              fontSize: 10.5,
            }}
          >
            Book a time
          </div>
          {children}
        </div>
      )}
    </div>
  );
}
