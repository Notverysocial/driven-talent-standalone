import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import {
  listClientsForPicker,
  listDisciplinaryWarnings,
  listEmployeesForPicker,
  listSafetyIncidents,
} from "@/lib/hr.server";
import {
  INCIDENT_COMPLIANCE_FIELDS,
  INCIDENT_SEVERITY_LABEL,
  INCIDENT_SEVERITY_TONE,
  INCIDENT_STATUS_LABEL,
  INCIDENT_STATUS_TONE,
  INCIDENT_TYPE_LABEL,
  WARNING_CATEGORY_LABEL,
  WARNING_LEVEL_LABEL,
  WARNING_LEVEL_TONE,
  fmtDate,
} from "@/lib/hr";
import type {
  IncidentSeverity,
  IncidentType,
  WarningCategory,
  WarningLevel,
} from "@/lib/supabase/types";
import {
  acknowledgeWarning,
  createSafetyIncident,
  createWarning,
  markComplianceFlag,
  setIncidentStatus,
} from "./actions";

type View = "incidents" | "warnings";

export default async function SafetyPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const sp = await searchParams;
  const view: View = sp.view === "warnings" ? "warnings" : "incidents";

  const [incidents, warnings, employeePicker, clientPicker] = await Promise.all([
    listSafetyIncidents(),
    listDisciplinaryWarnings(),
    listEmployeesForPicker(),
    listClientsForPicker(),
  ]);

  const openIncidents = incidents.filter(
    (i) => i.status === "reported" || i.status === "investigating",
  ).length;
  const recordable = incidents.filter(
    (i) => i.severity === "recordable" || i.severity === "lost_time" || i.severity === "fatality",
  ).length;
  const finalWarnings = warnings.filter((w) => w.level === "final" || w.level === "suspension").length;
  const unacknowledged = warnings.filter((w) => !w.acknowledged_at).length;

  return (
    <Shell>
      <Topbar
        crumb="HR / SAFETY · WARNINGS"
        scriptWord={view === "incidents" ? "Workplace " : "Disciplinary "}
        title={view === "incidents" ? "Safety" : "Warnings"}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
          marginBottom: 22,
        }}
      >
        <KPI label="Open Incidents" value={String(openIncidents)} sub="reported / investigating" accent={openIncidents > 0 ? "var(--dt-warning)" : "var(--dt-black)"} />
        <KPI label="Recordable" value={String(recordable)} sub="Cal/OSHA tier" accent={recordable > 0 ? "var(--dt-danger)" : "var(--dt-black)"} />
        <KPI label="Final / Suspension" value={String(finalWarnings)} sub="warnings tracked" accent={finalWarnings > 0 ? "var(--dt-warning)" : "var(--dt-black)"} />
        <KPI label="Unacknowledged" value={String(unacknowledged)} sub="warnings outstanding" />
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
          Reporting Flow · Workplace Injury SOP
        </strong>
        {" — "}
        Call S1 Medical Triage (1-888-219-0044) BEFORE seeking non-emergency treatment.
        Notify Safety Manager (Rocio Aponza) by phone + email. Deliver DWC-1 within 1 working day (Labor Code § 5401).
      </div>

      {/* View toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <Link
          href="/safety"
          className={"dt-chip" + (view === "incidents" ? " active" : "")}
        >
          Incidents · {incidents.length}
        </Link>
        <Link
          href="/safety?view=warnings"
          className={"dt-chip" + (view === "warnings" ? " active" : "")}
        >
          Warnings · {warnings.length}
        </Link>
      </div>

      {view === "incidents" ? (
        <IncidentsView
          incidents={incidents}
          employees={employeePicker}
          clients={clientPicker}
        />
      ) : (
        <WarningsView
          warnings={warnings}
          employees={employeePicker}
          clients={clientPicker}
        />
      )}
    </Shell>
  );
}

function IncidentsView({
  incidents,
  employees,
  clients,
}: {
  incidents: Awaited<ReturnType<typeof listSafetyIncidents>>;
  employees: Awaited<ReturnType<typeof listEmployeesForPicker>>;
  clients: Awaited<ReturnType<typeof listClientsForPicker>>;
}) {
  return (
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
            <h3>{incidents.length} {incidents.length === 1 ? "incident" : "incidents"} on file</h3>
            <div className="sub">Compliance flags drive the outstanding tally</div>
          </div>
        </div>
        <div style={{ padding: 0 }}>
          {incidents.length === 0 && (
            <div style={{ padding: "48px 22px", textAlign: "center", color: "var(--dt-warm-500)", fontStyle: "italic" }}>
              No incidents on file yet.
            </div>
          )}
          {incidents.map((inc) => {
            const flagsDone = INCIDENT_COMPLIANCE_FIELDS.filter(
              (f) => inc[f.key as keyof typeof inc],
            ).length;
            const flagsTotal = INCIDENT_COMPLIANCE_FIELDS.length;
            return (
              <div
                key={inc.id}
                style={{
                  padding: "18px 26px",
                  borderBottom: "1px solid var(--dt-warm-100)",
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
                  gap: 14,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <Link href={`/employees/${inc.employee.id}`} className="dt-person dt-person-link" style={{ fontSize: 12 }}>
                      <Avatar name={inc.employee.full_name} />
                      <div>
                        <div className="name" style={{ fontSize: 13 }}>{inc.employee.full_name}</div>
                        <div className="meta" style={{ fontSize: 10 }}>
                          {inc.client?.name ?? "—"} · {fmtDate(inc.incident_date)}
                          {inc.incident_time ? ` · ${inc.incident_time.slice(0, 5)}` : ""}
                        </div>
                      </div>
                    </Link>
                  </div>

                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    <Badge tone={INCIDENT_STATUS_TONE[inc.status]}>{INCIDENT_STATUS_LABEL[inc.status]}</Badge>
                    <Badge tone={INCIDENT_SEVERITY_TONE[inc.severity]}>{INCIDENT_SEVERITY_LABEL[inc.severity]}</Badge>
                    <Badge tone="warm">{INCIDENT_TYPE_LABEL[inc.type]}</Badge>
                    {inc.body_part && <Badge tone="warm">{inc.body_part}</Badge>}
                  </div>

                  <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--dt-warm-700)", lineHeight: 1.5 }}>
                    {inc.description}
                  </div>

                  {/* Compliance checklist */}
                  <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 4 }}>
                    <div className="tiny" style={{ color: "var(--dt-warm-500)", marginBottom: 4 }}>
                      Compliance · {flagsDone}/{flagsTotal}
                    </div>
                    {INCIDENT_COMPLIANCE_FIELDS.map((f) => {
                      const ts = inc[f.key as keyof typeof inc] as string | null;
                      return (
                        <div
                          key={f.key}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            fontSize: 11.5,
                            padding: "4px 0",
                          }}
                        >
                          <span style={{ color: ts ? "var(--dt-success)" : "var(--dt-warm-500)" }}>
                            {ts ? "✓" : "○"} {f.label}
                          </span>
                          {ts ? (
                            <span className="tab-num muted" style={{ fontSize: 10.5 }}>
                              {fmtDate(ts)}
                            </span>
                          ) : (
                            <form
                              action={async () => {
                                "use server";
                                await markComplianceFlag(
                                  inc.id,
                                  inc.employee.id,
                                  f.key as Parameters<typeof markComplianceFlag>[2],
                                );
                              }}
                            >
                              <button
                                type="submit"
                                className="dt-btn dt-btn-ghost"
                                style={{ padding: "2px 8px", fontSize: 9, letterSpacing: "0.14em" }}
                              >
                                <span>Mark Done</span>
                              </button>
                            </form>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {inc.witnesses.length > 0 && (
                    <div style={{ marginTop: 10, fontSize: 11.5, color: "var(--dt-warm-500)" }}>
                      <span className="tiny">Witnesses</span>{" "}
                      {inc.witnesses.map((w) => w.name).join(", ")}
                    </div>
                  )}
                </div>

                {/* Status transition column */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                  {inc.status === "reported" && (
                    <StatusBtn id={inc.id} employeeId={inc.employee.id} status="investigating" label="Investigate" />
                  )}
                  {inc.status === "investigating" && (
                    <StatusBtn id={inc.id} employeeId={inc.employee.id} status="resolved" label="Resolve" />
                  )}
                  {inc.status === "resolved" && (
                    <StatusBtn id={inc.id} employeeId={inc.employee.id} status="closed" label="Close" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <aside className="dt-card" style={{ padding: 0 }}>
        <div className="dt-card-head">
          <div>
            <h3>Report Incident</h3>
            <div className="sub">Form 01 fields</div>
          </div>
        </div>
        <form
          action={createSafetyIncident}
          style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 12 }}
        >
          <Field label="Employee">
            <select name="employee_id" required className="dt-filter-input" defaultValue="">
              <option value="">Select employee…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.full_name}</option>
              ))}
            </select>
          </Field>

          <Field label="Client (worksite)">
            <select name="client_id" className="dt-filter-input" defaultValue="">
              <option value="">—</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Type">
              <select name="type" required defaultValue="injury" className="dt-filter-input">
                {(Object.keys(INCIDENT_TYPE_LABEL) as IncidentType[]).map((t) => (
                  <option key={t} value={t}>{INCIDENT_TYPE_LABEL[t]}</option>
                ))}
              </select>
            </Field>
            <Field label="Severity">
              <select name="severity" required defaultValue="unknown" className="dt-filter-input">
                {(Object.keys(INCIDENT_SEVERITY_LABEL) as IncidentSeverity[]).map((s) => (
                  <option key={s} value={s}>{INCIDENT_SEVERITY_LABEL[s]}</option>
                ))}
              </select>
            </Field>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Date">
              <input
                name="incident_date"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
                className="dt-filter-input"
              />
            </Field>
            <Field label="Time">
              <input name="incident_time" type="time" className="dt-filter-input" />
            </Field>
          </div>

          <Field label="Body part injured">
            <input name="body_part" type="text" className="dt-filter-input" placeholder="e.g., Left knee" />
          </Field>
          <Field label="Location at site">
            <input name="location" type="text" className="dt-filter-input" placeholder="Building, area" />
          </Field>
          <Field label="Description (required)">
            <textarea name="description" rows={3} required className="dt-filter-input" style={{ resize: "vertical", minHeight: 60 }} />
          </Field>
          <Field label="How exactly did it happen?">
            <textarea name="what_happened" rows={2} className="dt-filter-input" style={{ resize: "vertical", minHeight: 50 }} />
          </Field>
          <Field label="Equipment / tools used">
            <input name="equipment_used" type="text" className="dt-filter-input" />
          </Field>
          <Field label="Hazardous conditions">
            <input name="hazardous_conditions" type="text" className="dt-filter-input" placeholder="Wet floor, poor lighting…" />
          </Field>
          <Field label="Immediate treatment">
            <input name="immediate_treatment" type="text" className="dt-filter-input" placeholder="First aid kit, clinic visit…" />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Witness name">
              <input name="witness_name" type="text" className="dt-filter-input" />
            </Field>
            <Field label="Witness contact">
              <input name="witness_contact" type="text" className="dt-filter-input" />
            </Field>
          </div>

          <Field label="Reported by">
            <input name="reported_by" type="text" className="dt-filter-input" placeholder="Your name" />
          </Field>

          <button type="submit" className="dt-btn dt-btn-primary" style={{ marginTop: 4 }}>
            <span>Open Incident</span>
          </button>
        </form>
      </aside>
    </div>
  );
}

