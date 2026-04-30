import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";

const EMPLOYEE = {
  name: "Maria Hernandez",
  role: "Lead Line Cook",
  client: "Pacific Vines Hotel",
  dept: "Hospitality",
  rate: 28.5,
};

type Day = {
  day: string;
  date: string;
  regular: number;
  overtime: number;
  holiday: number;
  in: string;
  out: string;
  break: number;
  locked: boolean;
};

const WEEK: Day[] = [
  { day: "Mon", date: "Apr 21", regular: 8.0, overtime: 0, holiday: 0, in: "06:00", out: "14:30", break: 0.5, locked: true },
  { day: "Tue", date: "Apr 22", regular: 8.0, overtime: 0.5, holiday: 0, in: "06:00", out: "15:00", break: 0.5, locked: true },
  { day: "Wed", date: "Apr 23", regular: 8.0, overtime: 1.5, holiday: 0, in: "05:30", out: "15:30", break: 0.5, locked: true },
  { day: "Thu", date: "Apr 24", regular: 8.0, overtime: 0, holiday: 0, in: "06:00", out: "14:30", break: 0.5, locked: false },
  { day: "Fri", date: "Apr 25", regular: 8.0, overtime: 2.0, holiday: 0, in: "05:00", out: "15:30", break: 0.5, locked: false },
  { day: "Sat", date: "Apr 26", regular: 6.0, overtime: 0, holiday: 0, in: "08:00", out: "14:30", break: 0.5, locked: false },
  { day: "Sun", date: "Apr 27", regular: 0, overtime: 0, holiday: 0, in: "—", out: "—", break: 0, locked: false },
];

type CellType = "reg" | "ot" | "hol";

function HourCell({ value, type }: { value: number; type: CellType }) {
  const colors: Record<CellType, { bg: string; fg: string }> = {
    reg: { bg: "var(--dt-white)", fg: "var(--dt-black)" },
    ot: { bg: "var(--dt-gold-50)", fg: "var(--dt-gold-deep)" },
    hol: { bg: "#EAF1E0", fg: "var(--dt-success)" },
  };
  const c = colors[type];
  const empty = !value || value === 0;
  return (
    <div
      className="tab-num"
      style={{
        padding: "10px 12px",
        background: empty ? "var(--dt-warm-50)" : c.bg,
        border: "1px solid var(--dt-warm-150)",
        textAlign: "center",
        fontFamily: "var(--dt-mono)",
        fontSize: 14,
        fontWeight: 400,
        color: empty ? "var(--dt-warm-300)" : c.fg,
        minWidth: 60,
      }}
    >
      {empty ? "—" : value.toFixed(1)}
    </div>
  );
}

