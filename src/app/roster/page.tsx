import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge, ScoreBadge, type BadgeTone } from "@/components/Badge";

type Status = "active" | "on-assignment" | "pending" | "available";

type Person = {
  name: string;
  role: string;
  dept: string;
  client: string;
  score: number;
  status: Status;
  tenure: string;
  rate: string;
};

const ROSTER: Person[] = [
  { name: "Maria Hernandez", role: "Lead Line Cook", dept: "Hospitality", client: "Pacific Vines Hotel", score: 96, status: "active", tenure: "2y 4mo", rate: "$28.50/hr" },
  { name: "James Okafor", role: "Forklift Operator", dept: "Warehouse", client: "Coastal Logistics", score: 92, status: "active", tenure: "1y 11mo", rate: "$24.00/hr" },
  { name: "Priya Anand", role: "Senior Caregiver", dept: "Healthcare", client: "Sonoma Senior Living", score: 89, status: "active", tenure: "3y 2mo", rate: "$26.75/hr" },
  { name: "Daniel Chen", role: "Assembly Tech", dept: "Manufacturing", client: "Verdant Foods Co.", score: 84, status: "active", tenure: "8 mo", rate: "$22.00/hr" },
  { name: "Aaliyah Brooks", role: "Front Desk Lead", dept: "Hospitality", client: "Pacific Vines Hotel", score: 81, status: "on-assignment", tenure: "1y 3mo", rate: "$23.50/hr" },
  { name: "Tomás Reyes", role: "CDL Driver — Class A", dept: "Logistics", client: "Coastal Logistics", score: 78, status: "active", tenure: "4y 7mo", rate: "$31.00/hr" },
  { name: "Hannah Kim", role: "Quality Auditor", dept: "Manufacturing", client: "Verdant Foods Co.", score: 76, status: "pending", tenure: "5 mo", rate: "$25.00/hr" },
  { name: "Marcus Webb", role: "Banquet Server", dept: "Hospitality", client: "Sonoma Senior Living", score: 68, status: "available", tenure: "11 mo", rate: "$19.50/hr" },
  { name: "Elena Vasquez", role: "Med Tech II", dept: "Healthcare", client: "— unassigned —", score: 91, status: "available", tenure: "2y 1mo", rate: "$29.00/hr" },
];

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, { tone: BadgeTone; label: string }> = {
    active: { tone: "green", label: "On the Floor" },
    "on-assignment": { tone: "gold", label: "Assigned" },
    pending: { tone: "amber", label: "Onboarding" },
    available: { tone: "warm", label: "Available" },
  };
  const m = map[status];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

function Stat({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: string;
  accent?: string;
  sub?: string;
}) {
  return (
    <div className="dt-card" style={{ padding: "18px 20px", flex: 1, minWidth: 180 }}>
      <div style={{ fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--dt-warm-500)", fontWeight: 400 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
        <div className="tab-num" style={{ fontFamily: "var(--dt-display)", fontSize: 28, fontWeight: 300, color: accent || "var(--dt-black)", letterSpacing: "-0.01em" }}>{value}</div>
        {sub && <div style={{ fontSize: 11.5, color: "var(--dt-warm-500)" }}>{sub}</div>}
      </div>
    </div>
  );
}

export default function RosterPage() {
  return (
    <Shell>
      <Topbar
        crumb="WORKSPACE / PEOPLE"
        scriptWord="Our "
        title="Roster"
        actions={
          <>
            <button className="dt-btn"><span style={{ fontSize: 14 }}>⌕</span> Search 248 people</button>
            <button className="dt-btn">Filter</button>
            <button className="dt-btn dt-btn-gold"><span>+ Add Talent</span></button>
          </>
        }
      />

      <div style={{ display: "flex", gap: 14, marginBottom: 22, flexWrap: "wrap" }}>
        <Stat label="Active Placements" value="186" sub="of 248 total" />
        <Stat label="Avg Score" value="84.6" accent="var(--dt-gold-deep)" sub="↑ 2.3 this qtr" />
        <Stat label="Available Now" value="34" sub="ready to deploy" />
        <Stat label="Onboarding" value="9" accent="#C28B1E" sub="this week" />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--dt-warm-500)", fontWeight: 400, marginRight: 4 }}>Departments</span>
        <Badge tone="dark">All · 248</Badge>
        <Badge tone="warm">Hospitality · 72</Badge>
        <Badge tone="warm">Healthcare · 58</Badge>
        <Badge tone="warm">Warehouse · 44</Badge>
        <Badge tone="warm">Manufacturing · 41</Badge>
        <Badge tone="warm">Logistics · 33</Badge>
      </div>

      <div className="dt-card gold-edge">
        <div className="dt-card-head">
          <div>
            <h3>Showing 9 of 248 placements</h3>
            <div className="sub">Sorted by performance score · Updated 12 min ago</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="dt-btn dt-btn-ghost tiny">Export CSV</button>
            <button className="dt-btn dt-btn-ghost tiny">Columns ▾</button>
          </div>
        </div>
        <div className="dt-table-wrap">
          <table className="dt-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 22 }}>Talent</th>
                <th>Department</th>
                <th>Current Client</th>
                <th>Score</th>
                <th>Status</th>
                <th>Tenure</th>
                <th style={{ textAlign: "right", paddingRight: 22 }}>Bill Rate</th>
              </tr>
            </thead>
            <tbody>
              {ROSTER.map((p) => (
                <tr key={p.name}>
                  <td style={{ paddingLeft: 22 }}>
                    <div className="dt-person">
                      <Avatar name={p.name} />
                      <div>
                        <div className="name">{p.name}</div>
                        <div className="meta">{p.role}</div>
                      </div>
                    </div>
                  </td>
                  <td><span style={{ fontWeight: 300 }}>{p.dept}</span></td>
                  <td><span className="muted" style={{ fontSize: 12.5 }}>{p.client}</span></td>
                  <td><ScoreBadge score={p.score} /></td>
                  <td><StatusBadge status={p.status} /></td>
                  <td className="tab-num" style={{ fontSize: 12.5, color: "var(--dt-warm-700)" }}>{p.tenure}</td>
                  <td className="tab-num" style={{ textAlign: "right", paddingRight: 22, fontWeight: 400 }}>{p.rate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
