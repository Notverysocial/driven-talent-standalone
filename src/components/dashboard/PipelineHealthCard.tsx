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

// Two tiers, deliberately distinguished in the UI.
//
//   alarm   — correct steady state is ZERO, so any non-zero is new/unexpected.
//             These and ONLY these turn the headline red.
//   tracked — known, carded, owned issues that are legitimately non-zero today
//             (duplicates, unresolved imports, the drop seam) plus normal
//             workload. Shown as counts on their own line.
//
// Why: a signal that stays red for weeks because of a known issue is a signal
// everyone learns to ignore. CI was red for nine days and that is exactly why a
// real main-breaking failure got waved through as "the known flake."
type Tier = "alarm" | "tracked";

type Stat = {
  label: string;
  value: number;
  sub?: string;
  href?: string;
  tier: Tier;
};

function tone(stat: Stat): { color: string; bg: string; border: string } {
  const hot = stat.value > 0;
  if (!hot) {
    return { color: "#4F7A3A", bg: "rgba(79,122,58,0.06)", border: "rgba(79,122,58,0.25)" };
  }
  // Only an alarm renders red. A tracked issue is neutral-amber: visible,
  // countable, but not pretending to be an emergency.
  if (stat.tier === "alarm") {
    return { color: "#B23A3A", bg: "rgba(178,58,58,0.06)", border: "rgba(178,58,58,0.30)" };
  }
  return { color: "var(--dt-warm-700, #444)", bg: "rgba(0,0,0,0.03)", border: "rgba(0,0,0,0.12)" };
}

export async function PipelineHealthCard() {
  const r = await runApplicantIntegrityAudit();

  const orphanTotal =
    r.orphans.danglingPromotedCandidate +
    r.orphans.promotedWithoutCandidateId +
    r.orphans.danglingPromotedEmployee;

  const backlogAging = r.backlog.over7 > 0;

  // ALARMS — steady state is zero; any non-zero is genuinely new.
  const alarmStats: Stat[] = [
    {
      label: "Unexcluded test rows",
      value: r.seedRows.unexcluded,
      sub: "@example.com seed data in prod",
      tier: "alarm",
    },
    {
      label: "Orphaned links",
      value: orphanTotal,
      sub: "dangling promote / hire refs",
      tier: "alarm",
    },
    {
      label: "Integrations not working",
      value: r.integrations.alarm,
      sub:
        r.integrations.broken.length > 0
          ? `${r.integrations.broken.join(", ")} · expired token or zero events`
          : "all connected integrations are live",
      href: "/integrations",
      tier: "alarm",
    },
  ];

  // TRACKED — known, carded, owned. Legitimately non-zero today.
  const trackedStats: Stat[] = [
    {
      label: "Unreviewed intakes",
      value: r.backlog.unreviewed,
      sub:
        r.backlog.unreviewed > 0
          ? `${r.backlog.over7} over 7d · ${r.backlog.over30} over 30d · oldest ${r.backlog.oldestDays}d · ${r.backlog.distinctPeople} people`
          : "funnel is clear",
      href: "/applications",
      tier: "tracked",
    },
    {
      label: "Duplicate people",
      value: r.duplicateCandidates.records,
      sub:
        r.duplicateCandidates.groups > 0
          ? `${r.duplicateCandidates.groups} group(s) · blocks interview sync`
          : "no repeated email or phone",
      href: "/candidates",
      tier: "tracked",
    },
    {
      label: "Duplicate intakes",
      value: r.duplicateIntakes.records,
      sub:
        r.duplicateIntakes.groups > 0
          ? `${r.duplicateIntakes.groups} group(s) · repeat applications`
          : "no repeats",
      href: "/applications",
      tier: "tracked",
    },
    {
      label: "Stuck (no decision)",
      value: r.stuck.count,
      sub: "never promoted or rejected",
      href: "/applications",
      tier: "tracked",
    },
    {
      label: "Re-applied as candidate",
      value: r.duplicateEmails.count,
      sub: "intake email already a candidate",
      href: "/applications",
      tier: "tracked",
    },
    {
      label: "Integrations stale",
      value: r.integrations.stale,
      sub: "connected but overdue for a sync",
      href: "/integrations",
      tier: "tracked",
    },
    {
      label: "Unresolved imports",
      value: r.unresolvedImports.total,
      sub:
        r.unresolvedImports.byReason[0]?.reason
          ? `top: ${r.unresolvedImports.byReason[0].reason} (${r.unresolvedImports.byReason[0].count})`
          : "none pending",
      tier: "tracked",
    },
  ];

  // ONLY alarms decide red/green. Tracked issues never hold the headline.
  const healthy = r.alarms === 0;

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
          {healthy ? "No alarms" : `${r.alarms} need attention`}
        </span>
      </div>
      <div style={{ padding: "16px 20px 20px" }}>
        <SectionHeading
          title="Needs attention"
          note="These should be zero. Anything here is new or unexpected."
        />
        <StatGrid stats={alarmStats} />

        <div style={{ height: 18 }} />

        <SectionHeading
          title="Tracked / known"
          note="Known, carded issues and normal workload. Counted, not alarming — these do not turn the card red."
        />
        <StatGrid stats={trackedStats} />
      </div>
    </div>
  );
}

function SectionHeading({ title, note }: { title: string; note: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          fontSize: 10.5,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          fontWeight: 600,
          color: "var(--dt-warm-600, #555)",
        }}
      >
        {title}
      </div>
      <div className="tiny muted" style={{ fontSize: 10.5, marginTop: 2 }}>
        {note}
      </div>
    </div>
  );
}

function StatGrid({ stats }: { stats: Stat[] }) {
  return (
    <div
      style={{
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
  );
}
