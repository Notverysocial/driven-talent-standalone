import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { CLIENTS, EMPLOYEES, flattenRoster, getClient } from "@/lib/data";

function fmt$(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const BILLING = {
  open: 38420.5,
  paidYTD: 412780.0,
  oldest: "12 days",
  invoicesOpen: 4,
};

const PIPELINE = [
  { stage: "New Applications", count: 14, tone: "warm" as const },
  { stage: "Screened", count: 9, tone: "gold" as const },
  { stage: "Drug Screen / BG", count: 5, tone: "amber" as const },
  { stage: "Cleared to Place", count: 2, tone: "green" as const },
];

export default function DashboardPage() {
  const rows = flattenRoster();
  const totalEmployees = new Set(rows.map((r) => r.id)).size;
  const totalPlacements = rows.length;
  const onboardingCount = EMPLOYEES.filter((e) => e.status === "onboarding").length;
  const greenCount = EMPLOYEES.filter((e) => e.band === "green").length;
  const redCount = EMPLOYEES.filter((e) => e.band === "red").length;
  const totalMissed = rows.reduce((s, r) => s + r.missedDays, 0);
  const avgScore =
    EMPLOYEES.filter((e) => e.score > 0).reduce((s, e) => s + e.score, 0) /
    EMPLOYEES.filter((e) => e.score > 0).length;

  // recent attendance incidents — pull last 5 missed/no-show events across all employees
  const incidents = EMPLOYEES.flatMap((e) =>
    e.attendance
      .filter((a) => a.status === "missed" || a.status === "no-show" || a.status === "late")
      .map((a) => ({ ...a, who: e.name, employeeId: e.id }))
  )
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 5);

  // Client breakdown
  const clientStats = CLIENTS.map((c) => {
    const placements = rows.filter((r) => r.assignment.client === c.id);
    const headcount = new Set(placements.map((p) => p.id)).size;
    const missed = placements.reduce((s, r) => {
      const m = EMPLOYEES.find((e) => e.id === r.id)!.attendance.filter(
        (x) => x.client === c.id && (x.status === "missed" || x.status === "no-show")
      ).length;
      return s + m;
    }, 0);
    const dailyHours = placements.length * 8;
    const weeklyHours = dailyHours * 5;
    const avgRate =
      placements.reduce((s, r) => s + r.assignment.rate, 0) / (placements.length || 1);
    const weeklyBilling = weeklyHours * avgRate;
    return {
      client: c,
      headcount,
      placements: placements.length,
      missed,
      weeklyHours,
      weeklyBilling,
    };
  });

  const KPIS = [
    { label: "Active Employees", value: String(totalEmployees), sub: `${totalPlacements} placements`, accent: "var(--dt-black)" },
    { label: "Avg Score", value: avgScore.toFixed(1), sub: `${greenCount} green · ${redCount} red`, accent: "var(--dt-gold-deep)" },
    { label: "Missed Days · 30d", value: String(totalMissed), sub: "across all clients", accent: totalMissed > 30 ? "var(--dt-danger)" : "var(--dt-warning)" },
    { label: "Onboarding", value: String(onboardingCount), sub: "this month", accent: "#C28B1E" },
  ];

  return (
    <Shell>
      <Topbar
        crumb="WORKSPACE / OVERVIEW"
        scriptWord="Good "
        title="Morning"
        actions={
          <>
            <Link href="/attendance" className="dt-btn">Attendance</Link>
            <Link href="/onboarding" className="dt-btn">Onboarding</Link>
            <Link href="/roster" className="dt-btn dt-btn-gold"><span>+ View Roster</span></Link>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 24 }}>
        {KPIS.map((k) => (
          <div key={k.label} className="dt-card" style={{ padding: "18px 20px" }}>
            <div style={{ fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--dt-warm-500)", fontWeight: 400 }}>{k.label}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
              <div className="tab-num" style={{ fontFamily: "var(--dt-display)", fontSize: 30, fontWeight: 300, color: k.accent, letterSpacing: "-0.01em" }}>{k.value}</div>
              <div style={{ fontSize: 11.5, color: "var(--dt-warm-500)" }}>{k.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: 22, marginBottom: 22 }} className="dt-overview-grid">
        <div className="dt-card gold-edge">
          <div className="dt-card-head">
            <div>
              <h3>Attendance Incidents · Last 5</h3>
              <div className="sub">Missed days, no-shows, lates across all clients</div>
            </div>
            <Link href="/attendance" className="dt-btn dt-btn-ghost tiny">Full report →</Link>
          </div>
          <div style={{ padding: "8px 0 0" }}>
            {incidents.length === 0 ? (
              <div style={{ padding: "32px 26px", color: "var(--dt-warm-500)", fontStyle: "italic" }}>
                No incidents in the window. Everybody showed up.
              </div>
            ) : (
              incidents.map((a, i) => {
                const client = getClient(a.client);
                const tone =
                  a.status === "no-show"
                    ? ("red" as const)
                    : a.status === "missed"
                    ? ("amber" as const)
                    : ("warm" as const);
                return (
                  <Link
                    key={i}
                    href={`/employees/${a.employeeId}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "auto 1fr auto",
                      gap: 16,
                      alignItems: "center",
                      padding: "16px 26px",
                      borderBottom: i < incidents.length - 1 ? "1px solid var(--dt-warm-100)" : "none",
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <Avatar name={a.who} />
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 400 }}>
                        {a.who}{" "}
                        <span style={{ color: "var(--dt-warm-500)", fontWeight: 300 }}>
                          · {a.status === "no-show" ? "no call no show" : a.status} at {client.name}
                        </span>
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--dt-warm-500)", marginTop: 4 }}>
                        {a.notes ?? "—"}
                      </div>
                    </div>
                    <Badge tone={tone}>
                      {new Date(a.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </Badge>
                  </Link>
                );
              })
            )}
          </div>
        </div>

        <div className="col gap-md">
          <div className="dt-card gold-edge" style={{ padding: "22px 24px" }}>
            <div className="tiny muted" style={{ letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 400 }}>Outstanding Receivables</div>
            <div className="tab-num" style={{ fontFamily: "var(--dt-display)", fontSize: 38, fontWeight: 300, color: "var(--dt-gold-deep)", marginTop: 8, letterSpacing: "-0.01em" }}>${fmt$(BILLING.open)}</div>
            <div style={{ fontSize: 12, color: "var(--dt-warm-500)", marginTop: 6 }}>{BILLING.invoicesOpen} invoices open · oldest {BILLING.oldest}</div>
            <div style={{ height: 1, background: "var(--dt-warm-100)", margin: "18px 0" }} />
            <div className="tiny muted" style={{ letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 400 }}>Paid YTD</div>
            <div className="tab-num" style={{ fontFamily: "var(--dt-display)", fontSize: 22, fontWeight: 300, marginTop: 4 }}>${fmt$(BILLING.paidYTD)}</div>
            <Link href="/invoices" className="dt-btn" style={{ marginTop: 18, justifyContent: "center", width: "100%" }}>Open Billing</Link>
          </div>

          <div className="dt-card" style={{ padding: "18px 22px" }}>
            <div className="tiny muted" style={{ letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 400 }}>Hiring Pipeline</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
              {PIPELINE.map((p) => (
                <div key={p.stage} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12.5, fontWeight: 300 }}>{p.stage}</span>
                  <Badge tone={p.tone}>{p.count}</Badge>
                </div>
              ))}
            </div>
            <Link href="/candidates" className="dt-btn dt-btn-ghost tiny" style={{ marginTop: 14, padding: 0 }}>View pipeline →</Link>
          </div>
        </div>
      </div>

      <div className="dt-card">
        <div className="dt-card-head">
          <div>
            <h3>Active Clients</h3>
            <div className="sub">Headcount, hours, and weekly billing</div>
          </div>
          <Link href="/roster" className="dt-btn dt-btn-ghost tiny">View roster →</Link>
        </div>
        <div className="dt-table-wrap">
          <table className="dt-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 22 }}>Client</th>
                <th>Headcount</th>
                <th>Placements</th>
                <th>Missed (Wk)</th>
                <th>Hours / Wk</th>
                <th style={{ textAlign: "right", paddingRight: 22 }}>Est. Weekly Billing</th>
              </tr>
            </thead>
            <tbody>
              {clientStats.map((s) => (
                <tr key={s.client.id}>
                  <td style={{ paddingLeft: 22 }}>
                    <div style={{ fontWeight: 400 }}>{s.client.name}</div>
                    <div style={{ fontSize: 10.5, color: "var(--dt-warm-500)", marginTop: 3, letterSpacing: "0.06em" }}>
                      {s.client.city} · {s.client.industry}
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
                  <td className="tab-num" style={{ textAlign: "right", paddingRight: 22, fontWeight: 400 }}>
                    ${fmt$(s.weeklyBilling)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
