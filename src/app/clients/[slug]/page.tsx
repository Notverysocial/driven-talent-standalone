import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/Badge";
import { KpiTile, KpiGrid } from "@/components/KpiTile";
import {
  getClientMarginDetail,
  listClientContacts,
  listClientWorkersCompCodes,
} from "@/lib/clients.server";
import { fmtPct, fmtUSD, fmtUSD2, marginTone } from "@/lib/clients";
import { INVOICE_STATUSES } from "@/lib/invoices";
import { getCurrentUser, roleAtLeast } from "@/lib/auth.server";
import {
  addClientContact,
  addWorkersCompCode,
  deleteClientContact,
  deleteWorkersCompCode,
  updateClientConfig,
} from "../actions";
import { ClientInfoEditor } from "./ClientInfoEditor";
import { MarkupCell } from "./MarkupCell";
import { MarkupSummary } from "./MarkupSummary";

function fmtPeriod(start: string, end: string): string {
  const s = new Date(start + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const e = new Date(end + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${s} — ${e}`;
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function ClientMarginDetailPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const detail = await getClientMarginDetail(slug);
  if (!detail) notFound();

  const { client, overview, invoices, assignments } = detail;
  const [wcCodes, contacts, me] = await Promise.all([
    listClientWorkersCompCodes(client.id),
    listClientContacts(client.id),
    getCurrentUser(),
  ]);
  const isAdmin = roleAtLeast(me?.profile.role ?? "user", "admin");
  const realizedTone = marginTone(overview.realizedMarginPct);
  const expectedTone = marginTone(overview.expectedMarginPct);

  return (
    <Shell>
      <Topbar
        crumb="OPERATIONS / CLIENTS"
        scriptWord=""
        title={client.name}
        actions={
          <Link href="/clients" className="dt-btn">
            ← All Clients
          </Link>
        }
      />

      <KpiGrid min={200}>
        <KpiTile
          tone="gold"
          label="Active Headcount"
          value={overview.activeHeadcount}
          sub={`${overview.activePlacements} placements`}
        />
        <KpiTile
          tone="green"
          label="Revenue (lifetime)"
          value={fmtUSD(overview.realizedRevenue)}
          sub={`${fmtUSD(overview.realizedCost)} cost`}
        />
        <KpiTile
          tone={realizedTone}
          label="Realized Margin"
          value={fmtPct(overview.realizedMarginPct)}
          sub={`${fmtUSD(overview.realizedGross)} gross`}
        />
        <KpiTile
          tone={expectedTone}
          label="Expected / Week"
          value={fmtUSD(overview.expectedWeeklyRevenue)}
          sub={`${fmtPct(overview.expectedMarginPct)} forward`}
        />
      </KpiGrid>

      <div
        className="dt-overview-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
          gap: 22,
          marginBottom: 22,
        }}
      >
        <div className="dt-card gold-edge">
          <div className="dt-card-head">
            <div>
              <h3>Invoices</h3>
              <div className="sub">
                Per-invoice revenue, cost, and margin · most recent first
              </div>
            </div>
            <Link href="/invoices" className="dt-btn dt-btn-ghost tiny">
              Open ledger →
            </Link>
          </div>
          <div className="dt-table-wrap">
            <table className="dt-table">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 22 }}>Number</th>
                  <th>Period</th>
                  <th>Dept</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Revenue</th>
                  <th style={{ textAlign: "right" }}>Cost</th>
                  <th
                    style={{
                      textAlign: "right",
                      paddingRight: 22,
                    }}
                  >
                    Margin
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const tone = marginTone(inv.marginPct);
                  const marginColor =
                    tone === "green"
                      ? "var(--dt-success)"
                      : tone === "amber"
                      ? "var(--dt-warning)"
                      : tone === "red"
                      ? "var(--dt-danger)"
                      : "var(--dt-warm-700)";
                  const statusMeta = INVOICE_STATUSES.find(
                    (s) => s.id === inv.status,
                  );
                  const statusTone = inv.is_overdue
                    ? "red"
                    : statusMeta?.tone ?? "warm";
                  const statusLabel = inv.is_overdue
                    ? "Overdue"
                    : statusMeta?.label ?? inv.status;
                  return (
                    <tr key={inv.id}>
                      <td style={{ paddingLeft: 22 }}>
                        <Link
                          href={`/invoices/${inv.id}`}
                          className="tab-num"
                          style={{
                            color: "var(--dt-gold-deep)",
                            fontWeight: 400,
                            textDecoration: "none",
                          }}
                        >
                          {inv.number}
                        </Link>
                      </td>
                      <td className="tab-num" style={{ fontSize: 12 }}>
                        {fmtPeriod(inv.period_start, inv.period_end)}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {inv.department ?? "—"}
                      </td>
                      <td>
                        <Badge tone={statusTone}>{statusLabel}</Badge>
                      </td>
                      <td
                        className="tab-num"
                        style={{ textAlign: "right", fontWeight: 400 }}
                      >
                        ${fmtUSD2(inv.revenue)}
                      </td>
                      <td
                        className="tab-num"
                        style={{ textAlign: "right", color: "var(--dt-warm-700)" }}
                      >
                        ${fmtUSD2(inv.cost)}
                      </td>
                      <td
                        className="tab-num"
                        style={{
                          textAlign: "right",
                          paddingRight: 22,
                          color: marginColor,
                          fontWeight: 500,
                        }}
                      >
                        {fmtPct(inv.marginPct)}
                        <div
                          style={{
                            fontSize: 10,
                            color: "var(--dt-warm-500)",
                            marginTop: 2,
                            fontWeight: 300,
                          }}
                        >
                          ${fmtUSD2(inv.gross)} gross
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {invoices.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      style={{
                        textAlign: "center",
                        padding: "32px 22px",
                        color: "var(--dt-warm-500)",
                        fontStyle: "italic",
                      }}
                    >
                      No invoices issued for this client yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="col gap-md">
          <div className="dt-card gold-edge" style={{ padding: "22px 24px" }}>
            <div
              className="tiny muted"
              style={{
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                fontWeight: 400,
              }}
            >
              Client Profile
            </div>
            <div
              style={{
                fontFamily: "var(--dt-display)",
                fontSize: 22,
                fontWeight: 300,
                marginTop: 10,
                letterSpacing: "-0.01em",
              }}
            >
              {client.name}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--dt-warm-500)",
                marginTop: 4,
              }}
            >
              {client.city ?? "—"} · {client.industry ?? "—"}
            </div>
            <div style={{ marginTop: 8 }}>
              <Badge tone={client.status === "active" ? "green" : client.status === "prospect" ? "amber" : "dark"}>
                {client.status}
              </Badge>
            </div>
            <div
              style={{
                height: 1,
                background: "var(--dt-warm-100)",
                margin: "18px 0",
              }}
            />
            <DetailRow label="Address" value={client.address ?? "—"} />
            <DetailRow label="Phone" value={client.phone ?? "—"} />
            <DetailRow
              label="Website"
              value={client.website ?? "—"}
            />
            <DetailRow
              label="Service Fee"
              value={`${Number(client.service_fee_pct).toFixed(1)}%`}
            />
            <DetailRow label="Terms" value={client.terms ?? "—"} />
            <DetailRow label="Contact" value={client.contact_name ?? "—"} />
            <DetailRow label="Email" value={client.contact_email ?? "—"} />
            <DetailRow
              label="Onboarded"
              value={fmtDate(client.created_at)}
            />
          </div>

          {/* Editable basic company info (Phase-1 #4, admin only) */}
          {isAdmin && <ClientInfoEditor client={client} />}

          <div className="dt-card" style={{ padding: "22px 24px" }}>
            <div
              className="tiny muted"
              style={{
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                fontWeight: 400,
              }}
            >
              Billing Status
            </div>
            <DetailRow
              label="Open A/R"
              value={fmtUSD(overview.openRevenue)}
              valueColor="var(--dt-warning)"
            />
            <DetailRow
              label="Paid"
              value={fmtUSD(overview.paidRevenue)}
              valueColor="var(--dt-success)"
            />
            <DetailRow
              label="Invoices Total"
              value={String(overview.invoiceCount)}
            />
            <DetailRow
              label="Avg Pay Rate"
              value={`$${fmtUSD2(overview.avgPayRate)}/hr`}
            />
            <DetailRow
              label="Avg Bill Rate"
              value={`$${fmtUSD2(overview.avgBillRate)}/hr`}
              valueColor="var(--dt-gold-deep)"
            />
          </div>

          {/* Editable per-client config: who's in charge + default WC code/class.
              Per-position WC overrides live in the table below. (task 86e20w8qy) */}
          <form
            action={updateClientConfig.bind(null, slug)}
            className="dt-card"
            style={{ padding: "22px 24px" }}
          >
            <div
              className="tiny muted"
              style={{
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                fontWeight: 400,
                marginBottom: 12,
              }}
            >
              Client Configuration
            </div>
            <ConfigField
              label="Account Manager"
              name="account_manager"
              defaultValue={client.account_manager ?? ""}
              placeholder="DT person in charge of this client"
            />
            <ConfigField
              label="Default WC Code"
              name="workers_comp_code"
              defaultValue={client.workers_comp_code ?? ""}
              placeholder="e.g. 8810"
            />
            <ConfigField
              label="Default WC Class"
              name="workers_comp_class"
              defaultValue={client.workers_comp_class ?? ""}
              placeholder="e.g. Clerical"
            />
            <ConfigField
              label="WC Notes"
              name="workers_comp_notes"
              defaultValue={client.workers_comp_notes ?? ""}
              placeholder="Carrier / policy notes"
              textarea
            />
            <button type="submit" className="dt-btn dt-btn-primary" style={{ marginTop: 12, width: "100%" }}>
              Save Configuration
            </button>
          </form>
        </div>
      </div>

      {/* Workers-comp code mapping per position (task 86e20w8tq). The default
          code/class lives on the client config card above; these are
          position-specific overrides PEOPLEASE assigns at this client. */}
      <div className="dt-card" style={{ marginBottom: 22 }}>
        <div className="dt-card-head">
          <div>
            <h3>Workers-Comp Codes by Position</h3>
            <div className="sub">
              Position-specific WC code/class · falls back to the client default when unset
            </div>
          </div>
        </div>
        <div className="dt-table-wrap">
          <table className="dt-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 22 }}>Position</th>
                <th>WC Code</th>
                <th>Class</th>
                <th>Description</th>
                <th style={{ textAlign: "right", paddingRight: 22 }}></th>
              </tr>
            </thead>
            <tbody>
              {wcCodes.map((wc) => (
                <tr key={wc.id}>
                  <td style={{ paddingLeft: 22, fontWeight: 500 }}>{wc.position}</td>
                  <td className="tab-num">{wc.wc_code}</td>
                  <td>{wc.wc_class ?? "—"}</td>
                  <td style={{ fontSize: 12, color: "var(--dt-warm-700)" }}>
                    {wc.description ?? "—"}
                  </td>
                  <td style={{ textAlign: "right", paddingRight: 22 }}>
                    <form action={deleteWorkersCompCode.bind(null, wc.id, slug)}>
                      <button
                        type="submit"
                        className="dt-btn dt-btn-ghost tiny"
                        style={{ color: "var(--dt-danger)" }}
                      >
                        Remove
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {wcCodes.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    style={{
                      textAlign: "center",
                      padding: "28px 22px",
                      color: "var(--dt-warm-500)",
                      fontStyle: "italic",
                    }}
                  >
                    No position-specific codes yet — the client default applies to everyone.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <form
          action={addWorkersCompCode.bind(null, slug, client.id)}
          style={{
            margin: "8px 18px 18px",
            padding: "14px 16px",
            background: "var(--dt-warm-50)",
            border: "1px dashed var(--dt-warm-200)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--dt-warm-500)",
              fontWeight: 400,
              marginBottom: 10,
            }}
          >
            Add / update a position code
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr auto", gap: 8 }}>
            <input name="position" placeholder="Position (e.g. Forklift Operator)" className="dt-filter-input" required />
            <input name="wc_code" placeholder="WC code (e.g. 8810)" className="dt-filter-input" required />
            <input name="wc_class" placeholder="Class (optional)" className="dt-filter-input" />
            <button type="submit" className="dt-btn">Add</button>
          </div>
          <input
            name="description"
            placeholder="Optional description"
            className="dt-filter-input"
            style={{ width: "100%", marginTop: 8 }}
          />
        </form>
      </div>

      {/* Client contacts directory (Phase-1 #4) */}
      <div className="dt-card" style={{ marginBottom: 22 }}>
        <div className="dt-card-head">
          <div>
            <h3>Contacts</h3>
            <div className="sub">Company contacts at {client.name}</div>
          </div>
        </div>
        <div className="dt-table-wrap">
          <table className="dt-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 22 }}>Name</th>
                <th>Role / Title</th>
                <th>Department</th>
                <th>Phone</th>
                <th>Email</th>
                {isAdmin && <th style={{ textAlign: "right", paddingRight: 22 }}></th>}
              </tr>
            </thead>
            <tbody>
              {contacts.map((ct) => (
                <tr key={ct.id}>
                  <td style={{ paddingLeft: 22, fontWeight: 500 }}>{ct.full_name}</td>
                  <td style={{ fontSize: 12 }}>
                    {ct.role_type ?? ct.position ?? "—"}
                  </td>
                  <td style={{ fontSize: 12, color: "var(--dt-warm-700)" }}>
                    {ct.department ?? "—"}
                  </td>
                  <td className="tab-num" style={{ fontSize: 12 }}>{ct.phone ?? "—"}</td>
                  <td style={{ fontSize: 12 }}>
                    {ct.email ? (
                      <a href={`mailto:${ct.email}`} style={{ color: "var(--dt-gold-deep)" }}>
                        {ct.email}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  {isAdmin && (
                    <td style={{ textAlign: "right", paddingRight: 22 }}>
                      <form action={deleteClientContact.bind(null, ct.id, slug)}>
                        <button
                          type="submit"
                          className="dt-btn dt-btn-ghost tiny"
                          style={{ color: "var(--dt-danger)" }}
                        >
                          Remove
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
              {contacts.length === 0 && (
                <tr>
                  <td
                    colSpan={isAdmin ? 6 : 5}
                    style={{
                      textAlign: "center",
                      padding: "28px 22px",
                      color: "var(--dt-warm-500)",
                      fontStyle: "italic",
                    }}
                  >
                    No contacts on file yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {isAdmin && (
          <form
            action={addClientContact.bind(null, slug, client.id)}
            style={{
              margin: "8px 18px 18px",
              padding: "14px 16px",
              background: "var(--dt-warm-50)",
              border: "1px dashed var(--dt-warm-200)",
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--dt-warm-500)",
                fontWeight: 400,
                marginBottom: 10,
              }}
            >
              Add a contact
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr auto", gap: 8 }}>
              <input name="full_name" placeholder="Full name" className="dt-filter-input" required />
              <input name="role_type" placeholder="Role (e.g. Manager)" className="dt-filter-input" />
              <input name="department" placeholder="Department" className="dt-filter-input" />
              <button type="submit" className="dt-btn">Add</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 8 }}>
              <input name="position" placeholder="Title (optional)" className="dt-filter-input" />
              <input name="phone" placeholder="Phone" className="dt-filter-input" />
              <input name="email" type="email" placeholder="Email" className="dt-filter-input" />
            </div>
          </form>
        )}
      </div>

      <div className="dt-card">
        <div className="dt-card-head">
          <div>
            <h3>Active Assignments</h3>
            <div className="sub">
              Per-employee bill vs. pay rate · click a markup to set it once —
              invoicing applies it from then on · italic = falling back
            </div>
          </div>
          <MarkupSummary assignments={assignments} slug={slug} canEdit={isAdmin} />
        </div>
        <div className="dt-table-wrap">
          <table className="dt-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 22 }}>Employee</th>
                <th>Position</th>
                <th>Dept</th>
                <th>Shift</th>
                <th style={{ textAlign: "right" }}>Pay</th>
                <th>Markup</th>
                <th style={{ textAlign: "right" }}>Bill</th>
                <th style={{ textAlign: "right" }}>Gross/hr</th>
                <th
                  style={{
                    textAlign: "right",
                    paddingRight: 22,
                  }}
                >
                  Margin
                </th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => {
                const tone = marginTone(a.marginPct);
                const marginColor =
                  tone === "green"
                    ? "var(--dt-success)"
                    : tone === "amber"
                    ? "var(--dt-warning)"
                    : tone === "red"
                    ? "var(--dt-danger)"
                    : "var(--dt-warm-700)";
                return (
                  <tr key={a.id}>
                    <td style={{ paddingLeft: 22 }}>
                      <Link
                        href={`/employees/${a.employee_id}`}
                        className="dt-person-link"
                        style={{ textDecoration: "none", color: "inherit" }}
                      >
                        <div className="name" style={{ fontWeight: 500 }}>
                          {a.employee_name}
                        </div>
                      </Link>
                    </td>
                    <td style={{ fontSize: 12 }}>{a.position ?? "—"}</td>
                    <td style={{ fontSize: 12 }}>{a.department ?? "—"}</td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {a.shift ?? "—"}
                    </td>
                    <td
                      className="tab-num"
                      style={{ textAlign: "right", fontSize: 12 }}
                    >
                      ${fmtUSD2(a.hourly_rate)}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      <MarkupCell assignment={a} slug={slug} canEdit={isAdmin} />
                    </td>
                    <td
                      className="tab-num"
                      style={{
                        textAlign: "right",
                        fontSize: 12,
                        fontStyle: a.bill_rate_inferred ? "italic" : "normal",
                        color: a.bill_rate_inferred
                          ? "var(--dt-warm-500)"
                          : "inherit",
                      }}
                    >
                      ${fmtUSD2(a.bill_rate)}
                    </td>
                    <td
                      className="tab-num"
                      style={{ textAlign: "right", fontSize: 12 }}
                    >
                      ${fmtUSD2(a.hourly_gross)}
                    </td>
                    <td
                      className="tab-num"
                      style={{
                        textAlign: "right",
                        paddingRight: 22,
                        color: marginColor,
                        fontWeight: 500,
                      }}
                    >
                      {fmtPct(a.marginPct)}
                    </td>
                  </tr>
                );
              })}
              {assignments.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    style={{
                      textAlign: "center",
                      padding: "32px 22px",
                      color: "var(--dt-warm-500)",
                      fontStyle: "italic",
                    }}
                  >
                    No active assignments at this client.
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

function ConfigField({
  label,
  name,
  defaultValue,
  placeholder,
  textarea,
}: {
  label: string;
  name: string;
  defaultValue: string;
  placeholder?: string;
  textarea?: boolean;
}) {
  return (
    <label style={{ display: "block", marginBottom: 10 }}>
      <span
        style={{
          display: "block",
          fontSize: 9.5,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "var(--dt-warm-500)",
          fontWeight: 400,
          marginBottom: 4,
        }}
      >
        {label}
      </span>
      {textarea ? (
        <textarea
          name={name}
          defaultValue={defaultValue}
          placeholder={placeholder}
          className="dt-filter-input"
          rows={2}
          style={{ width: "100%", resize: "vertical" }}
        />
      ) : (
        <input
          name={name}
          defaultValue={defaultValue}
          placeholder={placeholder}
          className="dt-filter-input"
          style={{ width: "100%" }}
        />
      )}
    </label>
  );
}

function DetailRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "8px 0",
        fontSize: 12.5,
        borderBottom: "1px solid var(--dt-warm-100)",
      }}
    >
      <span style={{ color: "var(--dt-warm-500)" }}>{label}</span>
      <span
        className="tab-num"
        style={{ color: valueColor ?? "var(--dt-warm-900)", fontWeight: 400 }}
      >
        {value}
      </span>
    </div>
  );
}
