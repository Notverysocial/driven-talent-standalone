import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { getServerDictionary } from "@/lib/i18n/server";
import {
  buildPeriodVerification,
  listPeriodVerifications,
  listVerifiablePeriods,
} from "@/lib/verification.server";
import type { VerificationDetail } from "@/lib/supabase/types";
import { SignOffButton } from "./SignOffButton";

function fmtPeriod(start: string, end: string): string {
  const f = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${f(start)} — ${f(end)}, ${new Date(end + "T00:00:00").getFullYear()}`;
}

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function StatusBadge({ status }: { status: VerificationDetail["status"] }) {
  if (status === "match") return <Badge tone="green">Match</Badge>;
  if (status === "variance") return <Badge tone="amber">Variance</Badge>;
  return <Badge tone="red">Missing</Badge>;
}

export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const sp = await searchParams;
  const periods = await listVerifiablePeriods();
  const periodId = sp.period || periods[0]?.id || "";

  const tb = (await getServerDictionary()).topbar.reconciliation;

  const [result, history] = await Promise.all([
    periodId ? buildPeriodVerification(periodId) : Promise.resolve(null),
    periodId ? listPeriodVerifications(periodId) : Promise.resolve([]),
  ]);

  return (
    <Shell>
      <Topbar crumb={tb.crumb} scriptWord={tb.scriptWord} title={tb.title} />

      {/* Period picker */}
      <form method="get" className="dt-card" style={{ padding: "14px 18px", marginBottom: 18, display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label className="dt-filter" style={{ flex: "1 1 280px" }}>
          <span className="dt-filter-label">Payroll period</span>
          <select name="period" defaultValue={periodId} className="dt-filter-input">
            {periods.length === 0 && <option value="">No payroll periods yet</option>}
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {fmtPeriod(p.start_date, p.end_date)} · {p.status}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="dt-btn dt-btn-primary">Load</button>
      </form>

      {!result ? (
        <div className="dt-card" style={{ padding: "44px 28px", textAlign: "center", color: "var(--dt-warm-500)" }}>
          Select a payroll period to verify hours across the time card, invoice, and payroll views.
        </div>
      ) : (
        <>
          <div className="dt-card gold-edge" style={{ padding: "20px 26px", marginBottom: 20, display: "flex", flexWrap: "wrap", gap: 28, alignItems: "center" }}>
            <div style={{ flex: "1 1 240px" }}>
              <div className="tiny muted" style={{ letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 400 }}>Verifying</div>
              <div style={{ fontFamily: "var(--dt-display)", fontSize: 19, fontWeight: 300, marginTop: 4 }}>
                {fmtPeriod(result.period.start_date, result.period.end_date)}
              </div>
              <div className="tiny muted" style={{ marginTop: 2 }}>{result.employeeCount} employees · time card ↔ invoice ↔ payroll</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div className="tab-num" style={{ fontFamily: "var(--dt-display)", fontSize: 26, fontWeight: 300, color: "var(--dt-warning)" }}>{result.varianceCount}</div>
              <div className="tiny muted">Variances</div>
            </div>
            <div style={{ textAlign: "center", paddingLeft: 24, borderLeft: "1px solid var(--dt-warm-150)" }}>
              <div className="tiny muted" style={{ letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 400 }}>Deduction = 0</div>
              <div style={{ marginTop: 6 }}>
                {result.deductionZeroOk ? (
                  <Badge tone="green">Balanced ({result.netDeltaHours}h)</Badge>
                ) : (
                  <Badge tone="red">Off by {result.netDeltaHours}h</Badge>
                )}
              </div>
            </div>
            <div style={{ marginLeft: "auto" }}>
              <SignOffButton periodId={result.period.id} clean={result.varianceCount === 0 && result.deductionZeroOk} />
            </div>
          </div>

          <div className="dt-card" style={{ overflow: "hidden" }}>
            <div className="dt-table-wrap">
              <table className="dt-table">
                <thead>
                  <tr>
                    <th style={{ paddingLeft: 22 }}>Employee</th>
                    <th style={{ textAlign: "right" }}>Time Card</th>
                    <th style={{ textAlign: "right" }}>Invoice</th>
                    <th style={{ textAlign: "right" }}>Payroll</th>
                    <th style={{ textAlign: "right" }}>Δ Hrs</th>
                    <th style={{ paddingRight: 22 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r, i) => (
                    <tr key={`${r.employee_id}-${i}`}>
                      <td style={{ paddingLeft: 22 }}>
                        <div className="dt-person">
                          <Avatar name={r.name} />
                          <div>
                            <div className="name">{r.name}</div>
                            {r.note && (
                              <div style={{ fontSize: 11, color: r.status === "missing" ? "var(--dt-danger)" : "var(--dt-warning)", marginTop: 2 }}>
                                {r.note}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="tab-num" style={{ textAlign: "right" }}>{r.timecard_hours.toFixed(2)}</td>
                      <td className="tab-num" style={{ textAlign: "right" }}>{r.invoice_hours.toFixed(2)}</td>
                      <td className="tab-num" style={{ textAlign: "right" }}>{r.payroll_hours.toFixed(2)}</td>
                      <td className="tab-num" style={{ textAlign: "right", color: Math.abs(r.delta_hours) > 0.01 ? "var(--dt-warning)" : "var(--dt-warm-400)" }}>
                        {r.delta_hours > 0 ? "+" : ""}{r.delta_hours.toFixed(2)}
                      </td>
                      <td style={{ paddingRight: 22 }}><StatusBadge status={r.status} /></td>
                    </tr>
                  ))}
                  {result.rows.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", padding: "32px 22px", color: "var(--dt-warm-500)", fontStyle: "italic" }}>
                        No time cards or invoices in this period.
                      </td>
                    </tr>
                  )}
                  {result.rows.length > 0 && (
                    <tr style={{ borderTop: "2px solid var(--dt-warm-200)", fontWeight: 600 }}>
                      <td style={{ paddingLeft: 22 }}>TOTAL</td>
                      <td className="tab-num" style={{ textAlign: "right" }}>{result.totals.timecard.toFixed(2)}</td>
                      <td className="tab-num" style={{ textAlign: "right" }}>{result.totals.invoice.toFixed(2)}</td>
                      <td className="tab-num" style={{ textAlign: "right" }}>{result.totals.payroll.toFixed(2)}</td>
                      <td className="tab-num" style={{ textAlign: "right" }}>{result.netDeltaHours.toFixed(2)}</td>
                      <td style={{ paddingRight: 22 }} />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {history.length > 0 && (
            <div className="dt-card" style={{ marginTop: 18, padding: "14px 20px" }}>
              <div className="tiny muted" style={{ letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 400, marginBottom: 8 }}>
                Verification history
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {history.map((v) => (
                  <div key={v.id} style={{ fontSize: 12, display: "flex", gap: 10, alignItems: "center" }}>
                    <Badge tone={v.result === "clean" ? "green" : "amber"}>{v.result}</Badge>
                    <span>{v.verified_by ?? "—"}</span>
                    <span className="muted">{fmtWhen(v.verified_at)}</span>
                    <span className="muted">· {v.variance_count} variances · deduction {v.deduction_zero_ok ? "balanced" : "off"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Shell>
  );
}
