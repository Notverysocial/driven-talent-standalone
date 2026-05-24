import Link from "next/link";
import { Badge } from "@/components/Badge";
import type { PeriodInvoicePreview } from "@/lib/payroll-invoicing.server";
import { fmtMoney } from "@/lib/payroll";

// Reads the preview server-side via previewInvoicesForPeriod and renders
// the rolled-up plan (one invoice per client × department, two lines per
// employee at independent reg/OT bill rates) so operators can sanity-check
// the run before committing.

export function InvoicePreviewCard({ preview }: { preview: PeriodInvoicePreview }) {
  const { groups, lastRun, totals } = preview;
  return (
    <div className="dt-card gold-edge" style={{ marginBottom: 22 }}>
      <div className="dt-card-head">
        <div>
          <h3>Invoice Generation Preview</h3>
          <div className="sub">
            One invoice per client × department · Reg / OT split lines · per SOP
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {lastRun ? (
            <Badge tone="green">
              Generated {new Date(lastRun.ran_at).toLocaleDateString("en-US", {
                month: "short", day: "numeric", year: "numeric",
              })} · {lastRun.invoices_created} invoices
            </Badge>
          ) : (
            <Badge tone="warm">Not yet generated</Badge>
          )}
        </div>
      </div>

      {/* Totals strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: 20,
          padding: "8px 26px 18px",
        }}
      >
        <Mini label="Invoices" value={String(totals.invoices)} />
        <Mini label="Employees" value={String(totals.employees)} />
        <Mini label="Billed" value={`$${fmtMoney(totals.billed)}`} accent="var(--dt-gold-deep)" />
        <Mini label="Cost" value={`$${fmtMoney(totals.cost)}`} />
        <Mini
          label="Margin"
          value={`$${fmtMoney(totals.margin)}`}
          accent={totals.margin > 0 ? "var(--dt-success)" : "var(--dt-danger)"}
          sub={
            totals.billed > 0
              ? `${((totals.margin / totals.billed) * 100).toFixed(1)}%`
              : "—"
          }
        />
      </div>

      {/* Groups */}
      {groups.length === 0 ? (
        <div
          style={{
            padding: "32px 26px",
            color: "var(--dt-warm-500)",
            fontStyle: "italic",
            borderTop: "1px solid var(--dt-warm-100)",
          }}
        >
          No approved timecards in this period yet. Approve timecards first
          (Run Audit → Mark Approved) to see what would be invoiced.
        </div>
      ) : (
        <div className="dt-table-wrap">
          <table className="dt-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 22 }}>Client</th>
                <th>Department</th>
                <th>Branch</th>
                <th>Employees</th>
                <th>Reg hrs</th>
                <th>OT hrs</th>
                <th>Cost</th>
                <th>Margin</th>
                <th style={{ textAlign: "right", paddingRight: 22 }}>Invoice Total</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const totalReg = g.lines.reduce((s, l) => s + l.regHours + l.holidayHours, 0);
                const totalOt = g.lines.reduce((s, l) => s + l.otHours, 0);
                const noBillRate = g.lines.some(
                  (l) => Math.abs(l.billRate - l.payRate * (1 + g.serviceFeePct / 100)) < 0.01,
                );
                return (
                  <tr key={`${g.clientId}::${g.department}::${g.branch ?? ""}`}>
                    <td style={{ paddingLeft: 22, fontWeight: 400 }}>{g.clientName}</td>
                    <td>
                      <Badge tone="warm">{g.department}</Badge>
                      {noBillRate && (
                        <span
                          title="No explicit bill_rate set — using pay × (1 + service fee %)."
                          style={{ marginLeft: 8, fontSize: 10, color: "var(--dt-warning)" }}
                        >
                          ⚠ fallback rate
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: 11, color: "var(--dt-warm-500)" }}>
                      {g.branch ?? "—"}
                    </td>
                    <td className="tab-num">{g.lines.length}</td>
                    <td className="tab-num">{totalReg.toFixed(1)}</td>
                    <td
                      className="tab-num"
                      style={{ color: totalOt > 0 ? "var(--dt-gold-deep)" : "var(--dt-warm-300)" }}
                    >
                      {totalOt.toFixed(1)}
                    </td>
                    <td className="tab-num" style={{ fontSize: 12 }}>
                      ${fmtMoney(g.totalCost)}
                    </td>
                    <td
                      className="tab-num"
                      style={{
                        fontSize: 12,
                        color:
                          g.totalMargin <= 0
                            ? "var(--dt-danger)"
                            : g.marginPct < 15
                            ? "var(--dt-warning)"
                            : "var(--dt-success)",
                      }}
                    >
                      ${fmtMoney(g.totalMargin)}{" "}
                      <span style={{ fontSize: 10, color: "var(--dt-warm-500)" }}>
                        {g.marginPct.toFixed(1)}%
                      </span>
                    </td>
                    <td
                      className="tab-num"
                      style={{
                        textAlign: "right",
                        paddingRight: 22,
                        fontWeight: 400,
                        color: "var(--dt-gold-deep)",
                      }}
                    >
                      ${fmtMoney(g.subtotal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {lastRun && (
        <div
          style={{
            padding: "12px 26px",
            borderTop: "1px solid var(--dt-warm-100)",
            fontSize: 11,
            color: "var(--dt-warm-500)",
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span>
            Last run: {lastRun.invoices_created} invoices · {lastRun.line_items_created} line items
            {lastRun.ran_by ? ` · by ${lastRun.ran_by}` : ""}
            {" · "}
            <span className="tab-num" style={{ color: "var(--dt-gold-deep)" }}>
              ${fmtMoney(Number(lastRun.total_billed))}
            </span>
          </span>
          <Link href="/invoices" className="dt-btn dt-btn-ghost tiny">
            View invoices →
          </Link>
        </div>
      )}
    </div>
  );
}

function Mini({
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
    <div>
      <div
        style={{
          fontSize: 9.5,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--dt-warm-500)",
          fontWeight: 400,
        }}
      >
        {label}
      </div>
      <div
        className="tab-num"
        style={{
          fontFamily: "var(--dt-display)",
          fontSize: 20,
          fontWeight: 300,
          color: accent || "var(--dt-black)",
          marginTop: 4,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 10.5, color: "var(--dt-warm-500)", marginTop: 2 }}>{sub}</div>
      )}
    </div>
  );
}
