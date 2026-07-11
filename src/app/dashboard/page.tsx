import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge, type BadgeTone } from "@/components/Badge";
import { KpiTile, KpiGrid } from "@/components/KpiTile";
import { getDashboard } from "@/lib/dashboard.server";
import {
  listInboundEmployerLeads,
  countNewInboundLeads,
} from "@/lib/inbound-leads.server";
import { ATTENDANCE_LABEL } from "@/lib/staffing";
import { ChartCard } from "@/components/charts/ChartCard";
import { AttendanceTrendChart } from "@/components/charts/AttendanceTrendChart";
import { RevenueTrendChart } from "@/components/charts/RevenueTrendChart";
import { PipelineFunnelChart } from "@/components/charts/PipelineFunnelChart";
import { WeeklyBillingChart } from "@/components/charts/WeeklyBillingChart";
import { ApplicantsPerMonthChart } from "@/components/charts/ApplicantsPerMonthChart";
import { SiteTrafficCard } from "@/components/dashboard/SiteTrafficCard";
import { getServerDictionary, getLocale } from "@/lib/i18n/server";

function fmt$(n: number, locale: string) {
  return n.toLocaleString(locale === "es" ? "es-MX" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Time-of-day greeting. Spanish has gendered plural ("Buenos días")
// so we keep the prefix as part of the dictionary (`greetingPrefix`)
// and pick the right time-of-day noun.
function pickGreeting(d: typeof import("@/lib/i18n/locales/en").en["dashboard"]) {
  const h = new Date().getHours();
  if (h < 12) return d.morning;
  if (h < 18) return d.afternoon;
  return d.evening;
}

export default async function DashboardPage() {
  // Inbound employer leads are read directly from `sales_leads` for the
  // dashboard card + KPI below (Change 4, Leangel 2026-07-08 — the Inbox was
  // removed, so leads are surfaced here and on the Pipeline instead of being
  // mirrored into a conversation queue). No lead is lost: the card/KPI query
  // the source table, so every inbound request stays visible.
  const d = await getDashboard();
  const [inboundLeads, newInboundLeads] = await Promise.all([
    listInboundEmployerLeads(6),
    countNewInboundLeads(),
  ]);
  const dict = await getServerDictionary();
  const locale = await getLocale();
  const dd = dict.dashboard;

  // Active candidates in ATS (everything not yet hired/rejected).
  const inAts = d.pipeline.reduce(
    (s, p) => (p.status === "hired" ? s : s + p.count),
    0,
  );

  // New Applicants This Month + month-over-month (Change 3).
  const applicantsDelta = d.applicants.thisMonth - d.applicants.lastMonth;

  return (
    <Shell>
      <Topbar
        crumb={dd.crumb}
        scriptWord={dd.greetingPrefix}
        title={pickGreeting(dd)}
        actions={
          <>
            <Link href="/timecards" className="dt-btn">
              {dd.timecards}
            </Link>
            <Link href="/candidates" className="dt-btn">
              {dd.pipeline}
            </Link>
            <Link href="/roster" className="dt-btn dt-btn-gold">
              <span>{dd.viewRoster}</span>
            </Link>
          </>
        }
      />

      <KpiGrid min={200}>
        <KpiTile
          tone="green"
          label={dd.kpiActiveEmployees}
          value={d.totals.activeEmployees}
          sub={`${d.totals.totalPlacements} ${dd.kpiPlacementsSub}`}
          href="/roster"
        />
        <KpiTile
          tone="gold"
          label={dd.kpiInAts}
          value={inAts}
          sub={dd.kpiInAtsSub}
          href="/candidates"
        />
        <KpiTile
          tone={d.totals.pendingTimecards > 5 ? "amber" : "warm"}
          label={dd.kpiPendingTimecards}
          value={d.totals.pendingTimecards}
          sub={dd.kpiPendingTimecardsSub}
          href="/timecards"
        />
        {/* Change 3 — New Applicants This Month with month-over-month delta. */}
        <KpiTile
          tone="gold"
          label={dd.kpiNewApplicants}
          value={d.applicants.thisMonth}
          sub={
            applicantsDelta === 0
              ? `${dd.kpiNewApplicantsSameAs} (${d.applicants.lastMonth})`
              : applicantsDelta > 0
              ? `▲ ${applicantsDelta} ${dd.kpiNewApplicantsVsLast} (${d.applicants.lastMonth})`
              : `▼ ${Math.abs(applicantsDelta)} ${dd.kpiNewApplicantsVsLast} (${d.applicants.lastMonth})`
          }
          href="/applications"
        />
        <KpiTile
          tone={newInboundLeads > 0 ? "gold" : "warm"}
          label={dd.kpiInboundLeads}
          value={newInboundLeads}
          sub={dd.kpiInboundLeadsSub}
          href="/pipeline"
        />
        <KpiTile
          tone="gold"
          label={dd.kpiOpenInvoices}
          value={d.billing.openCount}
          sub={`$${fmt$(d.billing.openTotal, locale)}`}
          href="/invoices"
        />
        <KpiTile
          tone={d.billing.overdueCount > 0 ? "red" : "warm"}
          label={dd.kpiOverdue}
          value={d.billing.overdueCount}
          sub={
            d.billing.overdueCount > 0
              ? `${d.billing.oldestDays}${dd.kpiOldestDaysSuffix}`
              : dd.kpiOverdueNone
          }
          href="/invoices"
        />
      </KpiGrid>

      {/* Change 3 — Applicants Per Month (12 months, combined sources).
          NOTE(mockup): exact placement/styling is governed by Mockup 3; this
          keeps the current serif-title / gold-accent card look. */}
      <div style={{ marginBottom: 22 }}>
        <ChartCard
          title={dd.applicantsPerMonthTitle}
          sub={dd.applicantsPerMonthSub}
          action={
            <Link href="/applications" className="dt-btn dt-btn-ghost tiny">
              {dd.applicantsPerMonthOpen}
            </Link>
          }
        >
          <ApplicantsPerMonthChart data={d.applicants.perMonth} />
        </ChartCard>
      </div>

      <div
        className="dt-overview-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
          gap: 22,
          marginBottom: 22,
        }}
      >
        <ChartCard
          title={dd.attendanceTitle}
          sub={dd.attendanceSub}
          action={
            <Link href="/attendance" className="dt-btn dt-btn-ghost tiny">
              {dd.openAttendance}
            </Link>
          }
        >
          <AttendanceTrendChart data={d.attendanceTrend} />
        </ChartCard>

        <ChartCard
          title={dd.pipelineTitle}
          sub={dd.pipelineSub}
          action={
            <Link href="/candidates" className="dt-btn dt-btn-ghost tiny">
              {dd.openPipeline}
            </Link>
          }
        >
          <PipelineFunnelChart data={d.pipeline} />
        </ChartCard>
      </div>

      <div
        className="dt-overview-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)",
          gap: 22,
          marginBottom: 22,
        }}
      >
        <ChartCard
          title={dd.revenueTitle}
          sub={dd.revenueSub}
          action={
            <Link href="/invoices" className="dt-btn dt-btn-ghost tiny">
              {dd.openBilling}
            </Link>
          }
        >
          <RevenueTrendChart data={d.revenueTrend} />
        </ChartCard>

        <ChartCard
          title={dd.weeklyBillingTitle}
          sub={dd.weeklyBillingSub}
          action={
            <Link href="/roster" className="dt-btn dt-btn-ghost tiny">
              {dd.openRoster}
            </Link>
          }
        >
          <WeeklyBillingChart
            data={d.clientStats.map((s) => ({
              name: s.client.name,
              weeklyBilling: s.weeklyBilling,
              weeklyHours: s.weeklyHours,
              headcount: s.headcount,
            }))}
          />
        </ChartCard>

        <SiteTrafficCard />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
          gap: 22,
          marginBottom: 22,
        }}
        className="dt-overview-grid"
      >
        <div className="dt-card gold-edge">
          <div className="dt-card-head">
            <div>
              <h3>{dd.recentIncidentsTitle}</h3>
              <div className="sub">{dd.recentIncidentsSub}</div>
            </div>
            <Link href="/attendance" className="dt-btn dt-btn-ghost tiny">
              {dd.fullReport}
            </Link>
          </div>
          <div style={{ padding: "8px 0 0" }}>
            {d.incidents.length === 0 ? (
              <div
                style={{
                  padding: "32px 26px",
                  color: "var(--dt-warm-500)",
                  fontStyle: "italic",
                }}
              >
                {dd.noIncidents}
              </div>
            ) : (
              d.incidents.map((a, i) => {
                const tone: BadgeTone =
                  a.status === "no_show"
                    ? "red"
                    : a.status === "missed"
                    ? "amber"
                    : "warm";
                return (
                  <Link
                    key={`${a.employeeId}-${a.date}`}
                    href={`/employees/${a.employeeId}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "auto 1fr auto",
                      gap: 16,
                      alignItems: "center",
                      padding: "16px 26px",
                      borderBottom:
                        i < d.incidents.length - 1
                          ? "1px solid var(--dt-warm-100)"
                          : "none",
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <Avatar name={a.employeeName} />
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 400 }}>
                        {a.employeeName}{" "}
                        <span style={{ color: "var(--dt-warm-500)", fontWeight: 300 }}>
                          · {ATTENDANCE_LABEL[a.status].toLowerCase()} at {a.clientName}
                        </span>
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--dt-warm-500)", marginTop: 4 }}>
                        {a.notes ?? "—"}
                      </div>
                    </div>
                    <Badge tone={tone}>
                      {new Date(a.date).toLocaleDateString(
                        locale === "es" ? "es-MX" : "en-US",
                        { month: "short", day: "numeric" },
                      )}
                    </Badge>
                  </Link>
                );
              })
            )}
          </div>
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
              {dd.outstandingReceivables}
            </div>
            <div
              className="tab-num"
              style={{
                fontFamily: "var(--dt-display)",
                fontSize: 38,
                fontWeight: 300,
                color: "var(--dt-gold-deep)",
                marginTop: 8,
                letterSpacing: "-0.01em",
              }}
            >
              ${fmt$(d.billing.openTotal, locale)}
            </div>
            <div style={{ fontSize: 12, color: "var(--dt-warm-500)", marginTop: 6 }}>
              {d.billing.openCount}{" "}
              {d.billing.openCount === 1 ? dd.invoice : dd.invoices}{" "}
              {dd.invoicesOpen}
              {d.billing.openCount > 0 &&
                ` · ${dd.oldest} ${d.billing.oldestDays}${dd.days}`}
              {d.billing.overdueCount > 0 && (
                <>
                  {" · "}
                  <span style={{ color: "var(--dt-danger)", fontWeight: 400 }}>
                    {d.billing.overdueCount} {dd.overdue}
                  </span>
                </>
              )}
            </div>
            <div style={{ height: 1, background: "var(--dt-warm-100)", margin: "18px 0" }} />
            <div
              className="tiny muted"
              style={{
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                fontWeight: 400,
              }}
            >
              {dd.paidYTD}
            </div>
            <div
              className="tab-num"
              style={{
                fontFamily: "var(--dt-display)",
                fontSize: 22,
                fontWeight: 300,
                marginTop: 4,
              }}
            >
              ${fmt$(d.billing.paidYTD, locale)}
            </div>
            <Link
              href="/invoices"
              className="dt-btn"
              style={{ marginTop: 18, justifyContent: "center", width: "100%" }}
            >
              {dd.openBillingBtn}
            </Link>
          </div>

        </div>
      </div>

      <div className="dt-card gold-edge" style={{ marginBottom: 22 }}>
        <div className="dt-card-head">
          <div>
            <h3>{dd.inboundLeadsTitle}</h3>
            <div className="sub">{dd.inboundLeadsSub}</div>
          </div>
          <Link href="/pipeline" className="dt-btn dt-btn-ghost tiny">
            {dd.inboundLeadsOpenBtn}
          </Link>
        </div>
        <div style={{ padding: "8px 0 0" }}>
          {inboundLeads.length === 0 ? (
            <div
              style={{
                padding: "32px 26px",
                color: "var(--dt-warm-500)",
                fontStyle: "italic",
              }}
            >
              {dd.noInboundLeads}
            </div>
          ) : (
            inboundLeads.map((lead, i) => (
              <Link
                key={lead.id}
                href={`/pipeline/${lead.id}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 16,
                  alignItems: "center",
                  padding: "16px 26px",
                  borderBottom:
                    i < inboundLeads.length - 1
                      ? "1px solid var(--dt-warm-100)"
                      : "none",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 400 }}>
                    {lead.company_name}
                    {lead.stage === "new" && (
                      <span style={{ marginLeft: 8 }}>
                        <Badge tone="gold">{dd.inboundLeadsNew}</Badge>
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: "var(--dt-warm-500)",
                      marginTop: 4,
                    }}
                  >
                    {[
                      lead.contact_name,
                      lead.city,
                      lead.estimated_headcount != null
                        ? `${lead.estimated_headcount} ${dd.workersShort}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </div>
                </div>
                <Badge tone="warm">
                  {new Date(lead.created_at).toLocaleDateString(
                    locale === "es" ? "es-MX" : "en-US",
                    { month: "short", day: "numeric" },
                  )}
                </Badge>
              </Link>
            ))
          )}
        </div>
      </div>

      <div className="dt-card">
        <div className="dt-card-head">
          <div>
            <h3>{dd.activeClients}</h3>
            <div className="sub">{dd.activeClientsSub}</div>
          </div>
          <Link href="/roster" className="dt-btn dt-btn-ghost tiny">
            {dd.viewRosterLink}
          </Link>
        </div>
        <div className="dt-table-wrap">
          <table className="dt-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 22 }}>{dd.tblClient}</th>
                <th>{dd.tblHeadcount}</th>
                <th>{dd.tblPlacements}</th>
                <th>{dd.tblMissed30}</th>
                <th>{dd.tblHoursWk}</th>
                <th style={{ textAlign: "right", paddingRight: 22 }}>
                  {dd.tblEstWeeklyBilling}
                </th>
              </tr>
            </thead>
            <tbody>
              {d.clientStats.map((s) => (
                <tr key={s.client.id}>
                  <td style={{ paddingLeft: 22 }}>
                    <div style={{ fontWeight: 400 }}>{s.client.name}</div>
                    <div
                      style={{
                        fontSize: 10.5,
                        color: "var(--dt-warm-500)",
                        marginTop: 3,
                        letterSpacing: "0.06em",
                      }}
                    >
                      {s.client.city ?? "—"} · {s.client.industry ?? "—"}
                    </div>
                  </td>
                  <td className="tab-num">{s.headcount}</td>
                  <td className="tab-num">{s.placements}</td>
                  <td
                    className="tab-num"
                    style={{
                      color:
                        s.missed >= 4
                          ? "var(--dt-danger)"
                          : s.missed >= 1
                          ? "var(--dt-warning)"
                          : "var(--dt-success)",
                      fontWeight: 400,
                    }}
                  >
                    {s.missed}
                  </td>
                  <td className="tab-num">{s.weeklyHours}</td>
                  <td
                    className="tab-num"
                    style={{
                      textAlign: "right",
                      paddingRight: 22,
                      fontWeight: 400,
                    }}
                  >
                    ${fmt$(s.weeklyBilling, locale)}
                  </td>
                </tr>
              ))}
              {d.clientStats.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      textAlign: "center",
                      padding: "32px 22px",
                      color: "var(--dt-warm-500)",
                      fontStyle: "italic",
                    }}
                  >
                    {dd.noClients}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
