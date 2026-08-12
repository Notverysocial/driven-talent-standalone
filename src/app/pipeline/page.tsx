import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/Badge";
import { listSalesLeads, listSalesOwners } from "@/lib/sales-pipeline.server";
import {
  SALES_LEAD_ACTIVE_STAGES,
  SALES_LEAD_SOURCES,
  SALES_LEAD_STAGES,
  fmtCurrency,
  fmtShortDate,
  stageTone,
} from "@/lib/sales-pipeline";
import type { SalesLead, SalesLeadStage } from "@/lib/supabase/types";
import {
  isQuarantined,
  quarantineReasons,
  quarantineScore,
} from "@/lib/lead-quarantine";
import { createSalesLead, restoreQuarantinedLead } from "./actions";
import { StageMover } from "./StageMover";
import { getServerDictionary } from "@/lib/i18n/server";

export default async function SalesPipelinePage() {
  const [allLeads, owners] = await Promise.all([
    listSalesLeads(),
    listSalesOwners(),
  ]);

  // Leads the public site auto-filed as suspected spam. They are held out of the
  // board and every count on this page — otherwise the junk simply moves from
  // the Dashboard into the "New" column and the problem is unchanged — and shown
  // in their own section below, where a person can read them and restore any
  // that turn out to be real. See src/lib/lead-quarantine.ts.
  const quarantined = allLeads.filter(isQuarantined);
  const leads = allLeads.filter((l) => !isQuarantined(l));

  const byStage = new Map<SalesLeadStage, SalesLead[]>();
  for (const s of SALES_LEAD_STAGES) byStage.set(s.id, []);
  for (const l of leads) byStage.get(l.stage)?.push(l);

  const activeLeads = leads.filter(
    (l) => l.stage !== "won" && l.stage !== "lost",
  );
  const pipelineValue = activeLeads.reduce(
    (s, l) => s + (l.estimated_value ?? 0),
    0,
  );
  const wonValue = leads
    .filter((l) => l.stage === "won")
    .reduce((s, l) => s + (l.estimated_value ?? 0), 0);
  const overdue = activeLeads.filter(
    (l) =>
      l.next_action_due &&
      new Date(l.next_action_due) < new Date(new Date().toDateString()),
  ).length;

  const tb = (await getServerDictionary()).topbar.pipeline;

  return (
    <Shell>
      <Topbar
        crumb={tb.crumb}
        scriptWord={tb.scriptWord}
        title={tb.title}
        actions={
          <a href="#new-lead" className="dt-btn dt-btn-gold">
            <span>+ New Lead</span>
          </a>
        }
      />

      {/* KPI strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
          marginBottom: 22,
        }}
      >
        <KPI label="Active Leads" value={String(activeLeads.length)} sub="in pipeline" />
        <KPI
          label="Pipeline Value"
          value={fmtCurrency(pipelineValue)}
          sub="estimated, active"
        />
        <KPI
          label="Won (YTD)"
          value={fmtCurrency(wonValue)}
          sub={`${byStage.get("won")?.length ?? 0} deals closed`}
          accent="var(--dt-success)"
        />
        <KPI
          label="Overdue Follow-ups"
          value={String(overdue)}
          sub="next action past due"
          accent={overdue > 0 ? "var(--dt-warning)" : undefined}
        />
      </div>

      {/* Stage summary tiles (all 6 stages) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: 12,
          marginBottom: 22,
        }}
      >
        {SALES_LEAD_STAGES.map((s) => {
          const rows = byStage.get(s.id) ?? [];
          const value = rows.reduce((sum, r) => sum + (r.estimated_value ?? 0), 0);
          return (
            <div key={s.id} className="dt-card" style={{ padding: "14px 16px" }}>
              <div
                style={{
                  fontSize: 10.5,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "var(--dt-warm-500)",
                  fontWeight: 400,
                }}
              >
                {s.label}
              </div>
              <div
                className="tab-num"
                style={{
                  fontFamily: "var(--dt-display)",
                  fontSize: 26,
                  fontWeight: 300,
                  marginTop: 6,
                }}
              >
                {rows.length}
              </div>
              <div
                className="muted"
                style={{ fontSize: 11, marginTop: 2 }}
              >
                {fmtCurrency(value)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Kanban-style stage columns for ACTIVE pipeline */}
      <div className="dt-card gold-edge" style={{ marginBottom: 22 }}>
        <div className="dt-card-head">
          <div>
            <h3>Active Pipeline</h3>
            <div className="sub">
              Move a lead by selecting a new stage on its card.
            </div>
          </div>
          <Badge tone="gold">{activeLeads.length} active</Badge>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${SALES_LEAD_ACTIVE_STAGES.length}, minmax(220px, 1fr))`,
            gap: 12,
            padding: 18,
            overflowX: "auto",
          }}
        >
          {SALES_LEAD_ACTIVE_STAGES.map((stage) => {
            const rows = byStage.get(stage) ?? [];
            const meta = SALES_LEAD_STAGES.find((s) => s.id === stage)!;
            return (
              <div
                key={stage}
                style={{
                  background: "var(--dt-warm-50)",
                  border: "1px solid var(--dt-warm-150)",
                  padding: 10,
                  minHeight: 200,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 10,
                    paddingBottom: 8,
                    borderBottom: "1px solid var(--dt-warm-150)",
                  }}
                >
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                  <span
                    className="tab-num muted"
                    style={{ fontSize: 11 }}
                  >
                    {rows.length}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {rows.map((lead) => (
                    <LeadCard key={lead.id} lead={lead} owners={owners} />
                  ))}
                  {rows.length === 0 && (
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--dt-warm-400)",
                        textAlign: "center",
                        padding: "20px 8px",
                        fontStyle: "italic",
                      }}
                    >
                      No leads here
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Suspected spam — held out of every other count on this page */}
      {quarantined.length > 0 && (
        <div className="dt-card" style={{ marginBottom: 22 }}>
          <div className="dt-card-head">
            <div>
              <h3>Suspected Spam</h3>
              <div className="sub">
                Auto-quarantined by the website form guard. Nobody was notified
                and nothing was deleted — if one of these is a real employer,
                press <strong>Not spam</strong> and it rejoins the inbound queue.
              </div>
            </div>
            <Badge tone="red">{quarantined.length} held</Badge>
          </div>
          <div className="dt-table-wrap">
            <table className="dt-table">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 22 }}>Company / Contact</th>
                  <th>Received</th>
                  <th>Score</th>
                  <th>Why it was flagged</th>
                  <th style={{ textAlign: "right", paddingRight: 22 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {quarantined.map((l) => {
                  const reasons = quarantineReasons(l);
                  const score = quarantineScore(l);
                  const restore = restoreQuarantinedLead.bind(null, l.id, null);
                  return (
                    <tr key={l.id}>
                      <td style={{ paddingLeft: 22 }}>
                        <Link href={`/pipeline/${l.id}`} style={{ fontWeight: 500 }}>
                          {l.company_name}
                        </Link>
                        <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                          {[l.contact_name, l.contact_email]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </div>
                      </td>
                      <td className="tab-num" style={{ fontSize: 12 }}>
                        {fmtShortDate(l.created_at)}
                      </td>
                      <td className="tab-num" style={{ fontSize: 12 }}>
                        {score ?? "—"}
                      </td>
                      <td style={{ fontSize: 12, color: "var(--dt-warm-500)" }}>
                        {reasons.length ? (
                          <ul style={{ margin: 0, paddingLeft: 16 }}>
                            {reasons.map((r) => (
                              <li key={r}>{r}</li>
                            ))}
                          </ul>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={{ textAlign: "right", paddingRight: 22 }}>
                        <form action={restore}>
                          <button type="submit" className="dt-btn">
                            Not spam
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Closed (won/lost) summary table */}
      <div className="dt-card" style={{ marginBottom: 22 }}>
        <div className="dt-card-head">
          <div>
            <h3>Closed Deals</h3>
            <div className="sub">
              Won + lost — outcome history feeds the pipeline conversion rate.
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <Badge tone="green">{byStage.get("won")?.length ?? 0} won</Badge>
            <Badge tone="red">{byStage.get("lost")?.length ?? 0} lost</Badge>
          </div>
        </div>
        <div className="dt-table-wrap">
          <table className="dt-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 22 }}>Company</th>
                <th>Stage</th>
                <th>Value</th>
                <th>Owner</th>
                <th>Closed</th>
                <th style={{ textAlign: "right", paddingRight: 22 }}>Reason</th>
              </tr>
            </thead>
            <tbody>
              {[...(byStage.get("won") ?? []), ...(byStage.get("lost") ?? [])]
                .sort((a, b) => {
                  const ad = a.won_at ?? a.lost_at ?? a.updated_at;
                  const bd = b.won_at ?? b.lost_at ?? b.updated_at;
                  return bd.localeCompare(ad);
                })
                .map((l) => (
                  <tr key={l.id}>
                    <td style={{ paddingLeft: 22 }}>
                      <Link
                        href={`/pipeline/${l.id}`}
                        style={{ fontWeight: 500 }}
                      >
                        {l.company_name}
                      </Link>
                      {l.contact_name && (
                        <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                          {l.contact_name}
                        </div>
                      )}
                    </td>
                    <td>
                      <Badge tone={stageTone(l.stage)}>
                        {l.stage === "won" ? "Won" : "Lost"}
                      </Badge>
                    </td>
                    <td className="tab-num" style={{ fontSize: 12 }}>
                      {fmtCurrency(l.estimated_value)}
                    </td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {l.owner ?? "—"}
                    </td>
                    <td className="tab-num" style={{ fontSize: 12 }}>
                      {fmtShortDate(l.won_at ?? l.lost_at)}
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        paddingRight: 22,
                        fontSize: 12,
                        color: "var(--dt-warm-500)",
                      }}
                    >
                      {l.lost_reason ?? (l.stage === "won" ? "—" : "—")}
                    </td>
                  </tr>
                ))}
              {(byStage.get("won")?.length ?? 0) + (byStage.get("lost")?.length ?? 0) === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      textAlign: "center",
                      padding: "32px 22px",
                      color: "var(--dt-warm-500)",
                      fontStyle: "italic",
                      fontSize: 13,
                    }}
                  >
                    No closed deals yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New lead form */}
      <div
        id="new-lead"
        className="dt-card"
        style={{ padding: "20px 24px", scrollMarginTop: 80 }}
      >
        <div
          className="dt-card-head"
          style={{ padding: 0, marginBottom: 16, border: "none" }}
        >
          <div>
            <h3>Add a Lead</h3>
            <div className="sub">
              New prospective staffing client — kicks off in the &ldquo;New&rdquo; stage.
            </div>
          </div>
        </div>

        <form action={createSalesLead}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 16,
            }}
          >
            <Field label="Company Name" name="company_name" required />
            <Field label="Industry" name="industry" placeholder="Logistics, manufacturing…" />
            <Field label="Website" name="website" placeholder="https://…" />
            <Field label="City" name="city" />
            <Field label="Primary Contact" name="contact_name" />
            <Field label="Contact Title" name="contact_title" placeholder="Ops Manager" />
            <Field label="Contact Email" name="contact_email" type="email" />
            <Field label="Contact Phone" name="contact_phone" type="tel" />
            <Select label="Source" name="source" defaultValue="referral">
              {SALES_LEAD_SOURCES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
            <Field
              label="Source Detail"
              name="source_detail"
              placeholder="Who referred / which event"
            />
            <Field
              label="Estimated Value ($)"
              name="estimated_value"
              type="number"
              placeholder="annual / total"
            />
            <Field
              label="Estimated Headcount"
              name="estimated_headcount"
              type="number"
            />
            <Field
              label="Owner"
              name="owner"
              placeholder="DT team member"
            />
            <Field
              label="Next Action"
              name="next_action"
              placeholder="Follow-up email, schedule discovery call"
            />
            <Field
              label="Next Action Due"
              name="next_action_due"
              type="date"
            />
            <Field label="Created By" name="created_by" placeholder="Your name" />
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={labelStyle}>Notes</label>
            <textarea
              name="notes"
              rows={3}
              placeholder="Background, pain point, urgency, decision-maker…"
              style={{
                width: "100%",
                padding: "12px 14px",
                background: "var(--dt-warm-50)",
                border: "1px solid var(--dt-warm-150)",
                fontSize: 13,
                fontFamily: "inherit",
                resize: "vertical",
                outline: "none",
              }}
            />
          </div>

          <div
            style={{
              marginTop: 16,
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <button type="submit" className="dt-btn dt-btn-gold">
              <span>+ Create Lead</span>
            </button>
          </div>
        </form>
      </div>
    </Shell>
  );
}

function LeadCard({
  lead,
  owners,
}: {
  lead: SalesLead;
  owners: string[];
}) {
  const overdue =
    lead.next_action_due &&
    new Date(lead.next_action_due) < new Date(new Date().toDateString());

  return (
    <div
      style={{
        background: "var(--dt-bg)",
        border: "1px solid var(--dt-warm-150)",
        padding: 10,
        fontSize: 12,
      }}
    >
      <Link
        href={`/pipeline/${lead.id}`}
        style={{ fontWeight: 500, color: "var(--dt-black)" }}
      >
        {lead.company_name}
      </Link>
      {lead.contact_name && (
        <div
          className="muted"
          style={{ fontSize: 11, marginTop: 2 }}
        >
          {lead.contact_name}
          {lead.contact_title ? ` · ${lead.contact_title}` : ""}
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 8,
          fontSize: 11,
        }}
      >
        <span className="tab-num" style={{ fontWeight: 500 }}>
          {fmtCurrency(lead.estimated_value)}
        </span>
        <span className="muted">
          {lead.estimated_headcount ? `${lead.estimated_headcount} hc` : ""}
        </span>
      </div>

      {lead.next_action && (
        <div
          style={{
            marginTop: 6,
            fontSize: 11,
            color: overdue ? "var(--dt-danger)" : "var(--dt-warm-500)",
            lineHeight: 1.4,
          }}
        >
          → {lead.next_action}
          {lead.next_action_due && (
            <span className="tab-num"> · {fmtShortDate(lead.next_action_due)}</span>
          )}
        </div>
      )}

      <StageMover
        leadId={lead.id}
        stage={lead.stage}
        owner={lead.owner}
        owners={owners}
      />
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 10.5,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "var(--dt-warm-500)",
  fontWeight: 400,
  marginBottom: 6,
};

function Field({
  label,
  name,
  type = "text",
  placeholder,
  required,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ ...labelStyle, marginBottom: 0 }}>
        {label}
        {required && <span style={{ color: "var(--dt-danger)" }}> *</span>}
      </span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        defaultValue={defaultValue}
        className="dt-filter-input"
      />
    </label>
  );
}

function Select({
  label,
  name,
  defaultValue,
  children,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ ...labelStyle, marginBottom: 0 }}>{label}</span>
      <select name={name} defaultValue={defaultValue} className="dt-filter-input">
        {children}
      </select>
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
      <div style={labelStyle}>{label}</div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          marginTop: 4,
        }}
      >
        <div
          className="tab-num"
          style={{
            fontFamily: "var(--dt-display)",
            fontSize: 28,
            fontWeight: 300,
            color: accent ?? "var(--dt-black)",
            letterSpacing: "-0.01em",
          }}
        >
          {value}
        </div>
        {sub && (
          <div style={{ fontSize: 11.5, color: "var(--dt-warm-500)" }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}
