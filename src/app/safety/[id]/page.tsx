import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import {
  getIncidentDetail,
  listIncidentEvents,
  buildPeopleaseEmail,
} from "@/lib/incidents.server";
import {
  INCIDENT_COMPLIANCE_FIELDS,
  INCIDENT_SEVERITY_LABEL,
  INCIDENT_SEVERITY_TONE,
  INCIDENT_STATUS_LABEL,
  INCIDENT_STATUS_TONE,
  INCIDENT_TYPE_LABEL,
  fmtDate,
} from "@/lib/hr";
import {
  INCIDENT_EVENT_LABEL,
  INCIDENT_EVENT_TONE,
  PEOPLEASE_DEFAULT_EMAIL,
  fmtDateTime,
} from "@/lib/incidents";
import { markComplianceFlag, setIncidentStatus } from "../actions";
import {
  addIncidentNote,
  draftPeopleaseClaim,
  markPeopleaseEmailSent,
  sendIncidentNotification,
} from "./actions";

export default async function IncidentDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const [detail, events] = await Promise.all([
    getIncidentDetail(id),
    listIncidentEvents(id),
  ]);
  if (!detail) notFound();

  const { subject, body } = buildPeopleaseEmail(detail);
  const adjusterEmail =
    detail.peoplease_claim_email ?? PEOPLEASE_DEFAULT_EMAIL;
  const mailtoHref = `mailto:${encodeURIComponent(
    adjusterEmail,
  )}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  const flagsDone = INCIDENT_COMPLIANCE_FIELDS.filter(
    (f) => detail[f.key as keyof typeof detail],
  ).length;
  const flagsTotal = INCIDENT_COMPLIANCE_FIELDS.length;

  return (
    <Shell>
      <Topbar
        crumb="HR / SAFETY / CASE"
        scriptWord="Incident "
        title={detail.employee.full_name}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/safety" className="dt-btn">
              ← All Incidents
            </Link>
            <a
              href={`/safety/${id}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="dt-btn"
            >
              <span>Export PDF</span>
            </a>
            <a href={`/safety/${id}/excel`} className="dt-btn">
              <span>Export Excel</span>
            </a>
          </div>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 360px",
          gap: 22,
          alignItems: "start",
        }}
      >
        {/* Left column: detail, compliance, history */}
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div className="dt-card gold-edge">
            <div className="dt-card-head">
              <div>
                <h3>Case Detail</h3>
                <div className="sub">Opened {fmtDate(detail.reported_at)}</div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Badge tone={INCIDENT_STATUS_TONE[detail.status]}>
                  {INCIDENT_STATUS_LABEL[detail.status]}
                </Badge>
                <Badge tone={INCIDENT_SEVERITY_TONE[detail.severity]}>
                  {INCIDENT_SEVERITY_LABEL[detail.severity]}
                </Badge>
                <Badge tone="warm">{INCIDENT_TYPE_LABEL[detail.type]}</Badge>
              </div>
            </div>
            <div style={{ padding: "18px 26px" }}>
              <Link
                href={`/employees/${detail.employee.id}`}
                className="dt-person dt-person-link"
                style={{ fontSize: 13 }}
              >
                <Avatar name={detail.employee.full_name} />
                <div>
                  <div className="name" style={{ fontSize: 14 }}>
                    {detail.employee.full_name}
                  </div>
                  <div className="meta" style={{ fontSize: 11 }}>
                    {detail.client?.name ?? "—"} · {fmtDate(detail.incident_date)}
                    {detail.incident_time ? ` · ${detail.incident_time.slice(0, 5)}` : ""}
                  </div>
                </div>
              </Link>

              <div
                style={{
                  marginTop: 18,
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 14,
                }}
              >
                <DetailField label="Body part" value={detail.body_part} />
                <DetailField label="Location" value={detail.location} />
                <DetailField label="Equipment" value={detail.equipment_used} />
                <DetailField label="Hazards" value={detail.hazardous_conditions} />
                <DetailField label="Immediate treatment" value={detail.immediate_treatment} />
                <DetailField label="Reported by" value={detail.reported_by} />
              </div>

              <div style={{ marginTop: 18 }}>
                <DetailField label="Description" value={detail.description} block />
                {detail.what_happened && (
                  <DetailField
                    label="What happened"
                    value={detail.what_happened}
                    block
                  />
                )}
              </div>

              {detail.witnesses && detail.witnesses.length > 0 && (
                <div
                  style={{
                    marginTop: 14,
                    fontSize: 12,
                    color: "var(--dt-warm-500)",
                  }}
                >
                  <span className="tiny">Witnesses</span>{" "}
                  {detail.witnesses
                    .map((w) => (w.contact ? `${w.name} (${w.contact})` : w.name))
                    .join(", ")}
                </div>
              )}

              <div style={{ marginTop: 22, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {detail.status === "reported" && (
                  <StatusBtn
                    id={detail.id}
                    employeeId={detail.employee.id}
                    status="investigating"
                    label="Investigate"
                  />
                )}
                {detail.status === "investigating" && (
                  <StatusBtn
                    id={detail.id}
                    employeeId={detail.employee.id}
                    status="resolved"
                    label="Resolve"
                  />
                )}
                {detail.status === "resolved" && (
                  <StatusBtn
                    id={detail.id}
                    employeeId={detail.employee.id}
                    status="closed"
                    label="Close"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Compliance card */}
          <div className="dt-card">
            <div className="dt-card-head">
              <div>
                <h3>SOP Compliance</h3>
                <div className="sub">
                  {flagsDone}/{flagsTotal} flags complete
                </div>
              </div>
            </div>
            <div style={{ padding: "12px 22px 18px" }}>
              {INCIDENT_COMPLIANCE_FIELDS.map((f) => {
                const ts = detail[f.key as keyof typeof detail] as string | null;
                return (
                  <div
                    key={f.key}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: 12,
                      padding: "8px 0",
                      borderBottom: "1px solid var(--dt-warm-100)",
                    }}
                  >
                    <span
                      style={{ color: ts ? "var(--dt-success)" : "var(--dt-warm-500)" }}
                    >
                      {ts ? "✓" : "○"} {f.label}
                    </span>
                    {ts ? (
                      <span className="tab-num muted" style={{ fontSize: 11 }}>
                        {fmtDate(ts)}
                      </span>
                    ) : (
                      <form
                        action={async () => {
                          "use server";
                          await markComplianceFlag(
                            detail.id,
                            detail.employee.id,
                            f.key as Parameters<typeof markComplianceFlag>[2],
                          );
                        }}
                      >
                        <button
                          type="submit"
                          className="dt-btn dt-btn-ghost"
                          style={{ padding: "3px 9px", fontSize: 9, letterSpacing: "0.14em" }}
                        >
                          <span>Mark Done</span>
                        </button>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Case history / activity log */}
          <div className="dt-card">
            <div className="dt-card-head">
              <div>
                <h3>Case History</h3>
                <div className="sub">
                  {events.length === 0
                    ? "No events recorded yet"
                    : `${events.length} ${events.length === 1 ? "event" : "events"} · most recent first`}
                </div>
              </div>
            </div>
            <div style={{ padding: "12px 22px 18px" }}>
              {/* Add note form */}
              <form
                action={addIncidentNote.bind(null, id)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  paddingBottom: 14,
                  borderBottom: "1px solid var(--dt-warm-100)",
                  marginBottom: 14,
                }}
              >
                <textarea
                  name="note"
                  rows={2}
                  required
                  placeholder="Add a note to the case history…"
                  className="dt-filter-input"
                  style={{ resize: "vertical", minHeight: 48 }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    name="actor"
                    type="text"
                    placeholder="Your name"
                    className="dt-filter-input"
                    style={{ flex: 1 }}
                  />
                  <button type="submit" className="dt-btn dt-btn-gold">
                    <span>Add Note</span>
                  </button>
                </div>
              </form>

              {events.length === 0 ? (
                <div
                  style={{
                    padding: "16px 0",
                    textAlign: "center",
                    color: "var(--dt-warm-500)",
                    fontStyle: "italic",
                    fontSize: 12,
                  }}
                >
                  Activity will appear here as the case progresses.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {events.map((ev) => (
                    <div
                      key={ev.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "auto 1fr auto",
                        gap: 12,
                        alignItems: "start",
                        paddingBottom: 10,
                        borderBottom: "1px solid var(--dt-warm-100)",
                      }}
                    >
                      <Badge tone={INCIDENT_EVENT_TONE[ev.event_type]}>
                        {INCIDENT_EVENT_LABEL[ev.event_type]}
                      </Badge>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, color: "var(--dt-black)" }}>
                          {ev.summary}
                        </div>
                        {ev.note && ev.note !== ev.summary && (
                          <div
                            style={{
                              fontSize: 11.5,
                              color: "var(--dt-warm-700)",
                              marginTop: 3,
                              lineHeight: 1.5,
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {ev.note}
                          </div>
                        )}
                        {ev.actor && (
                          <div
                            className="tiny"
                            style={{ color: "var(--dt-warm-500)", marginTop: 3 }}
                          >
                            by {ev.actor}
                          </div>
                        )}
                      </div>
                      <div
                        className="tab-num muted"
                        style={{ fontSize: 10.5, whiteSpace: "nowrap" }}
                      >
                        {fmtDateTime(ev.occurred_at)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right column: Peoplease + notifications */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div className="dt-card gold-edge">
            <div className="dt-card-head">
              <div>
                <h3>Peoplease Claim</h3>
                <div className="sub">
                  {detail.peoplease_claim_drafted_at
                    ? `Drafted ${fmtDate(detail.peoplease_claim_drafted_at)}`
                    : "Open a workers' comp claim by email"}
                </div>
              </div>
            </div>
            <div style={{ padding: "16px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
              <form
                id="peoplease-draft-form"
                action={draftPeopleaseClaim.bind(null, id)}
                style={{ display: "flex", flexDirection: "column", gap: 12 }}
              >
                <Field label="Adjuster email">
                  <input
                    name="adjuster_email"
                    type="email"
                    defaultValue={adjusterEmail}
                    className="dt-filter-input"
                  />
                </Field>
                <Field label="Your name (optional)">
                  <input name="actor" type="text" className="dt-filter-input" />
                </Field>
                <button
                  type="submit"
                  className="dt-btn dt-btn-primary"
                  style={{ width: "100%" }}
                >
                  <span>Draft Peoplease Email</span>
                </button>
              </form>

              <a
                href={mailtoHref}
                className="dt-btn dt-btn-gold"
                style={{ textAlign: "center" }}
              >
                <span>Open in Mail Client</span>
              </a>

              <details
                style={{
                  marginTop: 4,
                  fontSize: 11.5,
                  color: "var(--dt-warm-500)",
                }}
              >
                <summary
                  style={{
                    cursor: "pointer",
                    fontSize: 10,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                  }}
                >
                  Preview email body
                </summary>
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    fontSize: 11,
                    fontFamily: "var(--dt-body), system-ui",
                    marginTop: 8,
                    padding: 10,
                    background: "var(--dt-warm-50)",
                    border: "1px solid var(--dt-warm-150)",
                    borderRadius: 2,
                    color: "var(--dt-warm-700)",
                    lineHeight: 1.5,
                  }}
                >
                  {`Subject: ${subject}\n\n${body}`}
                </pre>
              </details>

              {detail.peoplease_claim_drafted_at && (
                <form action={markPeopleaseEmailSent.bind(null, id)}>
                  <input
                    name="recipient"
                    type="hidden"
                    value={detail.peoplease_claim_email ?? adjusterEmail}
                  />
                  <button
                    type="submit"
                    className="dt-btn"
                    style={{ width: "100%", marginTop: 4 }}
                  >
                    <span>Mark Email Sent</span>
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Per-case notification */}
          <div className="dt-card">
            <div className="dt-card-head">
              <div>
                <h3>Send Notification</h3>
                <div className="sub">Logs to case history</div>
              </div>
            </div>
            <form
              action={sendIncidentNotification.bind(null, id)}
              style={{
                padding: "16px 22px",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <Field label="Channel">
                <select name="channel" defaultValue="email" className="dt-filter-input">
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                </select>
              </Field>
              <Field label="Recipient">
                <input
                  name="recipient"
                  type="text"
                  required
                  placeholder="email or phone"
                  className="dt-filter-input"
                />
              </Field>
              <Field label="Message">
                <textarea
                  name="message"
                  rows={3}
                  required
                  className="dt-filter-input"
                  style={{ resize: "vertical", minHeight: 60 }}
                />
              </Field>
              <Field label="Your name (optional)">
                <input name="actor" type="text" className="dt-filter-input" />
              </Field>
              <button type="submit" className="dt-btn">
                <span>Queue Notification</span>
              </button>
            </form>
          </div>
        </aside>
      </div>
    </Shell>
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
        style={{ padding: "6px 14px", fontSize: 10, letterSpacing: "0.14em" }}
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

function DetailField({
  label,
  value,
  block,
}: {
  label: string;
  value: string | null | undefined;
  block?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span
        className="tiny"
        style={{
          fontSize: 9.5,
          letterSpacing: "0.14em",
          color: "var(--dt-warm-500)",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: block ? 12.5 : 12,
          color: value ? "var(--dt-black)" : "var(--dt-warm-500)",
          lineHeight: block ? 1.5 : 1.4,
          whiteSpace: block ? "pre-wrap" : "normal",
        }}
      >
        {value || "—"}
      </span>
    </div>
  );
}
