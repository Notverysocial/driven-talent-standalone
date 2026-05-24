import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/Badge";
import { KpiTile, KpiGrid } from "@/components/KpiTile";
import { getClientMarginDetail } from "@/lib/clients.server";
import { fmtPct, fmtUSD, fmtUSD2, marginTone } from "@/lib/clients";
import { INVOICE_STATUSES } from "@/lib/invoices";

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
            <div
              style={{
                height: 1,
                background: "var(--dt-warm-100)",
                margin: "18px 0",
              }}
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
        </div>
      </div>

      <div className="dt-card">
        <div className="dt-card-head">
          <div>
            <h3>Active Assignments</h3>
            <div className="sub">
              Per-employee bill vs. pay rate · italicized bill = inferred from
              service-fee fallback
            </div>
          </div>
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
                    colSpan={8}
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
