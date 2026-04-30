import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";

type ReconStatus = "match" | "variance" | "missing";
type ReconRow = {
  who: string;
  dt: { hours: number; ot: number; amount: number };
  client: { hours: number; ot: number; amount: number };
  status: ReconStatus;
  delta?: number;
  note?: string;
};

const RECON: { client: string; period: string; rows: ReconRow[] } = {
  client: "Pacific Vines Hotel & Resort",
  period: "Apr 14 — Apr 27, 2026",
  rows: [
    { who: "Maria Hernandez", dt: { hours: 76.0, ot: 4.0, amount: 2280.0 }, client: { hours: 76.0, ot: 4.0, amount: 2280.0 }, status: "match" },
    { who: "Aaliyah Brooks", dt: { hours: 78.5, ot: 4.0, amount: 1891.75 }, client: { hours: 78.5, ot: 4.0, amount: 1891.75 }, status: "match" },
    { who: "Marcus Webb", dt: { hours: 64.0, ot: 0, amount: 1248.0 }, client: { hours: 62.5, ot: 0, amount: 1218.75 }, status: "variance", delta: -29.25, note: "1.5 hr discrepancy — Sat shift" },
    { who: "Prep cooks (×2)", dt: { hours: 92.5, ot: 0, amount: 1942.5 }, client: { hours: 92.5, ot: 0, amount: 1942.5 }, status: "match" },
    { who: "Tomás Reyes (sub)", dt: { hours: 0, ot: 0, amount: 0 }, client: { hours: 8.0, ot: 0, amount: 248.0 }, status: "missing", delta: 248.0, note: "On client log only — verify assignment" },
  ],
};

function fmtR(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatusIcon({ status }: { status: ReconStatus }) {
  if (status === "match")
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--dt-success)", fontSize: 12, fontWeight: 400 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" fill="var(--dt-success-bg)" stroke="var(--dt-success)" />
          <path d="M8 12.5l2.5 2.5L16 9.5" />
        </svg>
        Match
      </span>
    );
  if (status === "variance")
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--dt-warning)", fontSize: 12, fontWeight: 400 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--dt-warning-bg)" stroke="var(--dt-warning)" strokeWidth="2">
          <path d="M12 3l10 18H2z" />
          <path d="M12 10v5M12 17.5v.5" stroke="var(--dt-warning)" strokeLinecap="round" />
        </svg>
        Variance
      </span>
    );
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--dt-danger)", fontSize: 12, fontWeight: 400 }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--dt-danger-bg)" stroke="var(--dt-danger)" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v4M12 15.5v.5" strokeLinecap="round" />
      </svg>
      Missing
    </span>
  );
}

