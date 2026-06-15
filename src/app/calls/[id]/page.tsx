import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/Badge";
import {
  getInboundCall,
  type InboundCallDetail,
} from "@/lib/recruiting.server";
import { CALL_STATUSES } from "@/lib/recruiting";

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

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function InboundCallDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  let detail: InboundCallDetail | null = null;
  try {
    detail = await getInboundCall(id);
  } catch (err) {
    console.error(`[calls/${id}] failed to load detail`, err);
    notFound();
  }
  if (!detail) notFound();

  const statusMeta = CALL_STATUSES.find((s) => s.id === detail.follow_up_status);
  const statusLabel = statusMeta?.label ?? detail.follow_up_status;
  const statusTone = statusMeta?.tone ?? "warm";

  return (
    <Shell>
      <Topbar
        crumb="RECRUITING / INBOUND CALLS"
        scriptWord=""
        title={detail.caller_name}
        actions={
          <Link href="/calls" className="dt-btn">
            ← All Calls
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
              <h3>Call Details</h3>
              <div className="sub">
                {detail.position_of_interest ?? "No position specified"}
              </div>
            </div>
            <Badge tone={statusTone}>{statusLabel}</Badge>
          </div>

          <div style={{ padding: "20px 24px" }}>
            <DetailRow label="Caller Name" value={detail.caller_name} />
            <DetailRow label="Phone" value={detail.caller_phone ?? "—"} />
            <DetailRow label="Email" value={detail.caller_email ?? "—"} />
            <DetailRow
              label="Position of Interest"
              value={detail.position_of_interest ?? "—"}
            />
            <DetailRow label="Called At" value={fmtDateTime(detail.called_at)} />
            <DetailRow label="Taken By" value={detail.taken_by ?? "—"} />
            <DetailRow
              label="Follow-up Due"
              value={fmtDate(detail.follow_up_due)}
            />
          </div>

          {detail.notes && (
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
                Notes
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
                {detail.notes}
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
              Follow-up Status
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
            <div
              style={{
                height: 1,
                background: "var(--dt-warm-100)",
                margin: "18px 0",
              }}
            />
            <DetailRow label="Logged At" value={fmtDateTime(detail.created_at)} />
            <DetailRow
              label="Last Updated"
              value={fmtDateTime(detail.updated_at)}
            />
          </div>

          {detail.converted_candidate_id && (
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
                Converted To Candidate
              </div>
              <Link
                href={`/candidates/${detail.converted_candidate_id}`}
                className="dt-btn dt-btn-gold"
                style={{
                  fontSize: 12,
                  padding: "6px 12px",
                  justifyContent: "center",
                  display: "flex",
                }}
              >
                <span>
                  View Candidate
                  {detail.converted_candidate_name
                    ? ` · ${detail.converted_candidate_name}`
                    : ""}{" "}
                  →
                </span>
              </Link>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
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
    </div>
  );
}
