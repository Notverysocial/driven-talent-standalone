import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { getPayrollPeriodDetail } from "@/lib/payroll.server";
import {
  FLAG_LABELS,
  PAYROLL_PERIOD_STATUSES,
  fmtMoney,
  fmtPeriodRange,
} from "@/lib/payroll";
import { PeriodActions } from "./PeriodActions";
import type { TimecardFlags } from "@/lib/supabase/types";

function flagsSummary(f: TimecardFlags): string[] {
  const out: string[] = [];
  if (f.missed_punch) out.push(`Missed punch${f.punch_day ? ` · ${f.punch_day}` : ""}`);
  if (f.hours_mismatch) out.push(`Hours mismatch${f.reason ? ` · ${f.reason}` : ""}`);
  return out;
}
void FLAG_LABELS;

export default async function PayrollPeriodDetailPage({
  params,
}: {
  params: Promise<{ periodId: string }>;
}) {
  const { periodId } = await params;
  const detail = await getPayrollPeriodDetail(periodId);
  if (!detail) notFound();

  const status = PAYROLL_PERIOD_STATUSES.find((s) => s.id === detail.period.status)!;

  return (
    <Shell>
      <Topbar
        crumb={`OPERATIONS / PAYROLL · ${fmtPeriodRange(detail.period.start_date, detail.period.end_date).toUpperCase()}`}
        scriptWord="Pay "
        title="Period"
        actions={
          <>
            <Link href="/payroll" className="dt-btn">
              ← All Periods
            </Link>
            <Link
              href={`/payroll/${detail.period.id}/export?format=peoplease`}
              className="dt-btn"
            >
              PEOPLEASE Export
            </Link>
            <PeriodActions periodId={detail.period.id} status={detail.period.status} />
          </>
        }
      />

      {/* Header card */}
      <div
        className="dt-card gold-edge"
        style={{
          padding: "22px 26px",
          marginBottom: 22,
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: 24,
        }}
      >
        <div style={{ minWidth: 220 }}>
          <div className="tiny muted" style={{ letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 400 }}>
            Period
          </div>
          <div
            style={{
              fontFamily: "var(--dt-display)",
              fontSize: 22,
              fontWeight: 300,
              marginTop: 4,
            }}
          >
            {fmtPeriodRange(detail.period.start_date, detail.period.end_date)}
          </div>
          <div style={{ marginTop: 10 }}>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          {detail.period.approved_by && (
            <div style={{ fontSize: 11, color: "var(--dt-warm-500)", marginTop: 8 }}>
              Approved by {detail.period.approved_by}
              {detail.period.approved_at &&
                ` · ${new Date(detail.period.approved_at).toLocaleDateString("en-US", {
                  month: "short", day: "numeric", year: "numeric",
                })}`}
            </div>
          )}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            gap: 16,
            alignItems: "flex-start",
          }}
        >
          <Stat label="Employees" value={String(detail.totals.employees)} />
          <Stat label="Regular" value={detail.totals.reg.toFixed(1)} sub="hours" />
          <Stat
            label="Overtime"
            value={detail.totals.ot.toFixed(1)}
            sub="hours"
            accent="var(--dt-gold-deep)"
          />
          <Stat label="Sick" value={detail.totals.sick.toFixed(1)} sub="hours" />
          <Stat
            label="Flags"
            value={String(detail.totals.flagged)}
            accent={detail.totals.flagged > 0 ? "var(--dt-danger)" : "var(--dt-black)"}
          />
          <Stat
            label="Billable"
            value={`$${fmtMoney(detail.totals.billable)}`}
            accent="var(--dt-gold-deep)"
          />
        </div>
      </div>

      {/* Per-client */}
      <div className="dt-card" style={{ marginBottom: 22 }}>
        <div className="dt-card-head">
          <div>
            <h3>By Client</h3>
            <div className="sub">Hours and billable totals by client</div>
          </div>
        </div>
        <div className="dt-table-wrap">
          <table className="dt-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 22 }}>Client</th>
                <th>Format</th>
                <th>Employees</th>
                <th>Timecards</th>
                <th>Reg</th>
                <th>OT</th>
                <th>Sick</th>
                <th style={{ textAlign: "right", paddingRight: 22 }}>Billable</th>
              </tr>
            </thead>
            <tbody>
              {detail.perClient.map((c) => (
                <tr key={c.client.id}>
                  <td style={{ paddingLeft: 22, fontWeight: 400 }}>{c.client.name}</td>
                  <td>
                    <Badge tone="warm">
                      {c.client.report_format === "hours_spent"
                        ? "Hours Spent"
                        : c.client.report_format === "timecard"
                        ? "Timecard"
                        : "Standard"}
                    </Badge>{" "}
                    <Link
                      href={`/payroll/${detail.period.id}/export?format=client&client=${c.client.id}`}
                      className="dt-btn dt-btn-ghost tiny"
                      style={{ marginLeft: 6 }}
                    >
                      Export →
                    </Link>
                  </td>
                  <td className="tab-num">{c.employees}</td>
                  <td className="tab-num">{c.timecardCount}</td>
                  <td className="tab-num">{c.reg.toFixed(1)}</td>
                  <td
                    className="tab-num"
                    style={{ color: c.ot > 0 ? "var(--dt-gold-deep)" : "var(--dt-warm-300)" }}
                  >
                    {c.ot.toFixed(1)}
                  </td>
                  <td className="tab-num">{c.sick.toFixed(1)}</td>
                  <td
                    className="tab-num"
                    style={{
                      textAlign: "right",
                      paddingRight: 22,
                      fontWeight: 400,
                      color: "var(--dt-gold-deep)",
                    }}
                  >
                    ${fmtMoney(c.billable)}
                  </td>
                </tr>
              ))}
              {detail.perClient.length === 0 && (
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
                    No timecards in this period yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-employee */}
      <div className="dt-card" style={{ marginBottom: 22 }}>
        <div className="dt-card-head">
          <div>
            <h3>Per Employee</h3>
            <div className="sub">Reg / OT / Sick breakdown for PEOPLEASE entry</div>
          </div>
        </div>
        <div className="dt-table-wrap">
          <table className="dt-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 22 }}>Employee</th>
                <th>Timecards</th>
                <th>Reg</th>
                <th>OT</th>
                <th>Sick</th>
                <th>Holiday</th>
                <th>Sick Bal.</th>
                <th>Flags</th>
                <th style={{ textAlign: "right", paddingRight: 22 }}>Billable</th>
              </tr>
            </thead>
            <tbody>
              {detail.perEmployee.map((e) => (
                <tr key={e.employee.id}>
                  <td style={{ paddingLeft: 22 }}>
                    <Link
                      href={`/employees/${e.employee.id}`}
                      className="dt-person dt-person-link"
                    >
                      <Avatar name={e.employee.full_name} />
                      <div>
                        <div className="name">{e.employee.full_name}</div>
                      </div>
                    </Link>
                  </td>
                  <td className="tab-num">{e.timecardCount}</td>
                  <td className="tab-num">{e.reg.toFixed(1)}</td>
                  <td
                    className="tab-num"
                    style={{ color: e.ot > 0 ? "var(--dt-gold-deep)" : "var(--dt-warm-300)" }}
                  >
                    {e.ot.toFixed(1)}
                  </td>
                  <td className="tab-num">{e.sick.toFixed(1)}</td>
                  <td className="tab-num">{e.holiday.toFixed(1)}</td>
                  <td className="tab-num" style={{ fontSize: 11, color: "var(--dt-warm-500)" }}>
                    {Number(e.employee.sick_hours_balance).toFixed(1)}h
                  </td>
                  <td
                    className="tab-num"
                    style={{
                      color: e.flags > 0 ? "var(--dt-danger)" : "var(--dt-warm-400)",
                      fontWeight: e.flags > 0 ? 400 : 300,
                    }}
                  >
                    {e.flags}
                  </td>
                  <td
                    className="tab-num"
                    style={{
                      textAlign: "right",
                      paddingRight: 22,
                      fontWeight: 400,
                      color: "var(--dt-gold-deep)",
                    }}
                  >
                    ${fmtMoney(e.billable)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audit / flags */}
      <div className="dt-card">
        <div className="dt-card-head">
          <div>
            <h3>Timecard Audit</h3>
            <div className="sub">
              Discrepancy flags surfaced during the audit step
            </div>
          </div>
          <Badge tone={detail.totals.flagged > 0 ? "red" : "green"}>
            {detail.totals.flagged} flagged
          </Badge>
        </div>
        <div className="dt-table-wrap">
          <table className="dt-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 22 }}>Employee</th>
                <th>Client</th>
                <th>Week</th>
                <th>Hours</th>
                <th>Flags</th>
                <th style={{ textAlign: "right", paddingRight: 22 }}>Open</th>
              </tr>
            </thead>
            <tbody>
              {detail.timecards.map((t) => {
                const flags = flagsSummary(t.flags);
                return (
                  <tr key={t.id}>
                    <td style={{ paddingLeft: 22 }}>{t.employees.full_name}</td>
                    <td>{t.clients.name}</td>
                    <td className="tab-num" style={{ fontSize: 12 }}>
                      {fmtPeriodRange(t.week_start, new Date(new Date(t.week_start + "T00:00:00").getTime() + 6 * 86_400_000).toISOString().slice(0, 10))}
                    </td>
                    <td className="tab-num">
                      {Number(t.reg_hours).toFixed(1)}
                      {Number(t.ot_hours) > 0 && (
                        <span style={{ color: "var(--dt-gold-deep)", marginLeft: 6 }}>
                          + {Number(t.ot_hours).toFixed(1)} OT
                        </span>
                      )}
                    </td>
                    <td>
                      {flags.length === 0 ? (
                        <span
                          style={{
                            fontSize: 10.5,
                            letterSpacing: "0.16em",
                            textTransform: "uppercase",
                            color: "var(--dt-success)",
                          }}
                        >
                          ✓ Clean
                        </span>
                      ) : (
                        flags.map((f) => (
                          <Badge key={f} tone="red">
                            {f}
                          </Badge>
                        ))
                      )}
                    </td>
                    <td style={{ textAlign: "right", paddingRight: 22 }}>
                      <Link
                        href={`/timecards/${t.id}`}
                        className="dt-btn dt-btn-ghost tiny"
                      >
                        Open →
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {detail.timecards.length === 0 && (
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
                    No timecards in this date range.
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

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 9.5,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--dt-warm-500)",
          fontWeight: 400,
        }}
      >
        {label}
      </div>
      <div
        className="tab-num"
        style={{
          fontFamily: "var(--dt-display)",
          fontSize: 22,
          fontWeight: 300,
          color: accent || "var(--dt-black)",
          marginTop: 4,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 10.5, color: "var(--dt-warm-500)", marginTop: 2 }}>{sub}</div>
      )}
    </div>
  );
}
