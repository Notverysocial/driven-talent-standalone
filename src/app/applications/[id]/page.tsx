import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/Badge";
import {
  getApplicationIntakeDetail,
  type ApplicationIntakeDetail,
} from "@/lib/recruiting.server";
import { INTAKE_STATUSES } from "@/lib/recruiting";
import { IntakeResumeLink } from "../IntakeResumeLink";
import { CandidateNotes } from "@/components/CandidateNotes";
import { listNotes } from "@/lib/candidate-notes.server";

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

export default async function ApplicationDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  let detail: ApplicationIntakeDetail | null = null;
  try {
    detail = await getApplicationIntakeDetail(id);
  } catch (err) {
    console.error(`[applications/${id}] failed to load detail`, err);
    notFound();
  }
  if (!detail) notFound();

  // Notes for the APPLICANT stage. Same log, same component, same server-side
  // author stamping as candidates — see migration 0050 for why this reuses
  // candidate_notes rather than adding a second notes table.
  //
  // Tolerant read: until 0050 is applied the subject_type CHECK rejects
  // 'applicant', so this would throw and take the whole page down. An empty
  // log plus a console error is the right failure here — the rest of the
  // applicant record still renders.
  let notes: Awaited<ReturnType<typeof listNotes>> = [];
  let notesUnavailable = false;
  try {
    notes = await listNotes("applicant", id);
  } catch (err) {
    notesUnavailable = true;
    console.error(`[applications/${id}] notes unavailable (is migration 0050 applied?)`, err);
  }

  const statusMeta = INTAKE_STATUSES.find((s) => s.id === detail.status);
  const statusLabel = statusMeta?.label ?? detail.status;
  const statusTone = statusMeta?.tone ?? "warm";
  const payloadEntries = Object.entries(detail.intake_payload ?? {});

  return (
    <Shell>
      <Topbar
        crumb="RECRUITING / APPLICATIONS"
        scriptWord=""
        title={detail.full_name ?? "Unknown applicant"}
        actions={
          <Link href="/applications" className="dt-btn">
            ← All Applications
          </Link>
        }
      />

      <div
        className="dt-overview-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
          gap: 22,
          marginBottom: 22,
        }}
      >
        <div className="dt-card gold-edge">
          <div className="dt-card-head">
            <div>
              <h3>Application</h3>
              <div className="sub">
                {detail.position_of_interest ?? "No position specified"}
              </div>
            </div>
            <Badge tone={statusTone}>{statusLabel}</Badge>
          </div>

          <div style={{ padding: "20px 24px" }}>
            <DetailRow label="Full Name" value={detail.full_name ?? "—"} />
            <DetailRow label="Email" value={detail.email ?? "—"} />
            <DetailRow label="Phone" value={detail.phone ?? "—"} />
            <DetailRow label="City" value={detail.city ?? "—"} />
            <DetailRow
              label="Position Applied For"
              value={detail.position_of_interest ?? "—"}
            />
            <DetailRow
              label="Experience"
              value={
                detail.experience_years != null
                  ? `${detail.experience_years} yrs`
                  : "—"
              }
            />
            <DetailRow
              label="Resume"
              value={detail.resume_url ? "Attached" : "—"}
              valueNode={
                detail.resume_url ? (
                  <IntakeResumeLink
                    resumeRef={detail.resume_url}
                    label="Open resume →"
                    className="dt-btn dt-btn-ghost tiny"
                    style={{ fontSize: 11.5, padding: "4px 10px" }}
                  />
                ) : undefined
              }
            />
          </div>

          {detail.cover_letter && (
            <div style={{ padding: "0 24px 24px" }}>
              <div
                className="tiny muted"
                style={{
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  fontWeight: 400,
                  marginBottom: 8,
                }}
              >
                Cover Letter
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--dt-warm-700, #333)",
                  background: "var(--dt-warm-50)",
                  padding: "14px 16px",
                  borderLeft: "2px solid var(--dt-gold)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {detail.cover_letter}
              </div>
            </div>
          )}
        </div>

        <div className="col gap-md">
          <div className="dt-card gold-edge" style={{ padding: "22px 24px" }}>
            <div
              className="tiny muted"
              style={{
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                fontWeight: 400,
              }}
            >
              Pipeline
            </div>
            <div
              style={{
                fontFamily: "var(--dt-display)",
                fontSize: 22,
                fontWeight: 300,
                marginTop: 10,
                letterSpacing: "-0.01em",
              }}
            >
              {statusLabel}
            </div>
            <div style={{ height: 1, background: "var(--dt-warm-100)", margin: "18px 0" }} />
            <DetailRow
              label="Source"
              value={detail.source ?? "—"}
            />
            <DetailRow
              label="Submitted"
              value={fmtDateTime(detail.created_at)}
            />
            <DetailRow
              label="Reviewed By"
              value={detail.reviewed_by ?? "—"}
            />
            <DetailRow
              label="Reviewed At"
              value={fmtDateTime(detail.reviewed_at)}
            />
            <DetailRow
              label="Last Updated"
              value={fmtDateTime(detail.updated_at)}
            />
          </div>

          {(detail.promoted_candidate_id || detail.conversation_id) && (
            <div className="dt-card" style={{ padding: "22px 24px" }}>
              <div
                className="tiny muted"
                style={{
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  fontWeight: 400,
                  marginBottom: 14,
                }}
              >
                Linked Records
              </div>
              {detail.promoted_candidate_id && (
                <Link
                  href={`/candidates/${detail.promoted_candidate_id}`}
                  className="dt-btn dt-btn-gold"
                  style={{
                    fontSize: 12,
                    padding: "6px 12px",
                    justifyContent: "center",
                    marginBottom: 8,
                    display: "flex",
                  }}
                >
                  <span>
                    View Candidate
                    {detail.promoted_candidate_name
                      ? ` · ${detail.promoted_candidate_name}`
                      : ""}{" "}
                    →
                  </span>
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Notes + phone-screen outcome. Placed ABOVE the raw payload: what the
          team writes about this person matters more than the unmapped form
          body, and the gap Leangel reported was having nowhere to write it. */}
      <div className="dt-card" style={{ marginBottom: 22 }}>
        <div className="dt-card-head">
          <div>
            <h3>Notes &amp; Call Log</h3>
            <div className="sub">
              Comments and phone-screen outcomes. Stays with this person after
              promotion to the pipeline.
            </div>
          </div>
        </div>
        <div style={{ padding: "20px 24px" }}>
          {notesUnavailable ? (
            <div
              style={{
                fontSize: 13,
                color: "var(--dt-warm-700)",
                background: "var(--dt-warm-50)",
                borderLeft: "2px solid var(--dt-warning, var(--dt-gold))",
                padding: "14px 16px",
              }}
            >
              Notes are not available yet — database migration{" "}
              <code>0050_applicant_notes</code> has not been applied to this
              environment. Nothing has been lost; the log appears as soon as it
              runs.
            </div>
          ) : (
            <CandidateNotes
              subjectType="applicant"
              subjectId={id}
              notes={notes}
              allowPhoneScreen
            />
          )}
        </div>
      </div>

      <div className="dt-card">
        <div className="dt-card-head">
          <div>
            <h3>Raw Form Payload</h3>
            <div className="sub">
              Full unmapped body captured from {detail.source ?? "the careers form"}
            </div>
          </div>
        </div>
        <div
          style={{
            padding: "20px 24px",
            fontSize: 12,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            display: "grid",
            gridTemplateColumns: "200px 1fr",
            rowGap: 6,
            columnGap: 16,
            overflowX: "auto",
          }}
        >
          {payloadEntries.length === 0 ? (
            <div
              style={{
                gridColumn: "1 / -1",
                color: "var(--dt-warm-500)",
                fontStyle: "italic",
              }}
            >
              No raw payload captured.
            </div>
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
          <div style={{ color: "var(--dt-warm-500)" }}>user_agent</div>
          <div style={{ wordBreak: "break-all" }}>{detail.user_agent ?? "—"}</div>
        </div>
      </div>
    </Shell>
  );
}

function DetailRow({
  label,
  value,
  valueHref,
  valueNode,
}: {
  label: string;
  value: string;
  valueHref?: string;
  // Custom right-hand content (e.g. a resume link that signs on click). When
  // set it replaces the plain value / valueHref rendering.
  valueNode?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "8px 0",
        fontSize: 12.5,
        borderBottom: "1px solid var(--dt-warm-100)",
        gap: 16,
      }}
    >
      <span style={{ color: "var(--dt-warm-500)" }}>{label}</span>
      {valueNode ? (
        <span style={{ textAlign: "right" }}>{valueNode}</span>
      ) : valueHref ? (
        <a
          href={valueHref}
          target="_blank"
          rel="noopener noreferrer"
          className="tab-num"
          style={{
            color: "var(--dt-gold-deep)",
            fontWeight: 400,
            textDecoration: "underline",
            textAlign: "right",
            wordBreak: "break-word",
          }}
        >
          {value}
        </a>
      ) : (
        <span
          className="tab-num"
          style={{
            color: "var(--dt-warm-900)",
            fontWeight: 400,
            textAlign: "right",
            wordBreak: "break-word",
          }}
        >
          {value}
        </span>
      )}
    </div>
  );
}
