"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import {
  CLIENTS,
  POSITIONS,
  DEPARTMENTS,
  SHIFTS,
  EMPLOYEES,
  getClient,
  type ClientId,
  type Position,
  type Department,
  type Shift,
} from "@/lib/data";

type Filter = {
  client: ClientId | "all";
  position: Position | "all";
  department: Department | "all";
  shift: Shift | "all";
};

type AttendanceRow = {
  employeeId: string;
  name: string;
  client: ClientId;
  position: Position;
  department: Department;
  shift: Shift;
  rate: number;
  missed: number;
  noShows: number;
  late: number;
  present: number;
  total: number;
  attendanceRate: number; // 0-100
  lastIncident?: { date: string; status: string; notes?: string };
};

function buildRows(): AttendanceRow[] {
  const rows: AttendanceRow[] = [];
  for (const e of EMPLOYEES) {
    for (const a of e.assignments) {
      const recs = e.attendance.filter((x) => x.client === a.client);
      const present = recs.filter((x) => x.status === "present").length;
      const late = recs.filter((x) => x.status === "late").length;
      const missed = recs.filter(
        (x) => x.status === "missed" || x.status === "no-show"
      ).length;
      const noShows = recs.filter((x) => x.status === "no-show").length;
      const total = recs.length;
      const attendanceRate =
        total === 0 ? 0 : Math.round(((present + late) / total) * 100);
      const incidents = recs
        .filter((x) => x.status !== "present")
        .sort((a, b) => (a.date < b.date ? 1 : -1));
      rows.push({
        employeeId: e.id,
        name: e.name,
        client: a.client,
        position: a.position,
        department: a.department,
        shift: a.shift,
        rate: a.rate,
        missed,
        noShows,
        late,
        present,
        total,
        attendanceRate,
        lastIncident: incidents[0],
      });
    }
  }
  return rows;
}

function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <label className="dt-filter">
      <span className="dt-filter-label">{label}</span>
      <select
        className="dt-filter-input"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const INITIAL: Filter = {
  client: "all",
  position: "all",
  department: "all",
  shift: "all",
};

