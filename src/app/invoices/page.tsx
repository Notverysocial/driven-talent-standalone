import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/Badge";

const INVOICE = {
  number: "DT-2026-0417",
  date: "April 28, 2026",
  due: "May 28, 2026",
  client: {
    name: "Pacific Vines Hotel & Resort",
    contact: "Attn: Sandra Liu, AP Manager",
    address: "1840 Coast Highway · Healdsburg, CA 95448",
    terms: "Net 30",
  },
  period: "Apr 14 — Apr 27, 2026 (Weeks 16–17)",
  departments: [
    {
      name: "Hospitality — Front of House",
      lines: [
        { who: "Aaliyah Brooks", role: "Front Desk Lead", hours: 78.5, rate: 23.5, ot: 4.0 },
        { who: "Marcus Webb", role: "Banquet Server", hours: 64.0, rate: 19.5, ot: 0 },
      ],
    },
    {
      name: "Hospitality — Kitchen",
      lines: [
        { who: "Maria Hernandez", role: "Lead Line Cook", hours: 76.0, rate: 28.5, ot: 4.0 },
        { who: "Two prep cooks (pooled)", role: "Prep · part-time", hours: 92.5, rate: 21.0, ot: 0 },
      ],
    },
  ],
};

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function InvoicesPage() {
  let subtotal = 0;
  const deptTotals = INVOICE.departments.map((d) => {
    const t = d.lines.reduce((s, l) => s + l.hours * l.rate + l.ot * l.rate * 0.5, 0);
    subtotal += t;
    return t;
  });
  const fee = subtotal * 0.08;
  const total = subtotal + fee;

  return (
    <Shell>
      <Topbar
        crumb="OPERATIONS / BILLING"
        scriptWord="New "
        title="Invoice"
        actions={
          <>
            <button className="dt-btn">Save Draft</button>
            <button className="dt-btn">Preview PDF</button>
            <button className="dt-btn dt-btn-gold"><span>Send to Client</span></button>
          </>
        }
      />

      <div className="invoice-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 20 }}>
        <div className="dt-card gold-edge" style={{ padding: "32px 36px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, paddingBottom: 24, borderBottom: "1px solid var(--dt-warm-100)", flexWrap: "wrap", gap: 18 }}>
            <div>
              <div style={{ fontFamily: "var(--dt-script)", fontSize: 22, fontWeight: 200, letterSpacing: "0.22em", color: "var(--dt-gold-deep)", lineHeight: 1, textTransform: "uppercase" }}>Driven Talent</div>
              <div style={{ fontSize: 10, letterSpacing: "0.32em", textTransform: "uppercase", color: "var(--dt-warm-500)", marginTop: 6, fontWeight: 300 }}>Workforce · Solutions</div>
              <div style={{ fontSize: 11.5, color: "var(--dt-warm-700)", marginTop: 14, lineHeight: 1.6 }}>
                2200 Mendocino Ave, Suite 4 · Santa Rosa, CA 95403<br />
                hello@driventalent.co · (707) 555-0144 · EIN 88-1284621
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "var(--dt-display)", fontSize: 28, fontWeight: 300, letterSpacing: "-0.01em" }}>Invoice</div>
              <div className="tab-num" style={{ fontSize: 13.5, color: "var(--dt-gold-deep)", fontWeight: 400, marginTop: 4 }}>№ {INVOICE.number}</div>
              <div style={{ marginTop: 14, fontSize: 11.5, color: "var(--dt-warm-700)", lineHeight: 1.7 }}>
                <div><span style={{ color: "var(--dt-warm-500)", letterSpacing: "0.08em" }}>ISSUED</span> &nbsp; {INVOICE.date}</div>
                <div><span style={{ color: "var(--dt-warm-500)", letterSpacing: "0.08em" }}>DUE</span> &nbsp;&nbsp;&nbsp;&nbsp; {INVOICE.due}</div>
                <div><span style={{ color: "var(--dt-warm-500)", letterSpacing: "0.08em" }}>TERMS</span> &nbsp;&nbsp; {INVOICE.client.terms}</div>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 36, marginBottom: 28 }}>
            <div>
              <div style={{ fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--dt-warm-500)", fontWeight: 400, marginBottom: 8 }}>Billed To</div>
              <div style={{ fontFamily: "var(--dt-display)", fontSize: 17, fontWeight: 300 }}>{INVOICE.client.name}</div>
              <div style={{ fontSize: 12, color: "var(--dt-warm-700)", marginTop: 4, lineHeight: 1.6 }}>
                {INVOICE.client.contact}<br />
                {INVOICE.client.address}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--dt-warm-500)", fontWeight: 400, marginBottom: 8 }}>Service Period</div>
              <div style={{ fontFamily: "var(--dt-display)", fontSize: 17, fontWeight: 300 }}>{INVOICE.period}</div>
              <div style={{ fontSize: 12, color: "var(--dt-warm-700)", marginTop: 4, lineHeight: 1.6 }}>
                4 placements · 311.0 total hours<br />
                Workers&apos; comp &amp; payroll taxes included
              </div>
            </div>
          </div>

          {INVOICE.departments.map((d, di) => (
            <div key={d.name} style={{ marginBottom: 22 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "10px 0 8px", borderBottom: "2px solid var(--dt-black)" }}>
                <div style={{ fontFamily: "var(--dt-display)", fontSize: 14.5, fontWeight: 400, letterSpacing: "0.02em" }}>{d.name}</div>
                <div className="tab-num" style={{ fontSize: 13, fontWeight: 400 }}>${fmt(deptTotals[di])}</div>
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
                    </tr>
                  </thead>
                  <tbody>
                    {d.lines.map((l) => {
                      const amt = l.hours * l.rate + l.ot * l.rate * 0.5;
                      return (
                        <tr key={l.who}>
                          <td style={{ paddingLeft: 0, fontWeight: 400 }}>{l.who}</td>
                          <td className="muted" style={{ fontSize: 12 }}>{l.role}</td>
                          <td className="tab-num" style={{ textAlign: "right" }}>{l.hours.toFixed(1)}</td>
                          <td className="tab-num" style={{ textAlign: "right", color: l.ot ? "var(--dt-gold-deep)" : "var(--dt-warm-300)" }}>{l.ot ? l.ot.toFixed(1) : "—"}</td>
                          <td className="tab-num" style={{ textAlign: "right" }}>${l.rate.toFixed(2)}</td>
                          <td className="tab-num" style={{ textAlign: "right", paddingRight: 0, fontWeight: 400 }}>${fmt(amt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
            <div style={{ width: 320, maxWidth: "100%" }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: 13 }}>
                <span className="muted">Labor subtotal</span>
                <span className="tab-num">${fmt(subtotal)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: 13 }}>
                <span className="muted">Service &amp; compliance (8%)</span>
                <span className="tab-num">${fmt(fee)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: 13, borderBottom: "1px solid var(--dt-warm-100)" }}>
                <span className="muted">CA tax</span>
                <span className="tab-num muted">— exempt</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "16px 0 4px", alignItems: "baseline" }}>
                <span style={{ fontFamily: "var(--dt-display)", fontSize: 16, fontWeight: 400 }}>Total Due</span>
                <span className="tab-num" style={{ fontFamily: "var(--dt-display)", fontSize: 30, fontWeight: 400, color: "var(--dt-gold-deep)" }}>${fmt(total)}</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--dt-warm-500)", textAlign: "right", letterSpacing: "0.04em" }}>
                USD · payable by ACH or check
              </div>
            </div>
          </div>

          <div style={{ marginTop: 32, padding: "16px 18px", background: "var(--dt-gold-50)", border: "1px solid var(--dt-gold-100)", fontSize: 11.5, color: "var(--dt-warm-700)", lineHeight: 1.7 }}>
            <span style={{ fontFamily: "var(--dt-script)", fontWeight: 300, fontStyle: "normal", fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--dt-gold-deep)" }}>Thank you, Sandra.</span> &nbsp; Payment may be remitted via ACH to Mechanics Bank · Routing 121102036 · Account on file. Questions? Reply to this email and Roxanna will personally make it right.
          </div>
        </div>

        <div className="col gap-md">
          <div className="dt-card" style={{ padding: 18 }}>
            <div className="tiny muted" style={{ letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 400 }}>Status</div>
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              <Badge tone="amber">Draft · auto-saved 2m ago</Badge>
              <Badge tone="green">All timecards approved</Badge>
              <Badge tone="warm">Markup verified vs. contract</Badge>
            </div>
          </div>
          <div className="dt-card" style={{ padding: 18 }}>
            <div className="tiny muted" style={{ letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 400 }}>This client · YTD</div>
            <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <div className="tab-num" style={{ fontFamily: "var(--dt-display)", fontSize: 22, fontWeight: 300 }}>$182,440</div>
                <div className="tiny muted" style={{ marginTop: 2 }}>Billed YTD</div>
              </div>
              <div>
                <div className="tab-num" style={{ fontFamily: "var(--dt-display)", fontSize: 22, fontWeight: 300, color: "var(--dt-success)" }}>100%</div>
                <div className="tiny muted" style={{ marginTop: 2 }}>On-time pay</div>
              </div>
              <div>
                <div className="tab-num" style={{ fontFamily: "var(--dt-display)", fontSize: 22, fontWeight: 300 }}>11</div>
                <div className="tiny muted" style={{ marginTop: 2 }}>Invoices</div>
              </div>
              <div>
                <div className="tab-num" style={{ fontFamily: "var(--dt-display)", fontSize: 22, fontWeight: 300 }}>18d</div>
                <div className="tiny muted" style={{ marginTop: 2 }}>Avg pay time</div>
              </div>
            </div>
          </div>
          <div className="dt-card" style={{ padding: 18 }}>
            <div className="tiny muted" style={{ letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 400 }}>Quick Actions</div>
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              <button className="dt-btn" style={{ justifyContent: "flex-start" }}>Duplicate from last invoice</button>
              <button className="dt-btn" style={{ justifyContent: "flex-start" }}>Add ad-hoc line item</button>
              <button className="dt-btn" style={{ justifyContent: "flex-start" }}>Apply credit memo</button>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
