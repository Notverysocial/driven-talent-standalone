import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/Badge";
import {
  getSalesLead,
  listSalesLeadActivities,
  listSalesOwners,
} from "@/lib/sales-pipeline.server";
import {
  SALES_LEAD_ACTIVITY_TYPES,
  SALES_LEAD_SOURCES,
  SALES_LEAD_STAGES,
  fmtCurrency,
  fmtShortDate,
  sourceLabel,
  stageLabel,
  stageTone,
} from "@/lib/sales-pipeline";
import type { SalesLeadStage } from "@/lib/supabase/types";
import {
  addLeadActivity,
  setLeadStage,
  updateLeadDetails,
} from "../actions";
import { StageMover } from "../StageMover";

function fmtDateTime(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [lead, activities, owners] = await Promise.all([
    getSalesLead(id),
    listSalesLeadActivities(id),
    listSalesOwners(),
  ]);

  if (!lead) notFound();

  const stageMeta = SALES_LEAD_STAGES.find((s) => s.id === lead.stage)!;

  return (
    <Shell>
      <Topbar
        crumb={`SALES / PIPELINE / ${lead.company_name.toUpperCase()}`}
        scriptWord="Lead "
        title={lead.company_name}
        actions={
          <Link href="/pipeline" className="dt-btn">
            ← Pipeline
          </Link>
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
        {/* LEFT — details + activity */}
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {/* Stage strip */}
          <div className="dt-card gold-edge" style={{ padding: "16px 22px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <Badge tone={stageMeta.tone}>{stageMeta.label}</Badge>
                <span style={{ fontSize: 12, color: "var(--dt-warm-500)" }}>
                  {stageMeta.short}
                </span>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {SALES_LEAD_STAGES.map((s) => (
                  <StageButton
                    key={s.id}
                    leadId={lead.id}
                    stage={s.id}
                    label={s.label}
                    active={s.id === lead.stage}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Editable details */}
          <form action={updateLeadDetails.bind(null, lead.id)}>
            <div className="dt-card" style={{ padding: 0 }}>
              <div className="dt-card-head">
                <div>
                  <h3>Lead Details</h3>
                  <div className="sub">Edit and save — all fields optional except company name.</div>
                </div>
                <button type="submit" className="dt-btn dt-btn-gold">
                  <span>Save Changes</span>
                </button>
              </div>
              <div
                style={{
                  padding: 22,
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 16,
                }}
              >
                <Field
                  label="Company"
                  name="company_name"
                  defaultValue={lead.company_name}
                  required
                />
                <Field label="Industry" name="industry" defaultValue={lead.industry ?? ""} />
                <Field label="Website" name="website" defaultValue={lead.website ?? ""} />
                <Field label="City" name="city" defaultValue={lead.city ?? ""} />
                <Field
                  label="Contact"
                  name="contact_name"
                  defaultValue={lead.contact_name ?? ""}
                />
                <Field
                  label="Contact Title"
                  name="contact_title"
                  defaultValue={lead.contact_title ?? ""}
                />
                <Field
                  label="Contact Email"
                  name="contact_email"
                  type="email"
                  defaultValue={lead.contact_email ?? ""}
                />
                <Field
                  label="Contact Phone"
                  name="contact_phone"
                  type="tel"
                  defaultValue={lead.contact_phone ?? ""}
                />
                <Select label="Source" name="source" defaultValue={lead.source}>
                  {SALES_LEAD_SOURCES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </Select>
                <Field
                  label="Source Detail"
                  name="source_detail"
                  defaultValue={lead.source_detail ?? ""}
                />
                <Field
                  label="Estimated Value ($)"
                  name="estimated_value"
                  type="number"
                  defaultValue={lead.estimated_value?.toString() ?? ""}
                />
                <Field
                  label="Estimated Headcount"
                  name="estimated_headcount"
                  type="number"
                  defaultValue={lead.estimated_headcount?.toString() ?? ""}
                />
                <Field
                  label="Probability (%)"
                  name="probability"
                  type="number"
                  defaultValue={lead.probability?.toString() ?? ""}
                />
                <Field
                  label="Next Action"
                  name="next_action"
                  defaultValue={lead.next_action ?? ""}
                />
                <Field
                  label="Next Action Due"
                  name="next_action_due"
                  type="date"
                  defaultValue={lead.next_action_due ?? ""}
                />
                <Field
                  label="Lost Reason"
                  name="lost_reason"
                  defaultValue={lead.lost_reason ?? ""}
                  placeholder="If lost — why"
                />
              </div>

              <div style={{ padding: "0 22px 22px" }}>
                <label style={labelStyle}>Notes</label>
                <textarea
                  name="notes"
                  rows={4}
                  defaultValue={lead.notes ?? ""}
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
            </div>
          </form>

          {/* Activity log + add-activity form */}
          <div className="dt-card" style={{ padding: 0 }}>
            <div className="dt-card-head">
              <div>
                <h3>Activity</h3>
                <div className="sub">
                  {activities.length} entr{activities.length === 1 ? "y" : "ies"} on file
                </div>
              </div>
            </div>

            <form
              action={addLeadActivity.bind(null, lead.id)}
              style={{
                padding: "18px 22px",
                borderBottom: "1px solid var(--dt-warm-100)",
                display: "grid",
                gridTemplateColumns: "180px 1fr 180px auto",
                gap: 10,
                alignItems: "end",
              }}
            >
              <Select label="Type" name="activity_type" defaultValue="note">
                {SALES_LEAD_ACTIVITY_TYPES.filter(
                  (t) => t.id !== "stage_changed" && t.id !== "owner_changed",
                ).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </Select>
              <Field
                label="Summary"
                name="summary"
                placeholder="What happened?"
                required
              />
              <Field label="Actor" name="actor" placeholder="Your name" />
              <button type="submit" className="dt-btn">
                <span>+ Log</span>
              </button>
            </form>

            <div style={{ padding: 0 }}>
              {activities.length === 0 && (
                <div
                  style={{
                    padding: "32px 22px",
                    textAlign: "center",
                    color: "var(--dt-warm-500)",
                    fontStyle: "italic",
                    fontSize: 13,
                  }}
                >
                  No activity yet — log a call, email, or meeting above.
                </div>
              )}
              {activities.map((a) => {
                const meta = SALES_LEAD_ACTIVITY_TYPES.find(
                  (t) => t.id === a.activity_type,
                );
                return (
                  <div
                    key={a.id}
                    style={{
                      padding: "14px 22px",
                      borderBottom: "1px solid var(--dt-warm-100)",
                      display: "grid",
                      gridTemplateColumns: "110px 1fr auto",
                      gap: 14,
                    }}
                  >
                    <Badge tone={meta?.tone ?? "warm"}>
                      {meta?.label ?? a.activity_type}
                    </Badge>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>
                        {a.summary}
                      </div>
                      {a.body && (
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--dt-warm-700)",
                            marginTop: 4,
                            lineHeight: 1.5,
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {a.body}
                        </div>
                      )}
                      {a.actor && (
                        <div
                          className="muted"
                          style={{ fontSize: 11, marginTop: 4 }}
                        >
                          by {a.actor}
                        </div>
                      )}
                    </div>
                    <div
                      className="tab-num muted"
                      style={{ fontSize: 11, whiteSpace: "nowrap" }}
                    >
                      {fmtDateTime(a.occurred_at)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT — quick facts sidebar */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="dt-card" style={{ padding: "20px 22px" }}>
            <div style={labelStyle}>Stage</div>
            <div style={{ marginTop: 6 }}>
              <Badge tone={stageTone(lead.stage)}>{stageLabel(lead.stage)}</Badge>
            </div>
            <StageMover
              leadId={lead.id}
              stage={lead.stage}
              owner={lead.owner}
              owners={owners}
            />
          </div>

          <div className="dt-card" style={{ padding: "20px 22px" }}>
            <div style={labelStyle}>Estimated Value</div>
            <div
              className="tab-num"
              style={{
                fontFamily: "var(--dt-display)",
                fontSize: 28,
                fontWeight: 300,
                marginTop: 4,
              }}
            >
              {fmtCurrency(lead.estimated_value)}
            </div>
            {lead.estimated_headcount != null && (
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {lead.estimated_headcount} headcount
              </div>
            )}
            {lead.probability != null && (
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {lead.probability}% probability
              </div>
            )}
          </div>

          <div className="dt-card" style={{ padding: "20px 22px" }}>
            <div style={labelStyle}>Quick Facts</div>
            <Fact label="Owner" value={lead.owner ?? "—"} />
            <Fact label="Source" value={sourceLabel(lead.source)} />
            {lead.source_detail && (
              <Fact label="Source Detail" value={lead.source_detail} />
            )}
            <Fact label="Next Action" value={lead.next_action ?? "—"} />
            <Fact
              label="Next Due"
              value={fmtShortDate(lead.next_action_due)}
            />
            {lead.contact_name && (
              <Fact
                label="Contact"
                value={
                  lead.contact_name +
                  (lead.contact_title ? ` (${lead.contact_title})` : "")
                }
              />
            )}
            {lead.contact_email && <Fact label="Email" value={lead.contact_email} />}
            {lead.contact_phone && <Fact label="Phone" value={lead.contact_phone} />}
            {lead.website && <Fact label="Website" value={lead.website} />}
            {lead.city && <Fact label="City" value={lead.city} />}
            <Fact label="Added" value={fmtShortDate(lead.created_at)} />
            {lead.created_by && <Fact label="Added By" value={lead.created_by} />}
            {lead.won_at && <Fact label="Won" value={fmtShortDate(lead.won_at)} />}
            {lead.lost_at && <Fact label="Lost" value={fmtShortDate(lead.lost_at)} />}
          </div>
        </aside>
      </div>
    </Shell>
  );
}

function StageButton({
  leadId,
  stage,
  label,
  active,
}: {
  leadId: string;
  stage: SalesLeadStage;
  label: string;
  active: boolean;
}) {
  async function action() {
    "use server";
    await setLeadStage(leadId, stage);
  }
  return (
    <form action={action}>
      <button
        type="submit"
        className={"dt-chip" + (active ? " active" : "")}
        style={{
          fontSize: 10.5,
          letterSpacing: "0.14em",
          padding: "4px 10px",
          cursor: active ? "default" : "pointer",
        }}
        disabled={active}
      >
        {label}
      </button>
    </form>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        padding: "6px 0",
        borderBottom: "1px dashed var(--dt-warm-100)",
        fontSize: 12,
        gap: 12,
      }}
    >
      <span style={{ color: "var(--dt-warm-500)" }}>{label}</span>
      <span style={{ textAlign: "right", color: "var(--dt-black)" }}>
        {value}
      </span>
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
