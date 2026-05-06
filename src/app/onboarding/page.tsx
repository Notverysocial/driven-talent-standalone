import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { listOnboardingSummaries } from "@/lib/onboarding.server";

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function pct(done: number, relevant: number) {
  return relevant === 0 ? 0 : Math.round((done / relevant) * 100);
}

export default async function OnboardingListPage() {
  const summaries = await listOnboardingSummaries();

  const ready = summaries.filter(
    (s) => s.totalSteps > 0 && s.doneSteps === s.totalSteps - s.naSteps,
  ).length;
  const stalled = summaries.filter((s) => {
    const relevant = s.totalSteps - s.naSteps;
    return relevant > 0 && s.doneSteps / relevant < 0.5;
  }).length;
  const avgProgress =
    summaries.length === 0
      ? 0
      : Math.round(
          summaries.reduce((s, x) => {
            const relevant = x.totalSteps - x.naSteps;
            return s + (relevant === 0 ? 0 : (x.doneSteps / relevant) * 100);
          }, 0) / summaries.length,
        );

  return (
    <Shell>
      <Topbar
        crumb="HR / ONBOARDING"
        scriptWord="Active "
        title="Onboarding"
        actions={
          <Link href="/roster/new" className="dt-btn dt-btn-gold">
            <span>+ New Hire</span>
          </Link>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
          marginBottom: 22,
        }}
      >
        <KPI label="In Progress" value={String(summaries.length)} sub="onboarding" accent="var(--dt-gold-deep)" />
        <KPI label="Avg Progress" value={summaries.length === 0 ? "—" : `${avgProgress}%`} sub="across cohort" />
        <KPI
          label="Stalled"
          value={String(stalled)}
          sub="under 50% of steps"
          accent={stalled > 0 ? "var(--dt-warning)" : "var(--dt-black)"}
        />
        <KPI
          label="Ready to Activate"
          value={String(ready)}
          sub="all relevant steps done"
          accent="var(--dt-success)"
        />
      </div>

      <div className="dt-card gold-edge">
        <div className="dt-card-head">
          <div>
            <h3>{summaries.length} {summaries.length === 1 ? "person" : "people"} onboarding</h3>
            <div className="sub">Click in to update statuses + notes</div>
          </div>
        </div>
        <div className="dt-table-wrap">
          <table className="dt-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 22 }}>Employee</th>
                <th>Recruiter</th>
                <th>In Charge</th>
                <th>Hire Date</th>
                <th>Progress</th>
                <th style={{ paddingRight: 22 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((s) => {
                const relevant = s.totalSteps - s.naSteps;
                const p = pct(s.doneSteps, relevant);
                const isReady = relevant > 0 && s.doneSteps === relevant;
                return (
                  <tr key={s.employee.id}>
                    <td style={{ paddingLeft: 22 }}>
                      <Link
                        href={`/onboarding/${s.employee.id}`}
                        className="dt-person dt-person-link"
                      >
                        <Avatar name={s.employee.full_name} />
                        <div>
                          <div className="name">{s.employee.full_name}</div>
                          <div className="meta">{s.employee.city ?? "—"}</div>
                        </div>
                      </Link>
                    </td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {s.employee.recruiter ?? "—"}
                    </td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {s.employee.onboarding_in_charge ?? "—"}
                    </td>
                    <td className="tab-num" style={{ fontSize: 12 }}>
                      {fmtDate(s.employee.hire_date)}
                    </td>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 140 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
                          <span className="tab-num" style={{ fontWeight: 400 }}>
                            {s.doneSteps}/{relevant}
                            {s.naSteps > 0 && (
                              <span style={{ color: "var(--dt-warm-400)", marginLeft: 6 }}>
                                · {s.naSteps} N/A
                              </span>
                            )}
                          </span>
                          <span className="tab-num" style={{ color: "var(--dt-warm-500)" }}>
                            {p}%
                          </span>
                        </div>
                        <div style={{ height: 4, background: "var(--dt-warm-100)", borderRadius: 2, overflow: "hidden" }}>
                          <div
                            style={{
                              width: `${p}%`,
                              height: "100%",
                              background: p === 100 ? "var(--dt-success)" : "var(--dt-gold)",
                              transition: "width 200ms",
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td style={{ paddingRight: 22 }}>
                      {isReady ? (
                        <Badge tone="green">Ready</Badge>
                      ) : (
                        <Badge tone="amber">In progress</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
              {summaries.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      textAlign: "center",
                      padding: "48px 22px",
                      color: "var(--dt-warm-500)",
                      fontStyle: "italic",
                    }}
                  >
                    No active onboarding right now.{" "}
                    <Link href="/roster/new" style={{ color: "var(--dt-gold-deep)" }}>
                      Add a new hire →
                    </Link>
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

function KPI({ label, value, accent, sub }: { label: string; value: string; accent?: string; sub?: string }) {
  return (
    <div className="dt-card" style={{ padding: "18px 20px" }}>
      <div style={{ fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--dt-warm-500)", fontWeight: 400 }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
        <div className="tab-num" style={{ fontFamily: "var(--dt-display)", fontSize: 28, fontWeight: 300, color: accent || "var(--dt-black)", letterSpacing: "-0.01em" }}>
          {value}
        </div>
        {sub && <div style={{ fontSize: 11.5, color: "var(--dt-warm-500)" }}>{sub}</div>}
      </div>
    </div>
  );
}