export default function ReconciliationPage() {
  const dtTotal = RECON.rows.reduce((s, r) => s + r.dt.amount, 0);
  const cTotal = RECON.rows.reduce((s, r) => s + r.client.amount, 0);
  const variance = cTotal - dtTotal;
  const matches = RECON.rows.filter((r) => r.status === "match").length;
  const issues = RECON.rows.length - matches;

  return (
    <Shell>
      <Topbar
        crumb="OPERATIONS / WEEK 17"
        scriptWord="Recon"
        title="ciliation"
        actions={
          <>
            <button className="dt-btn">Import client log</button>
            <button className="dt-btn">Flag for review</button>
            <button className="dt-btn dt-btn-gold"><span>Approve &amp; Lock</span></button>
          </>
        }
      />

      <div className="dt-card gold-edge" style={{ padding: "22px 28px", marginBottom: 22, display: "flex", flexWrap: "wrap", gap: 32, alignItems: "center" }}>
        <div style={{ flex: "1 1 280px" }}>
          <div className="tiny muted" style={{ letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 400 }}>Reconciling</div>
          <div style={{ fontFamily: "var(--dt-display)", fontSize: 19, fontWeight: 300, marginTop: 4 }}>{RECON.client}</div>
          <div className="tiny muted" style={{ marginTop: 2 }}>{RECON.period} · {RECON.rows.length} placements</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div className="tab-num" style={{ fontFamily: "var(--dt-display)", fontSize: 26, fontWeight: 300, color: "var(--dt-success)" }}>{matches}</div>
          <div className="tiny muted">Matched</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div className="tab-num" style={{ fontFamily: "var(--dt-display)", fontSize: 26, fontWeight: 300, color: "var(--dt-warning)" }}>{issues}</div>
          <div className="tiny muted">Need review</div>
        </div>
        <div style={{ textAlign: "right", paddingLeft: 24, borderLeft: "1px solid var(--dt-warm-150)" }}>
          <div className="tiny muted" style={{ letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 400 }}>Net Variance</div>
          <div className="tab-num" style={{ fontFamily: "var(--dt-display)", fontSize: 30, fontWeight: 300, color: variance > 0 ? "var(--dt-danger)" : "var(--dt-success)", marginTop: 2 }}>
            {variance >= 0 ? "+" : "−"}${fmtR(Math.abs(variance))}
          </div>
        </div>
      </div>

      <div className="dt-card" style={{ overflow: "hidden" }}>
        <div className="dt-table-wrap">
          <div style={{ minWidth: 980 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid var(--dt-warm-150)" }}>
              <div style={{ padding: "14px 22px", background: "#FFFFFF", borderRight: "1px solid var(--dt-warm-150)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div>
                    <div style={{ fontFamily: "var(--dt-script)", fontSize: 14, fontWeight: 200, letterSpacing: "0.22em", lineHeight: 1, color: "var(--dt-gold-deep)", textTransform: "uppercase" }}>Driven Talent</div>
                    <div style={{ fontSize: 9.5, letterSpacing: "0.22em", color: "rgba(26,26,26,0.45)", textTransform: "uppercase", marginTop: 4, fontWeight: 300 }}>Internal Timecards</div>
                  </div>
                  <div className="tab-num" style={{ fontSize: 13, fontWeight: 400 }}>${fmtR(dtTotal)}</div>
                </div>
              </div>
              <div style={{ padding: "14px 22px", background: "var(--dt-warm-50)", borderLeft: "3px solid var(--dt-gold)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div>
                    <div style={{ fontFamily: "var(--dt-display)", fontSize: 16, fontWeight: 400 }}>Pacific Vines · Client Log</div>
                    <div className="tiny muted" style={{ letterSpacing: "0.16em", textTransform: "uppercase", marginTop: 4, fontWeight: 400 }}>Imported via Kronos · Apr 28</div>
                  </div>
                  <div className="tab-num" style={{ fontSize: 13, fontWeight: 400 }}>${fmtR(cTotal)}</div>
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.6fr 0.6fr 0.9fr 1fr 0.6fr 0.6fr 0.9fr 1.1fr", background: "var(--dt-warm-50)", borderBottom: "1px solid var(--dt-warm-150)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--dt-warm-500)", fontWeight: 400 }}>
              <div style={{ padding: "11px 18px" }}>Talent</div>
              <div style={{ padding: "11px 8px", textAlign: "right" }}>Hrs</div>
              <div style={{ padding: "11px 8px", textAlign: "right" }}>OT</div>
              <div style={{ padding: "11px 18px 11px 8px", textAlign: "right", borderRight: "2px solid var(--dt-warm-150)" }}>DT $</div>
              <div style={{ padding: "11px 18px" }}>&nbsp;</div>
              <div style={{ padding: "11px 8px", textAlign: "right" }}>Hrs</div>
              <div style={{ padding: "11px 8px", textAlign: "right" }}>OT</div>
              <div style={{ padding: "11px 8px", textAlign: "right" }}>Client $</div>
              <div style={{ padding: "11px 18px", textAlign: "right" }}>Status</div>
            </div>

            {RECON.rows.map((r, i) => {
              const matchBg = r.status === "match";
              return (
                <div key={r.who} style={{ display: "grid", gridTemplateColumns: "1.4fr 0.6fr 0.6fr 0.9fr 1fr 0.6fr 0.6fr 0.9fr 1.1fr", background: i % 2 ? "var(--dt-warm-50)" : "var(--dt-white)", borderBottom: i < RECON.rows.length - 1 ? "1px solid var(--dt-warm-100)" : "none", fontSize: 13, alignItems: "center" }}>
                  <div style={{ padding: "14px 18px" }}>
                    <div className="dt-person">
                      <Avatar name={r.who} />
                      <div>
                        <div className="name">{r.who}</div>
                        {r.note && <div style={{ fontSize: 11, color: r.status === "missing" ? "var(--dt-danger)" : "var(--dt-warning)", marginTop: 2, fontWeight: 300 }}>{r.note}</div>}
                      </div>
                    </div>
                  </div>
                  <div className="tab-num" style={{ padding: "14px 8px", textAlign: "right" }}>{r.dt.hours ? r.dt.hours.toFixed(1) : "—"}</div>
                  <div className="tab-num" style={{ padding: "14px 8px", textAlign: "right", color: r.dt.ot ? "var(--dt-gold-deep)" : "var(--dt-warm-300)" }}>{r.dt.ot ? r.dt.ot.toFixed(1) : "—"}</div>
                  <div className="tab-num" style={{ padding: "14px 18px 14px 8px", textAlign: "right", borderRight: "2px solid var(--dt-warm-150)", fontWeight: 400 }}>${fmtR(r.dt.amount)}</div>

                  <div style={{ padding: "14px 18px", display: "flex", justifyContent: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 18, height: 1, background: matchBg ? "var(--dt-success)" : "var(--dt-warning)" }} />
                      {matchBg ? (
                        <span style={{ width: 18, height: 18, borderRadius: "50%", background: "var(--dt-success-bg)", color: "var(--dt-success)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 300 }}>=</span>
                      ) : (
                        <span className="tab-num" style={{ padding: "2px 8px", borderRadius: 4, background: r.status === "missing" ? "var(--dt-danger-bg)" : "var(--dt-warning-bg)", color: r.status === "missing" ? "var(--dt-danger)" : "var(--dt-warning)", fontSize: 10.5, fontWeight: 300, letterSpacing: "0.04em" }}>
                          {(r.delta ?? 0) > 0 ? "+" : "−"}${fmtR(Math.abs(r.delta || 0))}
                        </span>
                      )}
                      <div style={{ width: 18, height: 1, background: matchBg ? "var(--dt-success)" : "var(--dt-warning)" }} />
                    </div>
                  </div>

                  <div className="tab-num" style={{ padding: "14px 8px", textAlign: "right" }}>{r.client.hours ? r.client.hours.toFixed(1) : "—"}</div>
                  <div className="tab-num" style={{ padding: "14px 8px", textAlign: "right", color: r.client.ot ? "var(--dt-gold-deep)" : "var(--dt-warm-300)" }}>{r.client.ot ? r.client.ot.toFixed(1) : "—"}</div>
                  <div className="tab-num" style={{ padding: "14px 8px", textAlign: "right", fontWeight: 400 }}>${fmtR(r.client.amount)}</div>
                  <div style={{ padding: "14px 18px", textAlign: "right" }}><StatusIcon status={r.status} /></div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 18, padding: "14px 20px", background: "var(--dt-gold-50)", border: "1px solid var(--dt-gold-100)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
        <div style={{ fontSize: 12.5, color: "var(--dt-warm-700)" }}>
          <strong style={{ fontFamily: "var(--dt-display)", fontSize: 14 }}>{issues} items need a decision.</strong> &nbsp; Roxanna typically resolves variances within 24 hours by reaching out to the client AP team directly.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="dt-btn">Email client AP</button>
          <button className="dt-btn dt-btn-primary">Resolve all</button>
        </div>
      </div>
    </Shell>
  );
}
