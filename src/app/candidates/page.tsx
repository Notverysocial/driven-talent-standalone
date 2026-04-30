import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";

const CANDIDATE = {
  name: "Daniel Ortega",
  applied: "Senior Caregiver · Healthcare",
  source: "Referral · Priya Anand",
  applied_date: "Apr 26, 2026",
  experience: "6 yrs",
  location: "Petaluma, CA · 18 mi",
  certs: ["CNA · CA Active", "BLS / CPR", "HHA Certified", "Bilingual ES/EN"],
};

type Criterion = {
  key: string;
  label: string;
  sub: string;
  value: number;
  weight: number;
  note: string;
};

const CRITERIA: Criterion[] = [
  { key: "experience", label: "Relevant Experience", sub: "Years and depth in role", value: 88, weight: 20, note: "6 yrs across 2 senior-living facilities" },
  { key: "skills", label: "Hard Skills", sub: "Certifications, technical fit", value: 92, weight: 20, note: "CNA + HHA + BLS — all current" },
  { key: "soft", label: "Communication", sub: "Warmth, clarity, listening", value: 95, weight: 15, note: "Bilingual; exceptional in interview" },
  { key: "reliability", label: "Reliability", sub: "References, attendance history", value: 84, weight: 20, note: "2 strong refs · 1 outstanding callback" },
  { key: "culture", label: "Culture Fit", sub: "Client environment alignment", value: 90, weight: 15, note: "Sonoma Senior Living shortlist match" },
  { key: "flex", label: "Schedule Flexibility", sub: "Shifts, weekends, on-call", value: 70, weight: 10, note: "Weekdays preferred · open to Sat AM" },
];

function colorFor(v: number) {
  if (v >= 90) return "#4F7A3A";
  if (v >= 80) return "var(--dt-gold-deep)";
  if (v >= 70) return "var(--dt-gold)";
  if (v >= 60) return "#C28B1E";
  return "#B23A3A";
}

function Slider({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ position: "relative", height: 36, display: "flex", alignItems: "center" }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: "50%", transform: "translateY(-50%)", height: 6, background: "var(--dt-warm-100)" }} />
      {[25, 50, 75].map((t) => (
        <div key={t} style={{ position: "absolute", left: `calc(${t}% - 0.5px)`, top: "50%", transform: "translateY(-50%)", width: 1, height: 10, background: "var(--dt-warm-200)" }} />
      ))}
      <div style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", height: 6, width: `${value}%`, background: color, boxShadow: `0 0 0 1px ${color}33` }} />
      <div style={{ position: "absolute", left: `calc(${value}% - 11px)`, top: "50%", transform: "translateY(-50%)", width: 22, height: 22, borderRadius: "50%", background: "var(--dt-white)", border: `2px solid ${color}`, boxShadow: "0 2px 6px rgba(26,26,26,0.12)", display: "grid", placeItems: "center" }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      </div>
    </div>
  );
}

