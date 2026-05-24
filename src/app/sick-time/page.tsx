import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import {
  listEmployeeSickRows,
  listEmployeesForPicker,
  listSickEntriesForEmployee,
} from "@/lib/hr.server";
import {
  CA_SICK_ACCRUAL_CAP_HOURS,
  CA_SICK_ANNUAL_USAGE_HOURS,
  SICK_ENTRY_LABEL,
  SICK_ENTRY_TONE,
  fmtDate,
  fmtDateShort,
} from "@/lib/hr";
import { logSickEntry, deleteSickEntry } from "./actions";

export default async function SickTimePage({
  searchParams,
}: {
  searchParams: Promise<{ employee?: string }>;
}) {
  const sp = await searchParams;
  const focusEmployeeId = sp.employee;

  const [rows, employeePicker, focusEntries] = await Promise.all([
    listEmployeeSickRows(),
    listEmployeesForPicker(),
    focusEmployeeId ? listSickEntriesForEmployee(focusEmployeeId, 100) : Promise.resolve([]),
  ]);

  const focusRow = focusEmployeeId ? rows.find((r) => r.employee.id === focusEmployeeId) ?? null : null;

  const totalBalance = rows.reduce((s, r) => s + r.balance, 0);
  const lowBalance = rows.filter((r) => r.balance < 8 && r.employee.status === "active").length;
  const highUsers = rows.filter((r) => r.ytdUsed >= CA_SICK_ANNUAL_USAGE_HOURS).length;

  return (
    <Shell>
      <Topbar
        crumb="HR / SICK TIME"
        scriptWord="Paid "
        title="Sick Time"
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
          marginBottom: 22,
        }}
      >
        <KPI label="Employees" value={String(rows.length)} sub="tracked" />
        <KPI
          label="Total Balance"
          value={totalBalance.toFixed(1)}
          sub="hours pooled"
          accent="var(--dt-gold-deep)"
        />
        <KPI
          label="Low Balance"
          value={String(lowBalance)}
          sub="< 8 hrs · active staff"
          accent={lowBalance > 0 ? "var(--dt-warning)" : "var(--dt-black)"}
        />
        <KPI
          label="At Annual Max"
          value={String(highUsers)}
          sub={`used ${CA_SICK_ANNUAL_USAGE_HOURS}+ hrs YTD`}
          accent={highUsers > 0 ? "var(--dt-warning)" : "var(--dt-black)"}
        />
      </div>

      <div
        style={{
          fontSize: 11,
          color: "var(--dt-warm-500)",
          background: "var(--dt-warm-50)",
          border: "1px solid var(--dt-warm-150)",
          borderLeft: "3px solid var(--dt-gold)",
          padding: "10px 14px",
          marginBottom: 22,
          letterSpacing: "0.04em",
          lineHeight: 1.5,
        }}
      >
        <strong style={{ fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", fontSize: 10 }}>
          CA Labor Code § 246
        </strong>
        {" — "}
        Accrual rate 1 hr per 30 hrs worked. Annual usage minimum {CA_SICK_ANNUAL_USAGE_HOURS} hrs / 5 days.
        Accrual cap {CA_SICK_ACCRUAL_CAP_HOURS} hrs / 10 days.
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 360px",
          gap: 22,
          alignItems: "start",
        }}
      >
        {/* Roster table */}
        <div className="dt-card gold-edge">
          <div className="dt-card-head">
            <div>
              <h3>Sick Time Balances</h3>
              <div className="sub">{rows.length} employees · click to log entry</div>
            </div>
          </div>
          <div className="dt-table-wrap">
            <table className="dt-table">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 22 }}>Employee</th>
                  <th style={{ textAlign: "right" }}>Balance</th>
                  <th style={{ textAlign: "right" }}>YTD Accrued</th>
                  <th style={{ textAlign: "right" }}>YTD Used</th>
                  <th>Last Entry</th>
                  <th style={{ paddingRight: 22 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isLow = r.balance < 8 && r.employee.status === "active";
                  const atMax = r.ytdUsed >= CA_SICK_ANNUAL_USAGE_HOURS;
                  const isFocus = focusEmployeeId === r.employee.id;
                  return (
                    <tr
                      key={r.employee.id}
                      style={isFocus ? { background: "var(--dt-gold-50)" } : undefined}
                    >
                      <td style={{ paddingLeft: 22 }}>
                        <a
                          href={`/sick-time?employee=${r.employee.id}`}
                          className="dt-person dt-person-link"
                        >
                          <Avatar name={r.employee.full_name} />
                          <div>
                            <div className="name">{r.employee.full_name}</div>
                            <div className="meta">
                              {r.employee.city ?? "—"} · {r.employee.status}
                            </div>
                          </div>
                        </a>
                      </td>
                      <td
                        className="tab-num"
                        style={{
                          textAlign: "right",
                          fontWeight: 400,
                          color: isLow ? "var(--dt-warning)" : "var(--dt-black)",
                        }}
                      >
                        {r.balance.toFixed(1)}
                      </td>
                      <td className="tab-num muted" style={{ textAlign: "right" }}>
                        {r.ytdAccrued.toFixed(1)}
                      </td>
                      <td
                        className="tab-num"
                        style={{
                          textAlign: "right",
                          color: atMax ? "var(--dt-warning)" : "var(--dt-warm-500)",
                        }}
                      >
                        {r.ytdUsed.toFixed(1)}
                      </td>
                      <td className="muted" style={{ fontSize: 11.5 }}>
                        {r.lastEntry ? (
                          <span>
                            <Badge tone={SICK_ENTRY_TONE[r.lastEntry.entry_type]}>
                              {SICK_ENTRY_LABEL[r.lastEntry.entry_type]}
                            </Badge>
                            <span style={{ marginLeft: 8 }}>
                              {fmtDateShort(r.lastEntry.entry_date)}
                            </span>
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={{ paddingRight: 22 }}>
                        {isLow ? (
                          <Badge tone="amber">Low</Badge>
                        ) : atMax ? (
                          <Badge tone="gold">Max used</Badge>
                        ) : r.employee.status === "onboarding" ? (
                          <Badge tone="warm">Onboarding</Badge>
                        ) : (
                          <Badge tone="green">OK</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
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
                      No employees to track yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Side panel: log entry */}
        <aside className="dt-card" style={{ padding: 0 }}>
          <div className="dt-card-head">
            <div>
              <h3>{focusRow ? "Log Entry" : "Log Sick Time"}</h3>
              <div className="sub">
                {focusRow ? focusRow.employee.full_name : "Pick an employee or log directly"}
              </div>
            </div>
          </div>

          <form action={logSickEntry} style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
            <Field label="Employee">
              <select
                name="employee_id"
                defaultValue={focusEmployeeId ?? ""}
                required
                className="dt-filter-input"
              >
                <option value="">Select employee…</option>
                {employeePicker.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name}
                  </option>
                ))}
              </select>
            </Field>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Type">
                <select name="entry_type" defaultValue="usage" required className="dt-filter-input">
                  <option value="accrual">Accrual</option>
                  <option value="usage">Used</option>
                  <option value="adjustment">Adjustment</option>
                  <option value="payout">Payout</option>
                </select>
              </Field>
              <Field label="Hours">
                <input
                  name="hours"
                  type="number"
                  step="0.25"
                  min="0"
                  required
                  className="dt-filter-input"
                  placeholder="0.0"
                />
              </Field>
            </div>

            <Field label="Date">
              <input
                name="entry_date"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                className="dt-filter-input"
              />
            </Field>

            <Field label="Notes">
              <textarea
                name="notes"
                rows={3}
                className="dt-filter-input"
                placeholder="Reason, doctor's note ref, etc."
                style={{ resize: "vertical", minHeight: 60 }}
              />
            </Field>

            <Field label="Logged by">
              <input
                name="created_by"
                type="text"
                className="dt-filter-input"
                placeholder="Your name"
              />
            </Field>

            <button type="submit" className="dt-btn dt-btn-primary" style={{ marginTop: 4 }}>
              <span>Log Entry</span>
            </button>
          </form>

          {focusRow && focusEntries.length > 0 && (
            <div style={{ borderTop: "1px solid var(--dt-warm-100)", padding: "16px 22px" }}>
              <div className="tiny" style={{ color: "var(--dt-warm-500)", marginBottom: 10 }}>
                Recent · {focusEntries.length}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {focusEntries.slice(0, 12).map((e) => (
                  <div
                    key={e.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      borderBottom: "1px dashed var(--dt-warm-100)",
                      paddingBottom: 8,
                      gap: 8,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Badge tone={SICK_ENTRY_TONE[e.entry_type]}>
                          {SICK_ENTRY_LABEL[e.entry_type]}
                        </Badge>
                        <span className="tab-num" style={{ fontSize: 12.5, fontWeight: 400 }}>
                          {(e.entry_type === "accrual" || e.entry_type === "adjustment" ? "+" : "−")}
                          {Number(e.hours).toFixed(1)} hr
                        </span>
                      </div>
                      <div className="muted" style={{ fontSize: 10.5, marginTop: 4 }}>
                        {fmtDate(e.entry_date)}
                        {e.notes ? ` · ${e.notes}` : ""}
                      </div>
                    </div>
                    <form action={async () => { "use server"; await deleteSickEntry(e.id, focusRow.employee.id); }}>
                      <button
                        type="submit"
                        className="dt-btn dt-btn-ghost"
                        style={{ padding: "4px 8px", fontSize: 9, letterSpacing: "0.16em" }}
                        title="Delete entry (reverses balance change)"
                      >
                        <span>×</span>
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </Shell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="dt-filter">
      <span className="dt-filter-label">{label}</span>
      {children}
    </label>
  );
}

function KPI({
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
    <div className="dt-card" style={{ padding: "18px 20px" }}>
      <div
        style={{
          fontSize: 10.5,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--dt-warm-500)",
          fontWeight: 400,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
        <div
          className="tab-num"
          style={{
            fontFamily: "var(--dt-display)",
            fontSize: 28,
            fontWeight: 300,
            color: accent || "var(--dt-black)",
            letterSpacing: "-0.01em",
          }}
        >
          {value}
        </div>
        {sub && <div style={{ fontSize: 11.5, color: "var(--dt-warm-500)" }}>{sub}</div>}
      </div>
    </div>
  );
}