export default function TimecardsPage() {
  const totalReg = WEEK.reduce((s, d) => s + d.regular, 0);
  const totalOt = WEEK.reduce((s, d) => s + d.overtime, 0);
  const totalHol = WEEK.reduce((s, d) => s + d.holiday, 0);
  const total = totalReg + totalOt + totalHol;
  const gross = totalReg * EMPLOYEE.rate + totalOt * EMPLOYEE.rate * 1.5;

  const rows: { key: keyof Day; label: string; type: CellType }[] = [
    { key: "regular", label: "Regular", type: "reg" },
    { key: "overtime", label: "Overtime", type: "ot" },
    { key: "holiday", label: "Holiday", type: "hol" },
  ];

  return (
    <Shell>
      <Topbar
        crumb="OPERATIONS / WEEK 17"
        scriptWord="Time "
        title="Card"
        actions={
          <>
            <button className="dt-btn">‹ Prev Week</button>
            <button className="dt-btn">Next Week ›</button>
            <button className="dt-btn dt-btn-primary">Save Draft</button>
            <button className="dt-btn dt-btn-gold"><span>Submit for Approval</span></button>
          </>
        }
      />

      <div className="dt-card gold-edge" style={{ padding: "20px 24px", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 18 }}>
        <div className="dt-person">
          <Avatar name={EMPLOYEE.name} size="lg" />
          <div>
            <div style={{ fontFamily: "var(--dt-display)", fontSize: 20, fontWeight: 300 }}>{EMPLOYEE.name}</div>
            <div style={{ fontSize: 12.5, color: "var(--dt-warm-500)", marginTop: 2 }}>
              {EMPLOYEE.role} · {EMPLOYEE.client} · {EMPLOYEE.dept}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 28, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div className="tiny muted" style={{ letterSpacing: "0.14em", textTransform: "uppercase" }}>Pay Period</div>
            <div style={{ fontWeight: 400, fontSize: 13.5, marginTop: 2 }}>Apr 21 — Apr 27, 2026</div>
          </div>
          <div>
            <div className="tiny muted" style={{ letterSpacing: "0.14em", textTransform: "uppercase" }}>Bill Rate</div>
            <div className="tab-num" style={{ fontWeight: 400, fontSize: 13.5, marginTop: 2 }}>${EMPLOYEE.rate.toFixed(2)} / hr</div>
          </div>
          <Badge tone="amber">3 of 7 days unlocked</Badge>
        </div>
      </div>

      <div className="dt-card" style={{ padding: 0, marginBottom: 18 }}>
        <div className="dt-table-wrap">
          <div style={{ minWidth: 880 }}>
            <div style={{ display: "grid", gridTemplateColumns: "110px repeat(7, 1fr) 100px", borderBottom: "1px solid var(--dt-warm-150)", background: "var(--dt-warm-50)" }}>
              <div style={{ padding: "14px 18px", fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--dt-warm-500)", fontWeight: 400 }}>Type</div>
              {WEEK.map((d) => (
                <div key={d.day} style={{ padding: "14px 8px", textAlign: "center", borderLeft: "1px solid var(--dt-warm-100)" }}>
                  <div style={{ fontSize: 11, fontWeight: 400, letterSpacing: "0.14em", color: d.day === "Sat" || d.day === "Sun" ? "var(--dt-gold-deep)" : "var(--dt-warm-700)" }}>{d.day.toUpperCase()}</div>
                  <div style={{ fontSize: 10.5, color: "var(--dt-warm-500)", marginTop: 3, letterSpacing: "0.04em" }}>{d.date}</div>
                </div>
              ))}
              <div style={{ padding: "14px 12px", fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--dt-warm-500)", fontWeight: 400, textAlign: "right", borderLeft: "1px solid var(--dt-warm-150)", background: "var(--dt-cream)" }}>Total</div>
            </div>

            {rows.map((row) => {
              const rt = WEEK.reduce((s, d) => s + (d[row.key] as number), 0);
              return (
                <div key={String(row.key)} style={{ display: "grid", gridTemplateColumns: "110px repeat(7, 1fr) 100px", borderBottom: "1px solid var(--dt-warm-100)" }}>
                  <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 400 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: row.type === "reg" ? "var(--dt-warm-300)" : row.type === "ot" ? "var(--dt-gold)" : "var(--dt-success)" }} />
                    {row.label}
                  </div>
                  {WEEK.map((d) => (
                    <div key={d.day} style={{ padding: 10, borderLeft: "1px solid var(--dt-warm-100)" }}>
                      <HourCell value={d[row.key] as number} type={row.type} />
                    </div>
                  ))}
                  <div className="tab-num" style={{ padding: "14px 16px", textAlign: "right", fontWeight: 300, fontSize: 14, borderLeft: "1px solid var(--dt-warm-150)", background: "var(--dt-cream)" }}>
                    {rt.toFixed(1)}
                  </div>
                </div>
              );
            })}

            <div style={{ display: "grid", gridTemplateColumns: "110px repeat(7, 1fr) 100px", background: "var(--dt-warm-50)" }}>
              <div style={{ padding: "12px 18px", fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--dt-warm-500)", fontWeight: 400 }}>In · Out</div>
              {WEEK.map((d) => (
                <div key={d.day} className="tab-num" style={{ padding: "10px 8px", textAlign: "center", borderLeft: "1px solid var(--dt-warm-100)", fontFamily: "var(--dt-mono)", fontSize: 11, color: "var(--dt-warm-700)" }}>
                  {d.in}<br /><span style={{ color: "var(--dt-warm-500)" }}>{d.out}</span>
                  {d.locked && <div style={{ marginTop: 4, fontSize: 9, color: "var(--dt-success)", letterSpacing: "0.1em", fontFamily: "var(--dt-sans)" }}>● LOCKED</div>}
                </div>
              ))}
              <div style={{ borderLeft: "1px solid var(--dt-warm-150)", background: "var(--dt-cream)" }} />
            </div>
          </div>
        </div>
      </div>

      <div className="dt-card gold-edge" style={{ padding: "24px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#FFFFFF", flexWrap: "wrap", gap: 18 }}>
        <div style={{ display: "flex", gap: 36, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 10.5, letterSpacing: "0.18em", color: "rgba(26,26,26,0.45)", textTransform: "uppercase", fontWeight: 400 }}>Regular</div>
            <div className="tab-num" style={{ fontFamily: "var(--dt-display)", fontSize: 22, fontWeight: 300, marginTop: 4 }}>{totalReg.toFixed(1)} <span style={{ fontSize: 12, color: "rgba(26,26,26,0.4)" }}>hrs</span></div>
          </div>
          <div>
            <div style={{ fontSize: 10.5, letterSpacing: "0.18em", color: "rgba(26,26,26,0.45)", textTransform: "uppercase", fontWeight: 400 }}>Overtime <span style={{ color: "var(--dt-gold)" }}>1.5×</span></div>
            <div className="tab-num" style={{ fontFamily: "var(--dt-display)", fontSize: 22, fontWeight: 300, marginTop: 4, color: "var(--dt-gold-deep)" }}>{totalOt.toFixed(1)} <span style={{ fontSize: 12, color: "rgba(26,26,26,0.4)" }}>hrs</span></div>
          </div>
          <div>
            <div style={{ fontSize: 10.5, letterSpacing: "0.18em", color: "rgba(26,26,26,0.45)", textTransform: "uppercase", fontWeight: 400 }}>Total</div>
            <div className="tab-num" style={{ fontFamily: "var(--dt-display)", fontSize: 22, fontWeight: 300, marginTop: 4 }}>{total.toFixed(1)} <span style={{ fontSize: 12, color: "rgba(26,26,26,0.4)" }}>hrs</span></div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10.5, letterSpacing: "0.18em", color: "rgba(26,26,26,0.45)", textTransform: "uppercase", fontWeight: 400 }}>Estimated Gross</div>
          <div className="tab-num" style={{ fontFamily: "var(--dt-display)", fontSize: 30, fontWeight: 300, marginTop: 4, color: "var(--dt-gold-deep)" }}>${gross.toFixed(2)}</div>
        </div>
      </div>
    </Shell>
  );
}
