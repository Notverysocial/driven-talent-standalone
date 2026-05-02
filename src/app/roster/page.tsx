"use client";

import { useMemo, useState } from "react";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge, ScoreBadge, type BadgeTone } from "@/components/Badge";

type Status = "active" | "on-assignment" | "pending" | "available";
type Shift = "Day" | "Swing" | "Night" | "Weekend";

type Attendance = {
  present: number;
  late: number;
  absent: number;
};

type Person = {
  id: string;
  name: string;
  position: string;
  dept: string;
  client: string;
  shift: Shift;
  score: number;
  status: Status;
  tenure: string;
  rate: string;
  attendance: Attendance;
};

const CLIENTS = [
  "Pacific Vines Hotel",
  "Coastal Logistics",
  "Sonoma Senior Living",
] as const;

const ROSTER: Person[] = [
  // Pacific Vines Hotel — 5
  { id: "p01", name: "Maria Hernandez", position: "Lead Line Cook", dept: "Hospitality", client: "Pacific Vines Hotel", shift: "Day", score: 96, status: "active", tenure: "2y 4mo", rate: "$28.50/hr", attendance: { present: 22, late: 1, absent: 0 } },
  { id: "p02", name: "Aaliyah Brooks", position: "Front Desk Lead", dept: "Hospitality", client: "Pacific Vines Hotel", shift: "Swing", score: 81, status: "on-assignment", tenure: "1y 3mo", rate: "$23.50/hr", attendance: { present: 21, late: 2, absent: 0 } },
  { id: "p03", name: "Marcus Webb", position: "Banquet Server", dept: "Hospitality", client: "Pacific Vines Hotel", shift: "Weekend", score: 68, status: "active", tenure: "11 mo", rate: "$19.50/hr", attendance: { present: 18, late: 3, absent: 2 } },
  { id: "p04", name: "Lila Park", position: "Sous Chef", dept: "Hospitality", client: "Pacific Vines Hotel", shift: "Day", score: 88, status: "active", tenure: "1y 8mo", rate: "$27.25/hr", attendance: { present: 23, late: 0, absent: 0 } },
  { id: "p05", name: "Devon Rhodes", position: "Night Auditor", dept: "Hospitality", client: "Pacific Vines Hotel", shift: "Night", score: 79, status: "active", tenure: "2y 0mo", rate: "$22.00/hr", attendance: { present: 20, late: 2, absent: 1 } },

  // Coastal Logistics — 5
  { id: "c01", name: "James Okafor", position: "Forklift Operator", dept: "Warehouse", client: "Coastal Logistics", shift: "Day", score: 92, status: "active", tenure: "1y 11mo", rate: "$24.00/hr", attendance: { present: 22, late: 1, absent: 0 } },
  { id: "c02", name: "Tomás Reyes", position: "CDL Driver — Class A", dept: "Logistics", client: "Coastal Logistics", shift: "Swing", score: 78, status: "active", tenure: "4y 7mo", rate: "$31.00/hr", attendance: { present: 21, late: 1, absent: 1 } },
  { id: "c03", name: "Hannah Kim", position: "Quality Auditor", dept: "Warehouse", client: "Coastal Logistics", shift: "Day", score: 76, status: "pending", tenure: "5 mo", rate: "$25.00/hr", attendance: { present: 19, late: 0, absent: 0 } },
  { id: "c04", name: "Owen Mbeki", position: "Dock Supervisor", dept: "Logistics", client: "Coastal Logistics", shift: "Night", score: 87, status: "on-assignment", tenure: "3y 2mo", rate: "$29.50/hr", attendance: { present: 23, late: 0, absent: 0 } },
  { id: "c05", name: "Sofia Ramos", position: "Inventory Clerk", dept: "Warehouse", client: "Coastal Logistics", shift: "Day", score: 73, status: "active", tenure: "9 mo", rate: "$20.75/hr", attendance: { present: 17, late: 4, absent: 2 } },

  // Sonoma Senior Living — 5
  { id: "s01", name: "Priya Anand", position: "Senior Caregiver", dept: "Healthcare", client: "Sonoma Senior Living", shift: "Day", score: 89, status: "active", tenure: "3y 2mo", rate: "$26.75/hr", attendance: { present: 22, late: 1, absent: 0 } },
  { id: "s02", name: "Elena Vasquez", position: "Med Tech II", dept: "Healthcare", client: "Sonoma Senior Living", shift: "Swing", score: 91, status: "active", tenure: "2y 1mo", rate: "$29.00/hr", attendance: { present: 23, late: 0, absent: 0 } },
  { id: "s03", name: "Jordan Bellamy", position: "Activities Aide", dept: "Healthcare", client: "Sonoma Senior Living", shift: "Day", score: 74, status: "active", tenure: "1y 0mo", rate: "$21.00/hr", attendance: { present: 20, late: 2, absent: 1 } },
  { id: "s04", name: "Yuki Tanaka", position: "Night CNA", dept: "Healthcare", client: "Sonoma Senior Living", shift: "Night", score: 85, status: "on-assignment", tenure: "1y 6mo", rate: "$24.50/hr", attendance: { present: 21, late: 1, absent: 1 } },
  { id: "s05", name: "Theo Whitaker", position: "Wellness Coordinator", dept: "Healthcare", client: "Sonoma Senior Living", shift: "Weekend", score: 80, status: "available", tenure: "7 mo", rate: "$23.25/hr", attendance: { present: 19, late: 1, absent: 0 } },
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

function ShiftBadge({ shift }: { shift: Shift }) {
  const tone: BadgeTone =
    shift === "Day" ? "warm" : shift === "Swing" ? "gold" : shift === "Night" ? "dark" : "amber";
  return <Badge tone={tone}>{shift}</Badge>;
}

function attendancePct(a: Attendance) {
  const total = a.present + a.late + a.absent;
  if (!total) return 0;
  return Math.round(((a.present + a.late * 0.5) / total) * 1000) / 10;
}

function AttendanceCell({ a }: { a: Attendance }) {
  const pct = attendancePct(a);
  const color =
    pct >= 95 ? "var(--dt-success)" : pct >= 85 ? "var(--dt-gold-deep)" : pct >= 70 ? "#C28B1E" : "var(--dt-danger)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 110 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span className="tab-num" style={{ fontSize: 13, fontWeight: 400, color }}>{pct}%</span>
        <span style={{ fontSize: 9.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--dt-warm-500)" }}>30d</span>
      </div>
      <div style={{ display: "flex", gap: 10, fontSize: 10.5, color: "var(--dt-warm-500)", letterSpacing: "0.04em" }}>
        <span className="tab-num"><span style={{ color: "var(--dt-success)", fontWeight: 400 }}>{a.present}</span> P</span>
        <span className="tab-num"><span style={{ color: "var(--dt-warning)", fontWeight: 400 }}>{a.late}</span> L</span>
        <span className="tab-num"><span style={{ color: "var(--dt-danger)", fontWeight: 400 }}>{a.absent}</span> A</span>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 160 }}>
      <span style={{ fontSize: 9.5, letterSpacing: "0.28em", textTransform: "uppercase", color: "var(--dt-warm-500)", fontWeight: 400, paddingLeft: "0.28em" }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          appearance: "none",
          WebkitAppearance: "none",
          padding: "10px 32px 10px 14px",
          borderRadius: 0,
          border: "1px solid var(--dt-warm-200)",
          background:
            "#FFFFFF url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6' fill='none' stroke='%231a1a1a' stroke-width='1.2'><path d='M1 1l4 4 4-4'/></svg>\") no-repeat right 12px center",
          color: "var(--dt-black)",
          fontFamily: "var(--dt-sans)",
          fontSize: 12.5,
          fontWeight: 300,
          letterSpacing: "0.04em",
          cursor: "pointer",
        }}
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
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

