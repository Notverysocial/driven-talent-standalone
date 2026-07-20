import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/Badge";
import {
  getCurrentPayrollPeriod,
  periodSummaries,
} from "@/lib/payroll.server";
import {
  PAYROLL_PERIOD_STATUSES,
  fmtMoney,
  fmtPeriodRange,
} from "@/lib/payroll";
import { startOfWeek } from "@/lib/timecards";
import { createPayrollPeriod } from "./actions";
import { getServerDictionary } from "@/lib/i18n/server";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function PayrollPage() {
  const [current, summaries] = await Promise.all([
    getCurrentPayrollPeriod(),
    periodSummaries(),
  ]);

  // The Sun..Sat week that contains today — used for the "create this week"
  // one-click CTA and to prefill the new-period form when nothing covers today.
  const thisWeekStart = startOfWeek(new Date());
  const thisWeekEnd = new Date(thisWeekStart);
  thisWeekEnd.setDate(thisWeekEnd.getDate() + 6);

  // Default for the new-period form. When no period covers today, prefill to
  // the current week so the operator can just click Create. Otherwise default
  // to the next Sun..Sat after the most recent period.
  let nextStart: Date;
  if (!current) {
    nextStart = new Date(thisWeekStart);
  } else if (summaries.length > 0) {
    const latest = new Date(summaries[0].period.end_date + "T00:00:00");
    latest.setDate(latest.getDate() + 1);
    nextStart = latest;
  } else {
    nextStart = new Date(thisWeekStart);
  }
  const nextEnd = new Date(nextStart);
  nextEnd.setDate(nextEnd.getDate() + 6);

  const tb = (await getServerDictionary()).topbar.payroll;

  return (
    <Shell>
      <Topbar crumb={tb.crumb} scriptWord={tb.scriptWord} title={tb.title} />

      {current ? (
        <div
          className="dt-card gold-edge"
          style={{
            padding: "20px 24px",
            marginBottom: 22,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 18,
          }}
        >
          <div>
            <div
              className="tiny muted"
              style={{ letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 400 }}
            >
              Current Pay Period
            </div>
            <div
              style={{
                fontFamily: "var(--dt-display)",
                fontSize: 22,
                fontWeight: 300,
                marginTop: 4,
              }}
            >
              {fmtPeriodRange(current.start_date, current.end_date)}
            </div>
            <div style={{ marginTop: 8 }}>
              <Badge tone={PAYROLL_PERIOD_STATUSES.find((s) => s.id === current.status)?.tone ?? "warm"}>
                {PAYROLL_PERIOD_STATUSES.find((s) => s.id === current.status)?.label ?? current.status}
              </Badge>
            </div>
          </div>
          <Link href={`/payroll/${current.id}`} className="dt-btn dt-btn-gold">
            <span>Open Period →</span>
          </Link>
        </div>
      ) : (
        <div
          className="dt-card gold-edge"
          style={{
            padding: "22px 26px",
            marginBottom: 22,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 18,
          }}
        >
          <div>
            <div
              className="tiny muted"
              style={{ letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 400 }}
            >
              Current Pay Period
            </div>
            <div
              style={{
                fontFamily: "var(--dt-display)",
                fontSize: 20,
                fontWeight: 300,
                marginTop: 4,
              }}
            >
              No pay period covers this week yet
            </div>
            <div style={{ fontSize: 12.5, color: "var(--dt-warm-500)", marginTop: 6 }}>
              Create the period for{" "}
              {fmtPeriodRange(isoDate(thisWeekStart), isoDate(thisWeekEnd))} to start
              entering time cards and building invoices.
            </div>
          </div>
          {/* One-click: create the current week and jump straight into it. */}
          <form action={createPayrollPeriod}>
            <input type="hidden" name="start_date" value={isoDate(thisWeekStart)} />
            <input type="hidden" name="end_date" value={isoDate(thisWeekEnd)} />
            <button type="submit" className="dt-btn dt-btn-gold">
              <span>+ Create this week&apos;s pay period</span>
            </button>
          </form>
        </div>
      )}

      {/* Recent periods */}
      <div className="dt-card" style={{ marginBottom: 22 }}>
        <div className="dt-card-head">
          <div>
            <h3>Recent Pay Periods</h3>
            <div className="sub">Hours, billable totals, audit flags</div>
          </div>
        </div>
        <div className="dt-table-wrap">
          <table className="dt-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 22 }}>Period</th>
                <th>Status</th>
                <th>Employees</th>
                <th>Reg</th>
                <th>OT</th>
                <th>Flags</th>
                <th>Timecards</th>
                <th style={{ textAlign: "right", paddingRight: 22 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((s) => {
                const status = PAYROLL_PERIOD_STATUSES.find((x) => x.id === s.period.status)!;
                return (
                  <tr key={s.period.id}>
                    <td style={{ paddingLeft: 22 }}>
                      <Link
                        href={`/payroll/${s.period.id}`}
                        style={{ color: "var(--dt-gold-deep)", fontWeight: 400, textDecoration: "none" }}
                      >
                        {fmtPeriodRange(s.period.start_date, s.period.end_date)}
                      </Link>
                    </td>
                    <td>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                    <td className="tab-num">{s.employees}</td>
                    <td className="tab-num">{s.reg.toFixed(1)}</td>
                    <td
                      className="tab-num"
                      style={{ color: s.ot > 0 ? "var(--dt-gold-deep)" : "var(--dt-warm-300)" }}
                    >
                      {s.ot.toFixed(1)}
                    </td>
                    <td
                      className="tab-num"
                      style={{ color: s.flagged > 0 ? "var(--dt-danger)" : "var(--dt-warm-400)", fontWeight: s.flagged > 0 ? 400 : 300 }}
                    >
                      {s.flagged}
                    </td>
                    <td className="tab-num">{s.timecardCount}</td>
                    <td style={{ textAlign: "right", paddingRight: 22 }}>
                      <Link href={`/payroll/${s.period.id}`} className="dt-btn dt-btn-ghost tiny">
                        Open →
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {summaries.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    style={{
                      textAlign: "center",
                      padding: "32px 22px",
                      color: "var(--dt-warm-500)",
                      fontStyle: "italic",
                    }}
                  >
                    No pay periods yet. Create the first one below.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New period form */}
      <form action={createPayrollPeriod} className="dt-card" style={{ padding: "22px 26px", maxWidth: 560 }}>
        <h3
          style={{
            fontFamily: "var(--dt-display)",
            fontSize: 16,
            fontWeight: 400,
            marginBottom: 6,
          }}
        >
          New Pay Period
        </h3>
        <p style={{ fontSize: 12, color: "var(--dt-warm-500)", marginBottom: 16 }}>
          Standard period is one week, Mon–Sun. The audit step recomputes
          discrepancy flags across all timecards in the date range.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, alignItems: "end" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span
              style={{
                fontSize: 10.5,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--dt-warm-500)",
                fontWeight: 400,
              }}
            >
              Start
            </span>
            <input
              type="date"
              name="start_date"
              defaultValue={isoDate(nextStart)}
              required
              className="dt-filter-input"
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span
              style={{
                fontSize: 10.5,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--dt-warm-500)",
                fontWeight: 400,
              }}
            >
              End
            </span>
            <input
              type="date"
              name="end_date"
              defaultValue={isoDate(nextEnd)}
              required
              className="dt-filter-input"
            />
          </label>
          <button type="submit" className="dt-btn dt-btn-gold">
            <span>Create Period</span>
          </button>
        </div>
      </form>

      <div style={{ marginTop: 22, fontSize: 11, color: "var(--dt-warm-500)" }}>
        Total billable across visible periods:{" "}
        <span className="tab-num" style={{ color: "var(--dt-gold-deep)", fontWeight: 400 }}>
          ${fmtMoney(0)}
        </span>{" "}
        (rolls up after audit)
      </div>
    </Shell>
  );
}
