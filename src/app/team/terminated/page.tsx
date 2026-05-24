import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { requireRole } from "@/lib/auth.server";
import {
  listActiveEmployeesForPicker,
  listClientsForPicker,
  listSeparatedEmployees,
} from "@/lib/team.server";
import {
  ELIGIBILITY_LABEL,
  ELIGIBILITY_TONE,
  REASON_LABEL,
  SEPARATION_ELIGIBILITIES,
  SEPARATION_REASONS,
  fmtDate,
  type SeparationEligibility,
  type SeparationReason,
} from "@/lib/team";
import { processSeparation, reinstateEmployee } from "../actions";
import { getServerDictionary } from "@/lib/i18n/server";

export default async function TerminatedPage() {
  await requireRole("admin");
  const [rows, employees, clients] = await Promise.all([
    listSeparatedEmployees(),
    listActiveEmployeesForPicker(),
    listClientsForPicker(),
  ]);

  const dnr = rows.filter((r) => r.separation?.eligibility === "do_not_return");
  const conditional = rows.filter((r) => r.separation?.eligibility === "conditional");
  const eligible = rows.filter(
    (r) => !r.separation || r.separation.eligibility === "eligible",
  );

  const tb = (await getServerDictionary()).topbar.terminated;

  return (
    <Shell>
      <Topbar
        crumb={tb.crumb}
        scriptWord={tb.scriptWord}
        title={tb.title}
        actions={
          <Link href="/team" className="dt-btn">
            ← Team Members
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
        <KPI label="Total Separated" value={String(rows.length)} sub="historical" />
        <KPI
          label="Do Not Return"
          value={String(dnr.length)}
          sub="never place"
          accent={dnr.length > 0 ? "var(--dt-danger)" : "var(--dt-black)"}
        />
        <KPI
          label="Conditional"
          value={String(conditional.length)}
          sub="select clients only"
          accent={conditional.length > 0 ? "var(--dt-warning)" : "var(--dt-black)"}
        />
        <KPI
          label="Rehire OK"
          value={String(eligible.length)}
          sub="eligible to return"
          accent="var(--dt-success)"
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
        <strong
          style={{
            fontWeight: 500,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            fontSize: 10,
          }}
        >
          Recruiter Check · Pre-Placement
        </strong>
        {" — "}
        Before placing any candidate at a client, verify their name does not appear on the
        Do Not Return list below. Conditional entries are OK only for clients listed in the
        separation record.
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 360px",
          gap: 22,
          alignItems: "start",
        }}
      >
        <div className="dt-card gold-edge">
          <div className="dt-card-head">
            <div>
              <h3>{rows.length} separated {rows.length === 1 ? "employee" : "employees"}</h3>
              <div className="sub">Most recent separation first</div>
            </div>
          </div>
          <div style={{ padding: 0 }}>
            {rows.length === 0 && (
              <div
                style={{
                  padding: "48px 22px",
                  textAlign: "center",
                  color: "var(--dt-warm-500)",
                  fontStyle: "italic",
                }}
              >
                No separated employees on file.
              </div>
            )}
            {rows.map(({ employee, separation, clientName }) => {
              const eligibility: SeparationEligibility = separation?.eligibility ?? "eligible";
              const isDnr = eligibility === "do_not_return";
              return (
                <div
                  key={employee.id}
                  style={{
                    padding: "18px 26px",
                    borderBottom: "1px solid var(--dt-warm-100)",
                    background: isDnr ? "rgba(178, 58, 58, 0.04)" : undefined,
                    borderLeft: isDnr ? "3px solid var(--dt-danger)" : undefined,
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) auto",
                    gap: 14,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <Link
                      href={`/employees/${employee.id}`}
                      className="dt-person dt-person-link"
                      style={{ fontSize: 12 }}
                    >
                      <Avatar name={employee.full_name} />
                      <div>
                        <div className="name" style={{ fontSize: 13 }}>{employee.full_name}</div>
                        <div className="meta" style={{ fontSize: 10 }}>
                          {employee.city ?? "—"}
                          {employee.hire_date && ` · hired ${fmtDate(employee.hire_date)}`}
                        </div>
                      </div>
                    </Link>

                    <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                      <Badge tone={ELIGIBILITY_TONE[eligibility]}>
                        {ELIGIBILITY_LABEL[eligibility]}
                      </Badge>
                      {separation && (
                        <Badge tone="warm">{REASON_LABEL[separation.reason]}</Badge>
                      )}
                      {separation && (
                        <Badge tone="dark">
                          Sep&nbsp;{fmtDate(separation.separation_date)}
                        </Badge>
                      )}
                      {clientName && <Badge tone="warm">{clientName}</Badge>}
                    </div>

                    {separation?.last_position && (
                      <div
                        style={{
                          marginTop: 8,
                          fontSize: 12,
                          color: "var(--dt-warm-700)",
                        }}
                      >
                        Last position: <strong style={{ fontWeight: 500 }}>{separation.last_position}</strong>
                      </div>
                    )}

                    {separation?.detail && (
                      <div
                        style={{
                          marginTop: 8,
                          fontSize: 12.5,
                          color: "var(--dt-warm-700)",
                          lineHeight: 1.5,
                        }}
                      >
                        {separation.detail}
                      </div>
                    )}

                    {isDnr && separation?.do_not_return_note && (
                      <div
                        style={{
                          marginTop: 10,
                          padding: "8px 12px",
                          background: "rgba(178, 58, 58, 0.08)",
                          border: "1px solid rgba(178, 58, 58, 0.25)",
                          borderLeft: "3px solid var(--dt-danger)",
                          fontSize: 12,
                          color: "var(--dt-danger)",
                          fontWeight: 500,
                        }}
                      >
                        DNR reason: {separation.do_not_return_note}
                      </div>
                    )}

                    {separation && (
                      <div
                        style={{
                          marginTop: 10,
                          display: "flex",
                          gap: 14,
                          fontSize: 11,
                          color: "var(--dt-warm-500)",
                          flexWrap: "wrap",
                        }}
                      >
                        <span>
                          {separation.final_check_issued ? "✓" : "○"} Final check
                        </span>
                        <span>
                          {separation.equipment_returned ? "✓" : "○"} Equipment returned
                        </span>
                        <span>
                          {separation.exit_interview_done ? "✓" : "○"} Exit interview
                        </span>
                        {separation.processed_by && (
                          <span>· processed by {separation.processed_by}</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <form
                      action={async () => {
                        "use server";
                        await reinstateEmployee(employee.id);
                      }}
                    >
                      <button
                        type="submit"
                        className="dt-btn"
                        style={{
                          padding: "5px 10px",
                          fontSize: 9.5,
                          letterSpacing: "0.14em",
                        }}
                      >
                        <span>Reinstate</span>
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="dt-card" style={{ padding: 0 }}>
          <div className="dt-card-head">
            <div>
              <h3>Process Separation</h3>
              <div className="sub">Terminate or mark DNR</div>
            </div>
          </div>
          <form
            action={processSeparation}
            style={{
              padding: "18px 22px",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <Field label="Employee">
              <select name="employee_id" required className="dt-filter-input" defaultValue="">
                <option value="">Select employee…</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.full_name}</option>
                ))}
              </select>
            </Field>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Separation date">
                <input
                  name="separation_date"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  className="dt-filter-input"
                />
              </Field>
              <Field label="Eligibility">
                <select
                  name="eligibility"
                  required
                  defaultValue="eligible"
                  className="dt-filter-input"
                >
                  {SEPARATION_ELIGIBILITIES.map((e) => (
                    <option key={e} value={e}>{ELIGIBILITY_LABEL[e as SeparationEligibility]}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Reason">
              <select name="reason" required defaultValue="voluntary" className="dt-filter-input">
                {SEPARATION_REASONS.map((r) => (
                  <option key={r} value={r}>{REASON_LABEL[r as SeparationReason]}</option>
                ))}
              </select>
            </Field>

            <Field label="Client (last assignment)">
              <select name="client_id" className="dt-filter-input" defaultValue="">
                <option value="">—</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>

            <Field label="Last position">
              <input
                name="last_position"
                type="text"
                className="dt-filter-input"
                placeholder="e.g. Warehouse Associate"
              />
            </Field>

            <Field label="Detail / narrative">
              <textarea
                name="detail"
                rows={3}
                className="dt-filter-input"
                style={{ resize: "vertical", minHeight: 60 }}
                placeholder="What happened, when, who decided"
              />
            </Field>

            <Field label="Do-Not-Return note">
              <textarea
                name="do_not_return_note"
                rows={2}
                className="dt-filter-input"
                style={{ resize: "vertical", minHeight: 50 }}
                placeholder="Only used if eligibility = Do Not Return"
              />
            </Field>

            <Field label="Processed by">
              <input
                name="processed_by"
                type="text"
                className="dt-filter-input"
                placeholder="Your name"
              />
            </Field>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                fontSize: 12,
                color: "var(--dt-warm-700)",
              }}
            >
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" name="final_check_issued" /> Final check issued
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" name="equipment_returned" /> Equipment returned
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" name="exit_interview_done" /> Exit interview done
              </label>
            </div>

            <button
              type="submit"
              className="dt-btn dt-btn-primary"
              style={{ marginTop: 4 }}
            >
              <span>Process Separation</span>
            </button>
          </form>
        </aside>
      </div>
    </Shell>
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="dt-filter">
      <span className="dt-filter-label">{label}</span>
      {children}
    </label>
  );
}
