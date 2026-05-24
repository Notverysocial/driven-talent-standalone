import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/Badge";
import { KpiTile, KpiGrid } from "@/components/KpiTile";
import { getClientMarginsOverview } from "@/lib/clients.server";
import { fmtPct, fmtUSD, marginTone } from "@/lib/clients";

export default async function ClientsPage() {
  const { totals, rows } = await getClientMarginsOverview();

  return (
    <Shell>
      <Topbar
        crumb="OPERATIONS / CLIENTS"
        scriptWord="Margin "
        title="Book"
        actions={
          <Link href="/invoices" className="dt-btn">
            Invoice ledger →
          </Link>
        }
      />

      <KpiGrid min={200}>
        <KpiTile
          tone="gold"
          label="Active Clients"
          value={totals.clients}
          sub={`${totals.activeHeadcount} working`}
        />
        <KpiTile
          tone="green"
          label="Billed (lifetime)"
          value={fmtUSD(totals.realizedRevenue)}
          sub={`${fmtUSD(totals.realizedCost)} cost`}
        />
        <KpiTile
          tone={marginTone(totals.realizedMarginPct)}
          label="Realized Margin"
          value={fmtPct(totals.realizedMarginPct)}
          sub="across all invoices"
        />
        <KpiTile
          tone="warm"
          label="Expected / Week"
          value={fmtUSD(totals.expectedWeeklyRevenue)}
          sub={`${fmtPct(totals.expectedWeeklyMarginPct)} forward margin`}
        />
      </KpiGrid>

      <div className="dt-card">
        <div className="dt-card-head">
          <div>
            <h3>Client Margins</h3>
            <div className="sub">
              Realized revenue, cost, and margin per client · drill in for
              invoice and assignment breakdown
            </div>
          </div>
        </div>
        <div className="dt-table-wrap">
          <table className="dt-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 22 }}>Client</th>
                <th>Active</th>
                <th>Invoices</th>
                <th style={{ textAlign: "right" }}>Revenue</th>
                <th style={{ textAlign: "right" }}>Cost</th>
                <th style={{ textAlign: "right" }}>Gross</th>
                <th style={{ textAlign: "right" }}>Margin %</th>
                <th
                  style={{
                    textAlign: "right",
                    paddingRight: 22,
                  }}
                >
                  Expected/Wk
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const tone = marginTone(r.realizedMarginPct);
                const marginColor =
                  tone === "green"
                    ? "var(--dt-success)"
                    : tone === "amber"
                    ? "var(--dt-warning)"
                    : tone === "red"
                    ? "var(--dt-danger)"
                    : "var(--dt-warm-700)";
                return (
                  <tr key={r.client.id}>
                    <td style={{ paddingLeft: 22 }}>
                      <Link
                        href={`/clients/${r.client.slug}`}
                        className="dt-person-link"
                        style={{ textDecoration: "none", color: "inherit" }}
                      >
                        <div
                          className="name"
                          style={{ fontWeight: 500, color: "var(--dt-warm-900)" }}
                        >
                          {r.client.name}
                        </div>
                        <div
                          className="meta"
                          style={{
                            fontSize: 10.5,
                            color: "var(--dt-warm-500)",
                            marginTop: 3,
                            letterSpacing: "0.06em",
                          }}
                        >
                          {r.client.city ?? "—"} · {r.client.industry ?? "—"}
                        </div>
                      </Link>
                    </td>
                    <td className="tab-num" style={{ fontSize: 12 }}>
                      {r.activeHeadcount}
                      <span style={{ color: "var(--dt-warm-500)" }}>
                        {" "}
                        / {r.activePlacements}
                      </span>
                    </td>
                    <td className="tab-num" style={{ fontSize: 12 }}>
                      {r.invoiceCount}
                    </td>
                    <td
                      className="tab-num"
                      style={{ textAlign: "right", fontWeight: 400 }}
                    >
                      {fmtUSD(r.realizedRevenue)}
                    </td>
                    <td
                      className="tab-num"
                      style={{ textAlign: "right", color: "var(--dt-warm-700)" }}
                    >
                      {fmtUSD(r.realizedCost)}
                    </td>
                    <td
                      className="tab-num"
                      style={{ textAlign: "right", fontWeight: 400 }}
                    >
                      {fmtUSD(r.realizedGross)}
                    </td>
                    <td
                      className="tab-num"
                      style={{
                        textAlign: "right",
                        color: marginColor,
                        fontWeight: 500,
                      }}
                    >
                      {fmtPct(r.realizedMarginPct)}
                    </td>
                    <td
                      className="tab-num"
                      style={{
                        textAlign: "right",
                        paddingRight: 22,
                        fontSize: 12,
                      }}
                    >
                      {fmtUSD(r.expectedWeeklyRevenue)}
                      <div
                        style={{
                          fontSize: 10,
                          color: "var(--dt-warm-500)",
                          marginTop: 2,
                          letterSpacing: "0.06em",
                        }}
                      >
                        {fmtPct(r.expectedMarginPct, 0)} fwd
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
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
                    No clients on the book yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div
        className="dt-card"
        style={{ padding: "16px 22px", marginTop: 18 }}
      >
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--dt-warm-500)",
            marginBottom: 8,
            fontWeight: 400,
          }}
        >
          Margin Bands
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12 }}>
          <span>
            <Badge tone="green">≥ 25%</Badge> healthy
          </span>
          <span>
            <Badge tone="amber">15 – 25%</Badge> watch
          </span>
          <span>
            <Badge tone="red">&lt; 15%</Badge> thin
          </span>
          <span style={{ color: "var(--dt-warm-500)" }}>
            Realized = invoice subtotals − employee_cost · Expected = bill_rate
            × 40 h × placements
          </span>
        </div>
      </div>
    </Shell>
  );
}
