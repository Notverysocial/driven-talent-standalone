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

function pct(n: number, total: number) {
  return total === 0 ? 0 : Math.round((n / total) * 100);
}

export default async function OnboardingListPage() {
  const summaries = await listOnboardingSummaries();

  return (
    <Shell>
      <Topbar
        crumb="PEOPLE OPS / ONBOARDING"
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
        <KPI
          label="Avg Progress"
          value={
            summaries.length === 0
              ? "—"
              : `${Math.round(
                  summaries.reduce(
                    (s, x) =>
                      s +
                      (pct(x.doneSteps, x.totalSteps) +
                        pct(x.doneDocs, x.totalDocs)) /
                        2,
                    0,
                  ) / summaries.length,
                )}%`
          }
          sub="across cohort"
        />
        <KPI
          label="Stalled"
          value={String(
            summaries.filter(
              (x) => pct(x.doneSteps, x.totalSteps) < 50 && pct(x.doneDocs, x.totalDocs) < 50,
            ).length,
          )}
          sub="< 50% on both tracks"
          accent="var(--dt-warning)"
        />
        <KPI
          label="Ready to Activate"
          value={String(
            summaries.filter(
              (x) =>
                x.totalSteps > 0 &&
                x.doneSteps === x.totalSteps &&
                x.totalDocs > 0 &&
                x.doneDocs === x.totalDocs,
            ).length,
          )}
          sub="all checks complete"
          accent="var(--dt-success)"
        />
      </div>

      <div className="dt-card gold-edge">
        <div className="dt-card-head">
          <div>
            <h3>{summaries.length} {summaries.length === 1 ? "person" : "people"} onboarding</h3>
            <div className="sub">Click in to update steps and documents</div>
          </div>
        </div>
        <div className="dt-table-wrap">
          <table className="dt-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 22 }}>Employee</th>
                <th>Hire Date</th>
                <th>Steps</th>
                <th>Documents</th>
                <th style={{ paddingRight: 22 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((s) => {
                const stepsPct = pct(s.doneSteps, s.totalSteps);
                const docsPct = pct(s.doneDocs, s.totalDocs);
                const ready =
                  s.totalSteps > 0 && s.doneSteps === s.totalSteps && s.totalDocs > 0 && s.doneDocs === s.totalDocs;
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
                    <td className="tab-num" style={{ fontSize: 12 }}>
                      {fmtDate(s.employee.hire_date)}
                    </td>
                    <td>
                      <ProgressBar
                        done={s.doneSteps}
                        total={s.totalSteps}
                        accent={stepsPct === 100 ? "var(--dt-success)" : "var(--dt-gold)"}
                      />
                    </td>
                    <td>
                      <ProgressBar
                        done={s.doneDocs}
                        total={s.totalDocs}
                        accent={docsPct === 100 ? "var(--dt-success)" : "var(--dt-gold)"}
                      />
                    </td>
                    <td style={{ paddingRight: 22 }}>
                      {ready ? (
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
                    colSpan={5}
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

function ProgressBar({ done, total, accent }: { done: number; total: number; accent: string }) {
  const p = pct(done, total);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 120 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
        <span className="tab-num" style={{ fontWeight: 400 }}>
          {done}/{total}
        </span>
        <span className="tab-num" style={{ color: "var(--dt-warm-500)" }}>
          {p}%
        </span>
      </div>
      <div style={{ height: 4, background: "var(--dt-warm-100)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${p}%`, height: "100%", background: accent, transition: "width 200ms" }} />
      </div>
    </div>
  );
}
