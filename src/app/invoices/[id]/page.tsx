import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/Badge";
import { getInvoice } from "@/lib/invoices.server";
import { fmtMoney, fmtPeriod, INVOICE_STATUSES } from "@/lib/invoices";
import { InvoiceActions } from "./InvoiceActions";
import { AddLineItemForm, RemoveLineItemButton } from "./AddLineItemForm";

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getInvoice(id);
  if (!result) notFound();
  const { invoice: inv, lineItems } = result;

  const status = INVOICE_STATUSES.find((s) => s.id === inv.status)!;
  const editable = inv.status === "draft";

  // Group lines by department
  const byDept = new Map<string, typeof lineItems>();
  for (const l of lineItems) {
    const key = l.department ?? "Other";
    const arr = byDept.get(key) ?? [];
    arr.push(l);
    byDept.set(key, arr);
  }

  return (
    <Shell>
      <Topbar
        crumb={`OPERATIONS / INVOICE · ${inv.number}`}
        scriptWord="Invoice "
        title={inv.is_overdue ? "Overdue" : status.label}
        actions={
          <>
            <Link href="/invoices" className="dt-btn">
              ← Ledger
            </Link>
            <InvoiceActions invoiceId={inv.id} status={inv.status} isOverdue={inv.is_overdue} />
          </>
        }
      />

      <div className="invoice-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 20 }}>
        <div className="dt-card gold-edge" style={{ padding: "32px 36px" }}>
          {/* letterhead */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 28,
              paddingBottom: 24,
              borderBottom: "1px solid var(--dt-warm-100)",
              flexWrap: "wrap",
              gap: 18,
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: "var(--dt-script)",
                  fontSize: 22,
                  fontWeight: 200,
                  letterSpacing: "0.22em",
                  color: "var(--dt-gold-deep)",
                  lineHeight: 1,
                  textTransform: "uppercase",
                }}
              >
                Driven Talent
              </div>
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: "0.32em",
                  textTransform: "uppercase",
                  color: "var(--dt-warm-500)",
                  marginTop: 6,
                  fontWeight: 300,
                }}
              >
                Workforce · Solutions
              </div>
              <div style={{ fontSize: 11.5, color: "var(--dt-warm-700)", marginTop: 14, lineHeight: 1.6 }}>
                2200 Mendocino Ave, Suite 4 · Santa Rosa, CA 95403
                <br />
                hello@driventalent.co · (707) 555-0144 · EIN 88-1284621
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "var(--dt-display)", fontSize: 28, fontWeight: 300, letterSpacing: "-0.01em" }}>
                Invoice
              </div>
              <div className="tab-num" style={{ fontSize: 13.5, color: "var(--dt-gold-deep)", fontWeight: 400, marginTop: 4 }}>
                № {inv.number}
              </div>
              <div style={{ marginTop: 14, fontSize: 11.5, color: "var(--dt-warm-700)", lineHeight: 1.7 }}>
                <div>
                  <span style={{ color: "var(--dt-warm-500)", letterSpacing: "0.08em" }}>ISSUED</span> &nbsp;{" "}
                  {fmtDate(inv.issued_at)}
                </div>
                <div>
                  <span style={{ color: "var(--dt-warm-500)", letterSpacing: "0.08em" }}>DUE</span> &nbsp;&nbsp;&nbsp;&nbsp;{" "}
                  {fmtDate(inv.due_at)}
                </div>
                <div>
                  <span style={{ color: "var(--dt-warm-500)", letterSpacing: "0.08em" }}>TERMS</span> &nbsp;&nbsp;{" "}
                  {inv.terms ?? "Net 30"}
                </div>
              </div>
            </div>
          </div>

          {/* billing block */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 36, marginBottom: 28 }}>
            <div>
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "var(--dt-warm-500)",
                  fontWeight: 400,
                  marginBottom: 8,
                }}
              >
                Billed To
              </div>
              <div style={{ fontFamily: "var(--dt-display)", fontSize: 17, fontWeight: 300 }}>
                {inv.clients.name}
              </div>
              <div style={{ fontSize: 12, color: "var(--dt-warm-700)", marginTop: 4, lineHeight: 1.6 }}>
                {inv.clients.contact_name && `Attn: ${inv.clients.contact_name}`}
                {inv.clients.contact_name && inv.clients.address && <br />}
                {inv.clients.address ?? "—"}
              </div>
            </div>
            <div>
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "var(--dt-warm-500)",
                  fontWeight: 400,
                  marginBottom: 8,
                }}
              >
                Service Period
              </div>
              <div style={{ fontFamily: "var(--dt-display)", fontSize: 17, fontWeight: 300 }}>
                {fmtPeriod(inv.period_start, inv.period_end)}
              </div>
              <div style={{ fontSize: 12, color: "var(--dt-warm-700)", marginTop: 4, lineHeight: 1.6 }}>
                {lineItems.length} line items
                <br />
                Workers&apos; comp &amp; payroll taxes included
              </div>
            </div>
          </div>

          {/* department groups */}
          {Array.from(byDept.entries()).map(([dept, lines]) => {
            const deptTotal = lines.reduce((s, l) => s + Number(l.amount), 0);
            return (
              <div key={dept} style={{ marginBottom: 22 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    padding: "10px 0 8px",
                    borderBottom: "2px solid var(--dt-black)",
                  }}
                >
                  <div style={{ fontFamily: "var(--dt-display)", fontSize: 14.5, fontWeight: 400, letterSpacing: "0.02em" }}>
                    {dept}
                  </div>
                  <div className="tab-num" style={{ fontSize: 13, fontWeight: 400 }}>
                    ${fmtMoney(deptTotal)}
                  </div>
                </div>
                <div className="dt-table-wrap">
                  <table className="dt-table" style={{ marginTop: 0 }}>
                    <thead>
                      <tr>
                        <th style={{ background: "transparent", borderBottom: "1px solid var(--dt-warm-100)", paddingLeft: 0 }}>Talent</th>
                        <th style={{ background: "transparent", borderBottom: "1px solid var(--dt-warm-100)" }}>Role</th>
                        <th style={{ background: "transparent", borderBottom: "1px solid var(--dt-warm-100)", textAlign: "right" }}>Hours</th>
                        <th style={{ background: "transparent", borderBottom: "1px solid var(--dt-warm-100)", textAlign: "right" }}>OT</th>
                        <th style={{ background: "transparent", borderBottom: "1px solid var(--dt-warm-100)", textAlign: "right" }}>Rate</th>
                        <th style={{ background: "transparent", borderBottom: "1px solid var(--dt-warm-100)", textAlign: "right", paddingRight: 0 }}>Amount</th>
                        {editable && <th style={{ background: "transparent", borderBottom: "1px solid var(--dt-warm-100)", width: 24 }} />}
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l) => (
                        <tr key={l.id}>
                          <td style={{ paddingLeft: 0, fontWeight: 400 }}>{l.employee_name}</td>
                          <td className="muted" style={{ fontSize: 12 }}>{l.role ?? "—"}</td>
                          <td className="tab-num" style={{ textAlign: "right" }}>{Number(l.hours).toFixed(1)}</td>
                          <td className="tab-num" style={{ textAlign: "right", color: l.ot_hours ? "var(--dt-gold-deep)" : "var(--dt-warm-300)" }}>
                            {l.ot_hours ? Number(l.ot_hours).toFixed(1) : "—"}
                          </td>
                          <td className="tab-num" style={{ textAlign: "right" }}>${Number(l.rate).toFixed(2)}</td>
                          <td className="tab-num" style={{ textAlign: "right", paddingRight: 0, fontWeight: 400 }}>
                            ${fmtMoney(Number(l.amount))}
                          </td>
                          {editable && (
                            <td style={{ textAlign: "right" }}>
                              <RemoveLineItemButton invoiceId={inv.id} lineItemId={l.id} />
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          {lineItems.length === 0 && (
            <div
              style={{
                padding: "32px 0",
                color: "var(--dt-warm-500)",
                fontStyle: "italic",
                textAlign: "center",
              }}
            >
              No line items. {editable ? "Add one below." : ""}
            </div>
          )}

          {editable && <AddLineItemForm invoiceId={inv.id} />}

          {/* totals */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
            <div style={{ width: 320, maxWidth: "100%" }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: 13 }}>
                <span className="muted">Labor subtotal</span>
                <span className="tab-num">${fmtMoney(Number(inv.subtotal))}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: 13 }}>
                <span className="muted">Service &amp; compliance ({Number(inv.fee_pct).toFixed(0)}%)</span>
                <span className="tab-num">${fmtMoney(Number(inv.fee))}</span>
              </div>
              {Number(inv.tax) > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: 13 }}>
                  <span className="muted">CA tax</span>
                  <span className="tab-num">${fmtMoney(Number(inv.tax))}</span>
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "16px 0 4px",
                  alignItems: "baseline",
                  borderTop: "1px solid var(--dt-warm-100)",
                }}
              >
                <span style={{ fontFamily: "var(--dt-display)", fontSize: 16, fontWeight: 400 }}>Total Due</span>
                <span
                  className="tab-num"
                  style={{
                    fontFamily: "var(--dt-display)",
                    fontSize: 30,
                    fontWeight: 400,
                    color: "var(--dt-gold-deep)",
                  }}
                >
                  ${fmtMoney(Number(inv.total))}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "var(--dt-warm-500)", textAlign: "right", letterSpacing: "0.04em" }}>
                USD · payable by ACH or check
              </div>
            </div>
          </div>
        </div>

        {/* sidebar */}
        <div className="col gap-md">
          <div className="dt-card" style={{ padding: 18 }}>
            <div className="tiny muted" style={{ letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 400 }}>
              Status
            </div>
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              <Badge tone={inv.is_overdue ? "red" : status.tone}>
                {inv.is_overdue ? "Overdue" : status.label}
              </Badge>
              {inv.sent_at && (
                <div style={{ fontSize: 11.5, color: "var(--dt-warm-500)" }}>
                  Sent {fmtDate(inv.sent_at)}
                </div>
              )}
              {inv.paid_at && (
                <div style={{ fontSize: 11.5, color: "var(--dt-success)", fontWeight: 400 }}>
                  Paid {fmtDate(inv.paid_at)}
                </div>
              )}
            </div>
          </div>
          <div className="dt-card" style={{ padding: 18 }}>
            <div className="tiny muted" style={{ letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 400 }}>
              Quick Actions
            </div>
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              <a
                href={`/invoices/${inv.id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="dt-btn"
                style={{ justifyContent: "flex-start" }}
              >
                Download PDF →
              </a>
              <Link href="/invoices/new" className="dt-btn" style={{ justifyContent: "flex-start" }}>
                Generate next invoice
              </Link>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
