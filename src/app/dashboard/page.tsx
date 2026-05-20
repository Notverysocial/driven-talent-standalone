import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge, type BadgeTone } from "@/components/Badge";
import { getDashboard } from "@/lib/dashboard.server";
import { getInboxCounts } from "@/app/inbox/actions";
import { ATTENDANCE_LABEL } from "@/lib/staffing";

function fmt$(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const PIPELINE_TONE: Record<string, BadgeTone> = {
  applied: "warm",
  screening: "gold",
  interview: "amber",
  offer: "gold",
  hired: "green",
  rejected: "red",
};

export default async function DashboardPage() {
  const d = await getDashboard();
  const inbox = await getInboxCounts();

  const KPIS = [
    {
      label: "Active Employees",
      value: String(d.totals.activeEmployees),
      sub: `${d.totals.totalPlacements} active placements`,
      accent: "var(--dt-black)",
    },
    {
      label: "Avg Score",
      value: d.totals.avgScore ? d.totals.avgScore.toFixed(1) : "—",
      sub: `${d.totals.greenCount} green · ${d.totals.redCount} red`,
      accent: "var(--dt-gold-deep)",
    },
    {
      label: "Pending Timecards",
      value: String(d.totals.pendingTimecards),
      sub: "awaiting approval",
      accent:
        d.totals.pendingTimecards > 5
          ? "var(--dt-warning)"
          : "var(--dt-black)",
    },
    {
      label: "Unread Messages",
      value: String(inbox.unreadMessages),
      sub: "from web chat",
      accent: inbox.unreadMessages > 0 ? "var(--dt-gold-deep)" : "var(--dt-black)",
    },
    {
      label: "Open Conversations",
      value: String(inbox.openConversations),
      sub: "awaiting response",
      accent: inbox.openConversations > 0 ? "var(--dt-warning)" : "var(--dt-black)",
    },
    {
      label: "Missed Days · 30d",
      value: String(d.totals.missedLast30),
      sub: "across all clients",
      accent:
        d.totals.missedLast30 > 30
          ? "var(--dt-danger)"
          : "var(--dt-warning)",
    },
  ];

  return (
    <Shell>
      <Topbar
        crumb="WORKSPACE / OVERVIEW"
        scriptWord="Good "
        title="Morning"
        actions={
          <>
            <Link href="/timecards" className="dt-btn">
              Timecards
            </Link>
            <Link href="/candidates" className="dt-btn">
              Pipeline
            </Link>
            <Link href="/roster" className="dt-btn dt-btn-gold">
              <span>+ View Roster</span>
            </Link>
          </>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 14,
          marginBottom: 24,
        }}
      >
        {KPIS.map((k) => (
          <div key={k.label} className="dt-card" style={{ padding: "18px 20px" }}>
            <div
              style={{
                fontSize: 10.5,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--dt-warm-500)",
                fontWeight: 400,
              }}
            >
              {k.label}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 8,
                marginTop: 8,
              }}
            >
              <div
                className="tab-num"
                style={{
                  fontFamily: "var(--dt-display)",
                  fontSize: 30,
                  fontWeight: 300,
                  color: k.accent,
                  letterSpacing: "-0.01em",
                }}
              >
                {k.value}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--dt-warm-500)" }}>{k.sub}</div>
            </div>
          </div>
        ))}
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
              <h3>Recent Attendance Incidents</h3>
              <div className="sub">Missed days, no-shows, lates · last 14 days</div>
            </div>
            <Link href="/attendance" className="dt-btn dt-btn-ghost tiny">
              Full report →
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
                No incidents in the window. Everybody showed up.
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
                      {new Date(a.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
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
              Outstanding Receivables
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
              ${fmt$(d.billing.openTotal)}
            </div>
            <div style={{ fontSize: 12, color: "var(--dt-warm-500)", marginTop: 6 }}>
              {d.billing.openCount} {d.billing.openCount === 1 ? "invoice" : "invoices"} open
              {d.billing.openCount > 0 && ` · oldest ${d.billing.oldestDays} days`}
              {d.billing.overdueCount > 0 && (
                <>
                  {" · "}
                  <span style={{ color: "var(--dt-danger)", fontWeight: 400 }}>
                    {d.billing.overdueCount} overdue
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
              Paid YTD
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
              ${fmt$(d.billing.paidYTD)}
            </div>
            <Link
              href="/invoices"
              className="dt-btn"
              style={{ marginTop: 18, justifyContent: "center", width: "100%" }}
            >
              Open Billing
            </Link>
          </div>

          <div className="dt-card" style={{ padding: "18px 22px" }}>
            <div
              className="tiny muted"
              style={{
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                fontWeight: 400,
              }}
            >
              Hiring Pipeline
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                marginTop: 12,
              }}
            >
              {d.pipeline.map((p) => (
                <div
                  key={p.status}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontSize: 12.5, fontWeight: 300 }}>{p.label}</span>
                  <Badge tone={PIPELINE_TONE[p.status] ?? "warm"}>{p.count}</Badge>
                </div>
              ))}
            </div>
            <Link
              href="/candidates"
              className="dt-btn dt-btn-ghost tiny"
              style={{ marginTop: 14, padding: 0 }}
            >
              View pipeline →
            </Link>
          </div>
        </div>
      </div>

      <div className="dt-card">
        <div className="dt-card-head">
          <div>
            <h3>Active Clients</h3>
            <div className="sub">Headcount, hours, and weekly billing</div>
          </div>
          <Link href="/roster" className="dt-btn dt-btn-ghost tiny">
            View roster →
          </Link>
        </div>
        <div className="dt-table-wrap">
          <table className="dt-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 22 }}>Client</th>
                <th>Headcount</th>
                <th>Placements</th>
                <th>Missed (30d)</th>
                <th>Hours / Wk</th>
                <th style={{ textAlign: "right", paddingRight: 22 }}>
                  Est. Weekly Billing
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
                    ${fmt$(s.weeklyBilling)}
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
                    No clients yet.
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