function WarningsView({
  warnings,
  employees,
  clients,
}: {
  warnings: Awaited<ReturnType<typeof listDisciplinaryWarnings>>;
  employees: Awaited<ReturnType<typeof listEmployeesForPicker>>;
  clients: Awaited<ReturnType<typeof listClientsForPicker>>;
}) {
  return (
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
            <h3>{warnings.length} {warnings.length === 1 ? "warning" : "warnings"}</h3>
            <div className="sub">Most recent first</div>
          </div>
        </div>
        <div className="dt-table-wrap">
          <table className="dt-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 22 }}>Employee</th>
                <th>Level</th>
                <th>Category</th>
                <th>Issued</th>
                <th>Description</th>
                <th style={{ paddingRight: 22 }}>Acknowledged</th>
              </tr>
            </thead>
            <tbody>
              {warnings.map((w) => (
                <tr key={w.id}>
                  <td style={{ paddingLeft: 22 }}>
                    <Link href={`/employees/${w.employee.id}`} className="dt-person dt-person-link">
                      <Avatar name={w.employee.full_name} />
                      <div>
                        <div className="name">{w.employee.full_name}</div>
                        <div className="meta">{w.client?.name ?? "—"}</div>
                      </div>
                    </Link>
                  </td>
                  <td>
                    <Badge tone={WARNING_LEVEL_TONE[w.level]}>
                      {WARNING_LEVEL_LABEL[w.level]}
                    </Badge>
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {WARNING_CATEGORY_LABEL[w.category]}
                  </td>
                  <td className="tab-num" style={{ fontSize: 12 }}>
                    <div>{fmtDate(w.issued_date)}</div>
                    {w.issued_by && <div className="muted" style={{ fontSize: 10.5 }}>by {w.issued_by}</div>}
                  </td>
                  <td style={{ fontSize: 12, maxWidth: 320, lineHeight: 1.45 }}>
                    {w.description}
                    {w.action_required && (
                      <div style={{ marginTop: 4, fontSize: 11, color: "var(--dt-warm-500)", fontStyle: "italic" }}>
                        → {w.action_required}
                      </div>
                    )}
                  </td>
                  <td style={{ paddingRight: 22 }}>
                    {w.acknowledged_at ? (
                      <span className="tab-num muted" style={{ fontSize: 11 }}>
                        {fmtDate(w.acknowledged_at)}
                      </span>
                    ) : (
                      <form
                        action={async () => {
                          "use server";
                          await acknowledgeWarning(w.id, w.employee.id);
                        }}
                      >
                        <button
                          type="submit"
                          className="dt-btn"
                          style={{ padding: "5px 10px", fontSize: 9.5, letterSpacing: "0.14em" }}
                        >
                          <span>Acknowledge</span>
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
              {warnings.length === 0 && (
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
                    No warnings on file.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <aside className="dt-card" style={{ padding: 0 }}>
        <div className="dt-card-head">
          <div>
            <h3>Issue Warning</h3>
            <div className="sub">Documented disciplinary action</div>
          </div>
        </div>
        <form action={createWarning} style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Employee">
            <select name="employee_id" required className="dt-filter-input" defaultValue="">
              <option value="">Select employee…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.full_name}</option>
              ))}
            </select>
          </Field>
          <Field label="Client (worksite)">
            <select name="client_id" className="dt-filter-input" defaultValue="">
              <option value="">—</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Level">
              <select name="level" required defaultValue="verbal" className="dt-filter-input">
                {(Object.keys(WARNING_LEVEL_LABEL) as WarningLevel[]).map((l) => (
                  <option key={l} value={l}>{WARNING_LEVEL_LABEL[l]}</option>
                ))}
              </select>
            </Field>
            <Field label="Category">
              <select name="category" required defaultValue="attendance" className="dt-filter-input">
                {(Object.keys(WARNING_CATEGORY_LABEL) as WarningCategory[]).map((c) => (
                  <option key={c} value={c}>{WARNING_CATEGORY_LABEL[c]}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Date issued">
            <input
              name="issued_date"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="dt-filter-input"
            />
          </Field>
          <Field label="Description (required)">
            <textarea name="description" rows={3} required className="dt-filter-input" style={{ resize: "vertical", minHeight: 60 }} />
          </Field>
          <Field label="Action required">
            <textarea name="action_required" rows={2} className="dt-filter-input" style={{ resize: "vertical", minHeight: 50 }} placeholder="What's expected going forward" />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Issued by">
              <input name="issued_by" type="text" className="dt-filter-input" />
            </Field>
            <Field label="Witnessed by">
              <input name="witnessed_by" type="text" className="dt-filter-input" />
            </Field>
          </div>
          <button type="submit" className="dt-btn dt-btn-primary" style={{ marginTop: 4 }}>
            <span>Issue Warning</span>
          </button>
        </form>
      </aside>
    </div>
  );
}

function StatusBtn({
  id,
  employeeId,
  status,
  label,
}: {
  id: string;
  employeeId: string;
  status: Parameters<typeof setIncidentStatus>[2];
  label: string;
}) {
  return (
    <form
      action={async () => {
        "use server";
        await setIncidentStatus(id, employeeId, status);
      }}
    >
      <button
        type="submit"
        className="dt-btn"
        style={{ padding: "5px 10px", fontSize: 9.5, letterSpacing: "0.14em" }}
      >
        <span>{label}</span>
      </button>
    </form>
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