const ALL = "All";

export default function RosterPage() {
  const [client, setClient] = useState<string>(ALL);
  const [position, setPosition] = useState<string>(ALL);
  const [dept, setDept] = useState<string>(ALL);
  const [shift, setShift] = useState<string>(ALL);

  const positions = useMemo(
    () => [ALL, ...Array.from(new Set(ROSTER.map((p) => p.position))).sort()],
    []
  );
  const departments = useMemo(
    () => [ALL, ...Array.from(new Set(ROSTER.map((p) => p.dept))).sort()],
    []
  );
  const shifts: string[] = [ALL, "Day", "Swing", "Night", "Weekend"];
  const clientOptions = [ALL, ...CLIENTS];

  const filtered = useMemo(
    () =>
      ROSTER.filter(
        (p) =>
          (client === ALL || p.client === client) &&
          (position === ALL || p.position === position) &&
          (dept === ALL || p.dept === dept) &&
          (shift === ALL || p.shift === shift)
      ),
    [client, position, dept, shift]
  );

  const totalCount = ROSTER.length;
  const activeCount = filtered.filter((p) => p.status === "active" || p.status === "on-assignment").length;
  const avgAttendance =
    filtered.length === 0
      ? 0
      : Math.round(
          (filtered.reduce((s, p) => s + attendancePct(p.attendance), 0) / filtered.length) * 10
        ) / 10;
  const flagged = filtered.filter((p) => attendancePct(p.attendance) < 85).length;

  const filtersActive = client !== ALL || position !== ALL || dept !== ALL || shift !== ALL;
  const reset = () => {
    setClient(ALL);
    setPosition(ALL);
    setDept(ALL);
    setShift(ALL);
  };

  return (
    <Shell>
      <Topbar
        crumb="WORKSPACE / PEOPLE"
        scriptWord="Our "
        title="Roster"
        actions={
          <>
            <button className="dt-btn"><span style={{ fontSize: 14 }}>⌕</span> Search {totalCount} people</button>
            <button className="dt-btn dt-btn-gold"><span>+ Add Talent</span></button>
          </>
        }
      />

      <div style={{ display: "flex", gap: 14, marginBottom: 22, flexWrap: "wrap" }}>
        <Stat label="Showing" value={String(filtered.length)} sub={`of ${totalCount} placements`} />
        <Stat label="On Assignment" value={String(activeCount)} sub="active or assigned" />
        <Stat label="Avg Attendance" value={`${avgAttendance}%`} accent="var(--dt-gold-deep)" sub="last 30 days" />
        <Stat label="Attendance Flags" value={String(flagged)} accent={flagged > 0 ? "#C28B1E" : "var(--dt-black)"} sub="below 85%" />
      </div>

      <div className="dt-card" style={{ padding: "18px 20px", marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 12 }}>
          <div style={{ fontSize: 10.5, letterSpacing: "0.28em", textTransform: "uppercase", color: "var(--dt-warm-500)", fontWeight: 400 }}>
            Filters
          </div>
          <button
            className="dt-btn dt-btn-ghost tiny"
            style={{ padding: "4px 0", opacity: filtersActive ? 1 : 0.45, pointerEvents: filtersActive ? "auto" : "none" }}
            onClick={reset}
          >
            Reset filters
          </button>
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <FilterSelect label="Client" value={client} options={clientOptions} onChange={setClient} />
          <FilterSelect label="Position" value={position} options={positions} onChange={setPosition} />
          <FilterSelect label="Department" value={dept} options={departments} onChange={setDept} />
          <FilterSelect label="Shift" value={shift} options={shifts} onChange={setShift} />
        </div>
      </div>

      <div className="dt-card gold-edge">
        <div className="dt-card-head">
          <div>
            <h3>{filtered.length === totalCount ? `All ${totalCount} Placements` : `${filtered.length} of ${totalCount} placements`}</h3>
            <div className="sub">
              {filtersActive
                ? [
                    client !== ALL && client,
                    dept !== ALL && dept,
                    position !== ALL && position,
                    shift !== ALL && `${shift} shift`,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "Across 3 active clients · attendance trailing 30 days"}
            </div>
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
                <th>Client</th>
                <th>Shift</th>
                <th>Score</th>
                <th>Attendance · 30d</th>
                <th>Status</th>
                <th style={{ textAlign: "right", paddingRight: 22 }}>Bill Rate</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: "40px 22px", textAlign: "center", color: "var(--dt-warm-500)", fontSize: 12.5, letterSpacing: "0.04em" }}>
                    No placements match these filters.{" "}
                    <button className="dt-btn dt-btn-ghost tiny" style={{ padding: 0 }} onClick={reset}>Reset →</button>
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.id}>
                    <td style={{ paddingLeft: 22 }}>
                      <div className="dt-person">
                        <Avatar name={p.name} />
                        <div>
                          <div className="name">{p.name}</div>
                          <div className="meta">{p.position}</div>
                        </div>
                      </div>
                    </td>
                    <td><span style={{ fontWeight: 300 }}>{p.dept}</span></td>
                    <td><span className="muted" style={{ fontSize: 12.5 }}>{p.client}</span></td>
                    <td><ShiftBadge shift={p.shift} /></td>
                    <td><ScoreBadge score={p.score} /></td>
                    <td><AttendanceCell a={p.attendance} /></td>
                    <td><StatusBadge status={p.status} /></td>
                    <td className="tab-num" style={{ textAlign: "right", paddingRight: 22, fontWeight: 400 }}>{p.rate}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
