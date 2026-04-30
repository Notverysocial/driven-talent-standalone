import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";

const KPIS = [
  { label: "Active Placements", value: "186", sub: "of 248 total", accent: "var(--dt-black)" },
  { label: "Hours This Week", value: "4,128", sub: "across 39 clients", accent: "var(--dt-black)" },
  { label: "Avg Score", value: "84.6", sub: "↑ 2.3 this qtr", accent: "var(--dt-gold-deep)" },
  { label: "Net New Talent", value: "+9", sub: "onboarding", accent: "#C28B1E" },
];

const ACTIVITY = [
  { who: "Maria Hernandez", action: "submitted timecard", detail: "Week 17 · 88.0 hrs", when: "12 min ago", tone: "gold" as const },
  { who: "Daniel Ortega", action: "advanced to placement", detail: "Sonoma Senior Living · day shift", when: "1 hr ago", tone: "green" as const },
  { who: "Pacific Vines Hotel", action: "approved invoice", detail: "DT-2026-0411 · $9,840.00", when: "3 hrs ago", tone: "green" as const },
  { who: "Marcus Webb", action: "variance flagged", detail: "Sat shift · 1.5 hr discrepancy", when: "yesterday", tone: "amber" as const },
  { who: "Hannah Kim", action: "completed onboarding", detail: "Manufacturing · QA II", when: "yesterday", tone: "green" as const },
];

const BILLING = {
  open: 38420.5,
  paidYTD: 412780.0,
  oldest: "12 days",
  invoicesOpen: 4,
};

const PIPELINE = [
  { stage: "New Applications", count: 14, tone: "warm" as const },
  { stage: "Screened", count: 9, tone: "gold" as const },
  { stage: "Client Interview", count: 5, tone: "amber" as const },
  { stage: "Offer Out", count: 2, tone: "green" as const },
];

const CLIENTS = [
  { name: "Pacific Vines Hotel", placements: 12, ytd: "$182,440", trend: "+8%" },
  { name: "Coastal Logistics", placements: 9, ytd: "$143,210", trend: "+12%" },
  { name: "Sonoma Senior Living", placements: 11, ytd: "$129,860", trend: "+4%" },
  { name: "Verdant Foods Co.", placements: 7, ytd: "$98,520", trend: "−3%" },
];

function fmt$(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function DashboardPage() {
  return (
    <Shell>
      <Topbar
        crumb="WORKSPACE / OVERVIEW"
        scriptWord="Good "
        title="Morning"
        actions={
          <>
            <Link href="/timecards" className="dt-btn">Timecards</Link>
            <Link href="/invoices" className="dt-btn">New Invoice</Link>
            <Link href="/candidates" className="dt-btn dt-btn-gold"><span>+ Score Candidate</span></Link>
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 24 }}>
        {KPIS.map((k) => (
          <div key={k.label} className="dt-card" style={{ padding: "18px 20px" }}>
            <div style={{ fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--dt-warm-500)", fontWeight: 400 }}>{k.label}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
              <div className="tab-num" style={{ fontFamily: "var(--dt-display)", fontSize: 30, fontWeight: 300, color: k.accent, letterSpacing: "-0.01em" }}>{k.value}</div>
              <div style={{ fontSize: 11.5, color: "var(--dt-warm-500)" }}>{k.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: 22, marginBottom: 22 }} className="dt-overview-grid">
        <div className="dt-card gold-edge">
          <div className="dt-card-head">
            <div>
              <h3>Activity</h3>
              <div className="sub">The last 24 hours across the operation</div>
            </div>
            <Badge tone="dark">Live</Badge>
          </div>
          <div style={{ padding: "8px 0 0" }}>
            {ACTIVITY.map((a, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 16, alignItems: "center", padding: "16px 26px", borderBottom: i < ACTIVITY.length - 1 ? "1px solid var(--dt-warm-100)" : "none" }}>
                <Avatar name={a.who} />
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 400 }}>
                    {a.who} <span style={{ color: "var(--dt-warm-500)", fontWeight: 300 }}>{a.action}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--dt-warm-500)", marginTop: 4 }}>{a.detail}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                  <Badge tone={a.tone}>{a.when}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="col gap-md">
          <div className="dt-card gold-edge" style={{ padding: "22px 24px" }}>
            <div className="tiny muted" style={{ letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 400 }}>Outstanding Receivables</div>
            <div className="tab-num" style={{ fontFamily: "var(--dt-display)", fontSize: 38, fontWeight: 300, color: "var(--dt-gold-deep)", marginTop: 8, letterSpacing: "-0.01em" }}>${fmt$(BILLING.open)}</div>
            <div style={{ fontSize: 12, color: "var(--dt-warm-500)", marginTop: 6 }}>{BILLING.invoicesOpen} invoices open · oldest {BILLING.oldest}</div>
            <div style={{ height: 1, background: "var(--dt-warm-100)", margin: "18px 0" }} />
            <div className="tiny muted" style={{ letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 400 }}>Paid YTD</div>
            <div className="tab-num" style={{ fontFamily: "var(--dt-display)", fontSize: 22, fontWeight: 300, marginTop: 4 }}>${fmt$(BILLING.paidYTD)}</div>
            <Link href="/invoices" className="dt-btn" style={{ marginTop: 18, justifyContent: "center", width: "100%" }}>Open Billing</Link>
          </div>

          <div className="dt-card" style={{ padding: "18px 22px" }}>
            <div className="tiny muted" style={{ letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 400 }}>Candidate Pipeline</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
              {PIPELINE.map((p) => (
                <div key={p.stage} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12.5, fontWeight: 300 }}>{p.stage}</span>
                  <Badge tone={p.tone}>{p.count}</Badge>
                </div>
              ))}
            </div>
            <Link href="/candidates" className="dt-btn dt-btn-ghost tiny" style={{ marginTop: 14, padding: 0 }}>View pipeline →</Link>
          </div>
        </div>
      </div>

      <div className="dt-card">
        <div className="dt-card-head">
          <div>
            <h3>Top Clients · YTD</h3>
            <div className="sub">By billed revenue · 2026</div>
          </div>
          <Link href="/roster" className="dt-btn dt-btn-ghost tiny">View roster →</Link>
        </div>
        <div className="dt-table-wrap">
          <table className="dt-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 22 }}>Client</th>
                <th>Active Placements</th>
                <th style={{ textAlign: "right" }}>YTD Billed</th>
                <th style={{ textAlign: "right", paddingRight: 22 }}>Trend</th>
              </tr>
            </thead>
            <tbody>
              {CLIENTS.map((c) => (
                <tr key={c.name}>
                  <td style={{ paddingLeft: 22, fontWeight: 400 }}>{c.name}</td>
                  <td className="tab-num">{c.placements}</td>
                  <td className="tab-num" style={{ textAlign: "right", fontWeight: 400 }}>{c.ytd}</td>
                  <td className="tab-num" style={{ textAlign: "right", paddingRight: 22, color: c.trend.startsWith("−") ? "var(--dt-danger)" : "var(--dt-success)" }}>{c.trend}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
