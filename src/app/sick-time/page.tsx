import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import {
  listEmployeeSickRows,
  listEmployeesForPicker,
  listSickEntriesForEmployee,
} from "@/lib/hr.server";
import { CA_SICK_ACCRUAL_CAP_HOURS, CA_SICK_ANNUAL_USAGE_HOURS } from "@/lib/hr";
import { logSickEntry } from "./actions";
import { getServerDictionary } from "@/lib/i18n/server";
import { SickBalancesTable } from "./SickBalancesTable";
import { RecentSickEntries } from "./RecentSickEntries";

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

  const tb = (await getServerDictionary()).topbar.sickTime;

  return (
    <Shell>
      <Topbar
        crumb={tb.crumb}
        scriptWord={tb.scriptWord}
        title={tb.title}
        actions={
          <>
            <Link href="/sick-time/export?report=sick" className="dt-btn" prefetch={false}>
              Export Sick Time (.xlsx)
            </Link>
            <Link href="/sick-time/export?report=absences" className="dt-btn" prefetch={false}>
              Export Absences (.xlsx)
            </Link>
          </>
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
        {/* Roster table (search + balances) */}
        <SickBalancesTable rows={rows} focusEmployeeId={focusEmployeeId} />

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

          {focusRow && (
            <RecentSickEntries entries={focusEntries} employeeId={focusRow.employee.id} />
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
