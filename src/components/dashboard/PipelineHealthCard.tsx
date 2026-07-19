/**
 * Applicant Pipeline Health card for the dashboard (card 1322c60e).
 *
 * Surfaces the recurring data-integrity audit where the team actually looks,
 * not only on demand: the unreviewed backlog + aging, the never-promoted /
 * never-rejected drop seam, duplicate-email re-applications, unresolved imports,
 * and orphaned references. Runs the audit LIVE so the numbers are always fresh;
 * the same audit is written to a dated snapshot by the scheduled cron. The audit
 * is fail-safe (returns zeros on any error), so this card never breaks the
 * dashboard.
 */
import Link from "next/link";
import { runApplicantIntegrityAudit } from "@/lib/integrity/applicant-audit.server";

type Stat = {
  label: string;
  value: number;
  sub?: string;
  href?: string;
  // "warn" when > 0 is a problem (defects); "info" when > 0 is just workload.
  severity: "info" | "warn";
};

function tone(stat: Stat): { color: string; bg: string; border: string } {
  const hot = stat.value > 0;
  if (stat.severity === "warn" && hot) {
    return { color: "#B23A3A", bg: "rgba(178,58,58,0.06)", border: "rgba(178,58,58,0.30)" };
  }
  if (stat.severity === "info" && hot) {
    return { color: "var(--dt-gold-deep)", bg: "rgba(245,197,24,0.08)", border: "rgba(245,197,24,0.35)" };
  }
  return { color: "#4F7A3A", bg: "rgba(79,122,58,0.06)", border: "rgba(79,122,58,0.25)" };
}

export async function PipelineHealthCard() {
  const r = await runApplicantIntegrityAudit();

  const orphanTotal =
    r.orphans.danglingPromotedCandidate +
    r.orphans.promotedWithoutCandidateId +
    r.orphans.danglingPromotedEmployee;

  const backlogAging = r.backlog.over7 > 0;

  const stats: Stat[] = [
    {
      label: "Unreviewed intakes",
      value: r.backlog.unreviewed,
      sub:
        r.backlog.unreviewed > 0
          ? `${r.backlog.over7} over 7d · ${r.backlog.over30} over 30d · oldest ${r.backlog.oldestDays}d · ${r.backlog.distinctPeople} people`
          : "funnel is clear",
      href: "/applications",
      severity: backlogAging ? "warn" : "info",
    },
    {
      label: "Stuck (no decision)",
      value: r.stuck.count,
      sub: "never promoted or rejected",
      href: "/applications",
      severity: "warn",
    },
    {
      label: "Duplicate applicants",
      value: r.duplicateEmails.count,
      sub: "email already a candidate",
      href: "/applications",
      severity: "warn",
    },
    {
      label: "Unresolved imports",
      value: r.unresolvedImports.total,
      sub:
        r.unresolvedImports.byReason[0]?.reason
          ? `top: ${r.unresolvedImports.byReason[0].reason} (${r.unresolvedImports.byReason[0].count})`
          : "none pending",
      severity: "warn",
    },
    {
      label: "Orphaned links",
      value: orphanTotal,
      sub: "dangling promote / hire refs",
      severity: "warn",
    },
    {
      label: "Unexcluded test rows",
      value: r.seedRows.unexcluded,
      sub: "@example.com seed data in prod",
      severity: "warn",
    },
    {
      label: "Duplicate people",
      value: r.duplicateCandidates.records,
      sub:
        r.duplicateCandidates.groups > 0
          ? `${r.duplicateCandidates.groups} group(s) · blocks interview sync`
          : "no repeated email or phone",
      href: "/candidates",
      severity: "warn",
    },
  ];

  const healthy = r.flags === 0;

  return (
    <div
      className="dt-card"
      style={{
        marginBottom: 22,
        borderTop: `3px solid ${healthy ? "#4F7A3A" : "#B23A3A"}`,
      }}
    >
      <div className="dt-card-head">
        <div>
          <h3>Applicant Pipeline Health</h3>
          <div className="sub">
            Data-integrity audit · {r.totalIntakes} intakes checked ·{" "}
            {new Date(r.generatedAt).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </div>
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            padding: "4px 10px",
            borderRadius: 4,
            color: healthy ? "#4F7A3A" : "#B23A3A",
            background: healthy ? "rgba(79,122,58,0.10)" : "rgba(178,58,58,0.10)",
            border: `1px solid ${healthy ? "rgba(79,122,58,0.35)" : "rgba(178,58,58,0.35)"}`,
          }}
        >
          {healthy ? "All clear" : `${r.flags} to review`}
        </span>
      </div>
      <div
        style={{
          padding: "16px 20px 20px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12,
        }}
      >
        {stats.map((s) => {
          const c = tone(s);
          const inner = (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: 8,
                background: c.bg,
                border: `1px solid ${c.border}`,
                height: "100%",
              }}
            >
              <div
                className="tab-num"
                style={{
                  fontFamily: "var(--dt-display)",
                  fontSize: 30,
                  fontWeight: 300,
                  lineHeight: 1,
                  color: c.color,
                }}
              >
                {s.value}
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  marginTop: 8,
                  color: "var(--dt-warm-700, #444)",
                }}
              >
                {s.label}
              </div>
              {s.sub && (
                <div className="tiny muted" style={{ marginTop: 3, fontSize: 10.5, lineHeight: 1.4 }}>
                  {s.sub}
                </div>
              )}
            </div>
          );
          return s.href ? (
            <Link key={s.label} href={s.href} style={{ textDecoration: "none" }}>
              {inner}
            </Link>
          ) : (
            <div key={s.label}>{inner}</div>
          );
        })}
      </div>
    </div>
  );
}