export default function AttendancePage() {
  const [f, setF] = useState<Filter>(INITIAL);

  const allRows = useMemo(() => buildRows(), []);

  const rows = useMemo(() => {
    return allRows.filter((r) => {
      if (f.client !== "all" && r.client !== f.client) return false;
      if (f.position !== "all" && r.position !== f.position) return false;
      if (f.department !== "all" && r.department !== f.department) return false;
      if (f.shift !== "all" && r.shift !== f.shift) return false;
      return true;
    });
  }, [allRows, f]);

  // Sort: most missed first
  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          b.noShows - a.noShows || b.missed - a.missed || a.name.localeCompare(b.name)
      ),
    [rows]
  );

  const totalMissed = sorted.reduce((s, r) => s + r.missed, 0);
  const totalNoShows = sorted.reduce((s, r) => s + r.noShows, 0);
  const avgRate = sorted.length
    ? Math.round(
        sorted.reduce((s, r) => s + r.attendanceRate, 0) / sorted.length
      )
    : 0;

  // Build a human-readable narrative of the active filter, like:
  //   "Inventory Control at Fafixon · 1st (6a–2p)"
  const headline = useMemo(() => {
    const bits: string[] = [];
    if (f.position !== "all") bits.push(f.position);
    if (f.department !== "all" && f.position === "all") bits.push(f.department);
    if (f.client !== "all") {
      const c = CLIENTS.find((x) => x.id === f.client)!;
      bits.push(`at ${c.name}`);
    }
    if (f.shift !== "all") bits.push(`· ${f.shift}`);
    if (bits.length === 0) return "All employees · all clients";
    return bits.join(" ");
  }, [f]);

  return (
    <Shell>
      <Topbar
        crumb="PEOPLE OPS / ATTENDANCE"
        scriptWord="Attendance "
        title="Reports"
        actions={
          <>
            <button className="dt-btn">Export Report</button>
            <button className="dt-btn">Log Incident</button>
            <button className="dt-btn dt-btn-gold">
              <span>Mark Today</span>
            </button>
          </>
        }
      />

      {/* Filters */}
      <div
        className="dt-card"
        style={{ padding: "16px 18px", marginBottom: 18 }}
      >
        <div className="dt-filter-grid">
          <FilterSelect
            label="Client"
            value={f.client}
            onChange={(v) => setF((s) => ({ ...s, client: v }))}
            options={[
              { value: "all" as const, label: "All Clients" },
              ...CLIENTS.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
          <FilterSelect
            label="Position"
            value={f.position}
            onChange={(v) => setF((s) => ({ ...s, position: v }))}
            options={[
              { value: "all" as const, label: "All Positions" },
              ...POSITIONS.map((p) => ({ value: p, label: p })),
            ]}
          />
          <FilterSelect
            label="Department"
            value={f.department}
            onChange={(v) => setF((s) => ({ ...s, department: v }))}
            options={[
              { value: "all" as const, label: "All Departments" },
              ...DEPARTMENTS.map((d) => ({ value: d, label: d })),
            ]}
          />
          <FilterSelect
            label="Shift"
            value={f.shift}
            onChange={(v) => setF((s) => ({ ...s, shift: v }))}
            options={[
              { value: "all" as const, label: "All Shifts" },
              ...SHIFTS.map((s) => ({ value: s, label: s })),
            ]}
          />
          <button
            type="button"
            className="dt-btn dt-btn-ghost tiny"
            onClick={() => setF(INITIAL)}
            style={{ alignSelf: "end" }}
          >
            Reset
          </button>
        </div>
      </div>

      {/* Summary band */}
      <div
        className="dt-card gold-edge"
        style={{
          padding: "22px 26px",
          marginBottom: 22,
          display: "grid",
          gridTemplateColumns: "1.2fr repeat(3, 1fr)",
          gap: 18,
          alignItems: "center",
        }}
      >
        <div>
          <div
            className="tiny muted"
            style={{
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              fontWeight: 400,
            }}
          >
            Report
          </div>
          <div
            style={{
              fontFamily: "var(--dt-display)",
              fontSize: 18,
              fontWeight: 300,
              marginTop: 6,
              letterSpacing: "0.02em",
            }}
          >
            {headline}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--dt-warm-500)",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              marginTop: 6,
            }}
          >
            5-day window · {sorted.length} placements · Apr 27 — May 1, 2026
          </div>
        </div>
        <Stat
          label="Total Missed"
          value={String(totalMissed)}
          accent={
            totalMissed > 5
              ? "var(--dt-danger)"
              : totalMissed > 0
              ? "var(--dt-warning)"
              : "var(--dt-success)"
          }
          sub="days"
        />
        <Stat
          label="No Call / No Show"
          value={String(totalNoShows)}
          accent={totalNoShows > 0 ? "var(--dt-danger)" : "var(--dt-success)"}
          sub={totalNoShows === 1 ? "incident" : "incidents"}
        />
        <Stat
          label="Show Rate"
          value={`${avgRate}%`}
          accent={
            avgRate >= 90
              ? "var(--dt-success)"
              : avgRate >= 75
              ? "var(--dt-warning)"
              : "var(--dt-danger)"
          }
          sub="across filter"
        />
      </div>

      <div className="dt-card">
        <div className="dt-card-head">
          <div>
            <h3>By Employee</h3>
            <div className="sub">
              Sorted by no-shows then missed days · click name for full record
            </div>
          </div>
          <Badge tone="dark">{sorted.length} rows</Badge>
        </div>
        <div className="dt-table-wrap">
          <table className="dt-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 22 }}>Employee</th>
                <th>Client · Position</th>
                <th>Shift</th>
                <th style={{ textAlign: "center" }}>Missed</th>
                <th style={{ textAlign: "center" }}>NCNS</th>
                <th style={{ textAlign: "center" }}>Late</th>
                <th style={{ textAlign: "right" }}>Show Rate</th>
                <th style={{ paddingRight: 22 }}>Last Incident</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const client = getClient(r.client);
                return (
                  <tr key={`${r.employeeId}-${r.client}-${r.shift}`}>
                    <td style={{ paddingLeft: 22 }}>
                      <Link
                        href={`/employees/${r.employeeId}`}
                        className="dt-person dt-person-link"
                      >
                        <Avatar name={r.name} />
                        <div>
                          <div className="name">{r.name}</div>
                          <div className="meta">{r.department}</div>
                        </div>
                      </Link>
                    </td>
                    <td>
                      <div style={{ fontWeight: 400 }}>{client.name}</div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--dt-warm-500)",
                          marginTop: 3,
                        }}
                      >
                        {r.position}
                      </div>
                    </td>
                    <td>
                      <span
                        className="tab-num"
                        style={{
                          fontSize: 11.5,
                          fontFamily: "var(--dt-mono)",
                          color: "var(--dt-warm-700)",
                        }}
                      >
                        {r.shift}
                      </span>
                    </td>
                    <td
                      className="tab-num"
                      style={{
                        textAlign: "center",
                        fontWeight: 400,
                        color:
                          r.missed >= 3
                            ? "var(--dt-danger)"
                            : r.missed >= 1
                            ? "var(--dt-warning)"
                            : "var(--dt-warm-500)",
                        fontFamily: "var(--dt-mono)",
                      }}
                    >
                      {r.missed}
                    </td>
                    <td
                      className="tab-num"
                      style={{
                        textAlign: "center",
                        fontWeight: 400,
                        color:
                          r.noShows >= 1
                            ? "var(--dt-danger)"
                            : "var(--dt-warm-500)",
                        fontFamily: "var(--dt-mono)",
                      }}
                    >
                      {r.noShows}
                    </td>
                    <td
                      className="tab-num"
                      style={{
                        textAlign: "center",
                        fontFamily: "var(--dt-mono)",
                        color: "var(--dt-warm-500)",
                      }}
                    >
                      {r.late}
                    </td>
                    <td
                      className="tab-num"
                      style={{
                        textAlign: "right",
                        fontWeight: 400,
                        color:
                          r.attendanceRate >= 90
                            ? "var(--dt-success)"
                            : r.attendanceRate >= 75
                            ? "var(--dt-warning)"
                            : "var(--dt-danger)",
                      }}
                    >
                      {r.total === 0 ? "—" : `${r.attendanceRate}%`}
                    </td>
                    <td
                      style={{
                        paddingRight: 22,
                        fontSize: 11.5,
                        color: "var(--dt-warm-500)",
                      }}
                    >
                      {r.lastIncident ? (
                        <>
                          <span
                            style={{
                              fontFamily: "var(--dt-mono)",
                              color: "var(--dt-warm-700)",
                            }}
                          >
                            {new Date(r.lastIncident.date).toLocaleDateString(
                              "en-US",
                              { month: "short", day: "numeric" }
                            )}
                          </span>
                          {" · "}
                          <span style={{ textTransform: "uppercase" }}>
                            {r.lastIncident.status}
                          </span>
                          {r.lastIncident.notes && (
                            <span
                              style={{
                                display: "block",
                                fontSize: 10.5,
                                marginTop: 2,
                                fontStyle: "italic",
                              }}
                            >
                              {r.lastIncident.notes}
                            </span>
                          )}
                        </>
                      ) : (
                        <span style={{ color: "var(--dt-warm-300)" }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    style={{
                      textAlign: "center",
                      padding: "48px 22px",
                      color: "var(--dt-warm-500)",
                      fontStyle: "italic",
                    }}
                  >
                    No rows match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
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
    <div>
      <div
        style={{
          fontSize: 10.5,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--dt-warm-500)",
          fontWeight: 400,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          marginTop: 6,
        }}
      >
        <div
          className="tab-num"
          style={{
            fontFamily: "var(--dt-display)",
            fontSize: 28,
            fontWeight: 300,
            color: accent || "var(--dt-black)",
            letterSpacing: "-0.01em",
          }}
        >
          {value}
        </div>
        {sub && (
          <div style={{ fontSize: 11, color: "var(--dt-warm-500)" }}>{sub}</div>
        )}
      </div>
    </div>
  );
}