export default function CandidatesPage() {
  const weighted = CRITERIA.reduce((s, c) => s + c.value * c.weight, 0) / 100;
  const tier = weighted >= 90 ? "Top Tier" : weighted >= 80 ? "Strong Match" : weighted >= 70 ? "Worth a Look" : "Marginal";
  const tierColor = colorFor(weighted);

  return (
    <Shell>
      <Topbar
        crumb="WORKSPACE / NEW CANDIDATE"
        scriptWord="Score "
        title="Candidate"
        actions={
          <>
            <button className="dt-btn">Save Draft</button>
            <button className="dt-btn">Reject — Not a fit</button>
            <button className="dt-btn dt-btn-gold"><span>Advance to Placement</span></button>
          </>
        }
      />

      <div className="candidate-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 22 }}>
        <div className="col gap-md">
          <div className="dt-card gold-edge" style={{ padding: "22px 26px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
            <div className="dt-person">
              <Avatar name={CANDIDATE.name} size="lg" />
              <div>
                <div style={{ fontFamily: "var(--dt-display)", fontSize: 22, fontWeight: 300 }}>{CANDIDATE.name}</div>
                <div style={{ fontSize: 12.5, color: "var(--dt-warm-500)", marginTop: 3 }}>
                  Applied for {CANDIDATE.applied} · {CANDIDATE.experience} · {CANDIDATE.location}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                  {CANDIDATE.certs.map((c) => <Badge key={c} tone="warm">{c}</Badge>)}
                </div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="tiny muted" style={{ letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 400 }}>Source</div>
              <div style={{ fontFamily: "var(--dt-display)", fontSize: 15, fontWeight: 300, marginTop: 2 }}>{CANDIDATE.source}</div>
              <div className="tiny muted" style={{ marginTop: 2 }}>{CANDIDATE.applied_date}</div>
            </div>
          </div>

          <div className="dt-card">
            <div className="dt-card-head">
              <div>
                <h3>Evaluation Criteria</h3>
                <div className="sub">Drag the sliders. Weighting reflects role priorities for healthcare placements.</div>
              </div>
              <Badge tone="dark">6 criteria · weighted</Badge>
            </div>
            <div style={{ padding: "8px 24px 24px" }}>
              {CRITERIA.map((c, i) => {
                const color = colorFor(c.value);
                return (
                  <div key={c.key} style={{ padding: "18px 0", borderBottom: i < CRITERIA.length - 1 ? "1px solid var(--dt-warm-100)" : "none", display: "grid", gridTemplateColumns: "minmax(180px, 230px) 1fr 90px", gap: 24, alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 400, fontSize: 13.5, display: "flex", alignItems: "center", gap: 8 }}>
                        {c.label}
                        <span style={{ fontSize: 10, fontWeight: 400, color: "var(--dt-warm-500)", background: "var(--dt-warm-100)", padding: "2px 6px", borderRadius: 4, letterSpacing: "0.04em" }}>{c.weight}%</span>
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--dt-warm-500)", marginTop: 3 }}>{c.sub}</div>
                      <div style={{ fontSize: 11.5, color: "var(--dt-warm-700)", marginTop: 6, fontStyle: "italic" }}>“{c.note}”</div>
                    </div>
                    <div>
                      <Slider value={c.value} color={color} />
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--dt-warm-300)", letterSpacing: "0.1em", marginTop: 2 }}>
                        <span>POOR</span><span>FAIR</span><span>GOOD</span><span>STRONG</span><span>EXCEPTIONAL</span>
                      </div>
                    </div>
                    <div className="tab-num" style={{ textAlign: "right", fontFamily: "var(--dt-display)", fontSize: 26, fontWeight: 300, color }}>{c.value}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="dt-card">
            <div className="dt-card-head">
              <div>
                <h3>Roxanna&apos;s Notes</h3>
                <div className="sub">What you&apos;d tell a client about this person</div>
              </div>
            </div>
            <div style={{ padding: "18px 24px 22px" }}>
              <div style={{ padding: "14px 16px", background: "var(--dt-warm-50)", border: "1px solid var(--dt-warm-150)", fontSize: 13.5, lineHeight: 1.7, color: "var(--dt-warm-700)", fontFamily: "var(--dt-display)", fontStyle: "italic" }}>
                Daniel is the kind of caregiver families ask for by name. Priya vouched for him personally — she trained him at his last facility and said he stayed late for residents nobody else wanted to sit with. The schedule flex is the only soft spot, but Sonoma Senior Living&apos;s day shifts line up cleanly with what he wants. I&apos;d put him in front of Marlene at Sonoma this week.
              </div>
            </div>
          </div>
        </div>

        <div className="col gap-md">
          <div className="dt-card gold-edge" style={{ padding: "32px 26px", textAlign: "center", background: "#FFFFFF", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at top, rgba(245,166,35,0.08), transparent 70%)" }} />
            <div style={{ position: "relative" }}>
              <div style={{ fontSize: 10.5, letterSpacing: "0.24em", textTransform: "uppercase", color: "rgba(26,26,26,0.45)", fontWeight: 400 }}>Composite Score</div>

              <div style={{ position: "relative", width: 200, height: 200, margin: "20px auto 8px" }}>
                <svg width="200" height="200" viewBox="0 0 200 200">
                  <circle cx="100" cy="100" r="86" fill="none" stroke="rgba(26,26,26,0.08)" strokeWidth="10" />
                  <circle
                    cx="100"
                    cy="100"
                    r="86"
                    fill="none"
                    stroke={tierColor === "#4F7A3A" ? "#7BB85A" : "var(--dt-gold)"}
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={`${(weighted / 100) * 540.35} 540.35`}
                    transform="rotate(-90 100 100)"
                    style={{ filter: "drop-shadow(0 0 8px rgba(245,166,35,0.25))" }}
                  />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
                  <div>
                    <div className="tab-num" style={{ fontFamily: "var(--dt-display)", fontSize: 64, fontWeight: 300, lineHeight: 1, color: "var(--dt-gold-deep)" }}>{weighted.toFixed(1)}</div>
                    <div style={{ fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(26,26,26,0.45)", marginTop: 6, fontWeight: 400 }}>OUT OF 100</div>
                  </div>
                </div>
              </div>

              <div style={{ fontFamily: "var(--dt-script)", fontSize: 16, fontWeight: 200, letterSpacing: "0.24em", color: "var(--dt-gold)", lineHeight: 1, marginTop: 14, textTransform: "uppercase" }}>{tier}</div>
              <div style={{ fontSize: 12, color: "rgba(26,26,26,0.55)", marginTop: 8, lineHeight: 1.6, padding: "0 8px" }}>
                Recommend advancing to client interview. Sonoma Senior Living and Healdsburg Memory Care both have day-shift openings.
              </div>
            </div>
          </div>

          <div className="dt-card" style={{ padding: 18 }}>
            <div className="tiny muted" style={{ letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 400 }}>Breakdown</div>
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              {CRITERIA.map((c) => {
                const contrib = (c.value * c.weight) / 100;
                return (
                  <div key={c.key} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 300 }}>{c.label}</div>
                      <div style={{ height: 4, background: "var(--dt-warm-100)", marginTop: 5, overflow: "hidden" }}>
                        <div style={{ width: `${c.value}%`, height: "100%", background: colorFor(c.value) }} />
                      </div>
                    </div>
                    <div className="tab-num" style={{ fontSize: 12, fontWeight: 400, minWidth: 60, textAlign: "right" }}>
                      {c.value} <span style={{ color: "var(--dt-warm-500)" }}>· +{contrib.toFixed(1)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
