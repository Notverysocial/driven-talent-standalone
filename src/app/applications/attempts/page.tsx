import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/Badge";
import { requireRole } from "@/lib/auth.server";
import { listSubmissionAttempts } from "@/lib/application-attempts.server";
import {
  ATTEMPT_STATUS_LABEL,
  ATTEMPT_STATUS_TONE,
  attemptNeedsAttention,
  contactableFrom,
  isStuckPending,
  isAttemptStatus,
  partitionAttempts,
  type AttemptRow,
} from "@/lib/application-attempts";
import { recoverAttemptToIntake } from "./actions";

// The recovery desk for applications that never landed.
//
// The public site writes an attempt row BEFORE forwarding an application, so a
// crash or a failed forward still leaves a record of who tried to apply. Its
// own migration says those rows should be "worked by hand" — but nothing in
// this app read the table, so nobody could. This is the surface that reads it.
//
// ADMIN-GATED on purpose: the reader uses the service-role client to get past
// the table's RLS (which has no policies, because the rows are applicant PII).
// Anything that bypasses RLS should sit behind the strongest gate the area has.

export const dynamic = "force-dynamic";

function fmtWhen(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function AttemptCard({ row, now }: { row: AttemptRow; now: Date }) {
  const contacts = contactableFrom(row);
  const stuck = isStuckPending(row, now);
  const status = isAttemptStatus(row.status) ? row.status : null;
  const urgent = attemptNeedsAttention(row);

  return (
    <div
      style={{
        padding: "16px 20px",
        borderBottom: "1px solid var(--dt-warm-100)",
        background: urgent ? "rgba(178, 58, 58, 0.04)" : undefined,
        borderLeft: urgent ? "3px solid var(--dt-danger)" : undefined,
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) auto",
        gap: 14,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>
          {row.full_name?.trim() || <em style={{ color: "var(--dt-warm-500)" }}>No name recorded</em>}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <Badge tone={(status ? ATTEMPT_STATUS_TONE[status] : "red") as never}>
            {status ? ATTEMPT_STATUS_LABEL[status] : `Unknown status: ${row.status}`}
          </Badge>
          {stuck && <Badge tone={"red" as never}>Stuck in flight</Badge>}
          {row.status === "forwarded" && !row.intake_id && (
            <Badge tone={"red" as never}>Marked landed, but no applicant row</Badge>
          )}
          {row.has_resume && (
            <Badge tone={"warm" as never}>
              Resume never stored{row.resume_filename ? `: ${row.resume_filename}` : ""}
            </Badge>
          )}
        </div>

        <div style={{ marginTop: 10, fontSize: 12, color: "var(--dt-warm-700)" }}>
          {/* The whole point of the table: enough to reach a lost applicant. */}
          {contacts.length > 0 ? (
            contacts.join("  ·  ")
          ) : (
            <strong style={{ color: "var(--dt-danger)" }}>
              No phone and no email — this person cannot be contacted.
            </strong>
          )}
        </div>

        <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--dt-warm-500)" }}>
          {row.position_of_interest || "No position given"}
          {row.city ? ` · ${row.city}` : ""} · tried {fmtWhen(row.created_at)}
        </div>

        {row.detail && (
          <div
            style={{
              marginTop: 8, fontSize: 11, fontFamily: "var(--dt-mono, monospace)",
              color: "var(--dt-warm-500)", wordBreak: "break-word",
            }}
          >
            {row.detail}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {row.intake_id ? (
          <Link
            href={`/applications/${row.intake_id}`}
            className="dt-btn"
            style={{ fontSize: 11, padding: "5px 10px" }}
          >
            Open applicant →
          </Link>
        ) : (
          <form action={recoverAttemptToIntake.bind(null, row.id)}>
            <button
              type="submit"
              className="dt-btn"
              disabled={!row.full_name?.trim()}
              title={
                row.full_name?.trim()
                  ? "Create an applicant record from this attempt"
                  : "No name recorded — work this one from the contact details"
              }
              style={{ fontSize: 11, padding: "5px 10px" }}
            >
              Recover as applicant
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default async function SubmissionAttemptsPage() {
  await requireRole("admin");
  const read = await listSubmissionAttempts();
  const now = new Date();

  return (
    <Shell>
      <Topbar
        crumb="Applications"
        scriptWord="Recovery"
        title="Failed submissions"
        actions={
          <Link href="/applications" className="dt-btn">
            ← Applicant Tracking
          </Link>
        }
      />

      <div style={{ padding: "0 26px 40px" }}>
        <p style={{ fontSize: 12.5, color: "var(--dt-warm-700)", maxWidth: 780, margin: "0 0 18px" }}>
          Every application the public site accepted is written here <em>before</em> it is
          forwarded, so a failure mid-submission still leaves a record of who tried to
          apply. Rows flagged below never reached Applicant Tracking — call them.
        </p>

        {!read.available ? (
          <div className="dt-card" style={{ padding: 22 }}>
            <div style={{ fontWeight: 500, marginBottom: 6 }}>Not available yet</div>
            <div style={{ fontSize: 12.5, color: "var(--dt-warm-700)" }}>{read.reason}</div>
            <div style={{ fontSize: 12, color: "var(--dt-warm-500)", marginTop: 10 }}>
              This is reported rather than shown as an empty list on purpose — &quot;no lost
              applications&quot; and &quot;we cannot see whether there are lost applications&quot;
              are different answers.
            </div>
          </div>
        ) : (
          (() => {
            const { needsAttention, resolved } = partitionAttempts(read.rows);
            return (
              <>
                <div className="dt-card" style={{ marginBottom: 18 }}>
                  <div
                    style={{
                      padding: "12px 20px", borderBottom: "1px solid var(--dt-warm-100)",
                      fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase",
                      color: needsAttention.length ? "var(--dt-danger)" : "var(--dt-warm-500)",
                    }}
                  >
                    Needs attention — {needsAttention.length}
                  </div>
                  {needsAttention.length === 0 ? (
                    <div style={{ padding: "28px 20px", textAlign: "center", fontStyle: "italic", color: "var(--dt-warm-500)" }}>
                      Nothing outstanding. Every recorded submission reached Applicant Tracking.
                    </div>
                  ) : (
                    needsAttention.map((r) => <AttemptCard key={r.id} row={r} now={now} />)
                  )}
                </div>

                <div className="dt-card">
                  <div
                    style={{
                      padding: "12px 20px", borderBottom: "1px solid var(--dt-warm-100)",
                      fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase",
                      color: "var(--dt-warm-500)",
                    }}
                  >
                    Landed — {resolved.length}
                  </div>
                  {resolved.length === 0 ? (
                    <div style={{ padding: "22px 20px", textAlign: "center", fontStyle: "italic", color: "var(--dt-warm-500)" }}>
                      No resolved submissions on record.
                    </div>
                  ) : (
                    resolved.map((r) => <AttemptCard key={r.id} row={r} now={now} />)
                  )}
                </div>
              </>
            );
          })()
        )}
      </div>
    </Shell>
  );
}
