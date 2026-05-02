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
  flattenRoster,
  bandColor,
  weightedAttendancePct,
  lastNDays,
  type ClientId,
  type Position,
  type Department,
  type Shift,
  type ScoreBand,
  type AttendanceEntry,
} from "@/lib/data";

type FilterState = {
  search: string;
  client: ClientId | "all";
  position: Position | "all";
  department: Department | "all";
  shift: Shift | "all";
  band: ScoreBand | "all";
};

const INITIAL: FilterState = {
  search: "",
  client: "all",
  position: "all",
  department: "all",
  shift: "all",
  band: "all",
};

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

function BandPill({ band }: { band: ScoreBand }) {
  const c = bandColor(band);
  const label = band === "green" ? "Green" : band === "yellow" ? "Yellow" : "Red";
  return <Badge tone={c.tone}>{label}</Badge>;
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
    <div
      className="dt-card"
      style={{ padding: "18px 20px", flex: 1, minWidth: 180 }}
    >
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
          marginTop: 8,
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
          <div style={{ fontSize: 11.5, color: "var(--dt-warm-500)" }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

function attRateColor(pct: number): string {
  if (pct >= 95) return "var(--dt-success)";
  if (pct >= 85) return "var(--dt-gold-deep)";
  if (pct >= 70) return "#C28B1E";
  return "var(--dt-danger)";
}

const DOT_COLOR: Record<AttendanceEntry["status"], string> = {
  present: "var(--dt-success)",
  late: "var(--dt-warning)",
  missed: "var(--dt-danger)",
  "no-show": "var(--dt-danger)",
  excused: "var(--dt-warm-300)",
};

const DOT_LABEL: Record<AttendanceEntry["status"], string> = {
  present: "Present",
  late: "Late",
  missed: "Missed",
  "no-show": "No-Show",
  excused: "Excused",
};

function LastFourteenDays({ records }: { records: AttendanceEntry[] }) {
  // Most-recent 14 entries for this (employee, client) pairing,
  // rendered oldest → newest so the rightmost dot is "today".
  const recent = lastNDays(records, 14)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  if (recent.length === 0) {
    return (
      <span
        style={{
          fontSize: 9.5,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--dt-warm-400)",
        }}
      >
        —
      </span>
    );
  }

  return (
    <div
      style={{ display: "flex", gap: 3, alignItems: "center" }}
      aria-label={`Last ${recent.length} shifts`}
    >
      {recent.map((r) => (
        <span
          key={`${r.date}-${r.client}`}
          title={`${r.date} · ${DOT_LABEL[r.status]}${r.notes ? ` — ${r.notes}` : ""}`}
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: DOT_COLOR[r.status],
            display: "inline-block",
            border:
              r.status === "excused"
                ? "1px solid var(--dt-warm-300)"
                : "none",
          }}
        />
      ))}
    </div>
  );
}

export default function RosterPage() {
  const [f, setF] = useState<FilterState>(INITIAL);

  const allRows = useMemo(() => {
    return flattenRoster().map((r) => {
      const recs = r.attendance.filter((x) => x.client === r.assignment.client);
      return {
        ...r,
        attendancePct: weightedAttendancePct(recs),
        attendanceTotal: recs.length,
      };
    });
  }, []);

  const rows = useMemo(() => {
    const q = f.search.trim().toLowerCase();
    return allRows.filter((r) => {
      if (q) {
        const hay = `${r.name} ${r.assignment.position} ${r.assignment.department} ${r.assignment.client}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (f.client !== "all" && r.assignment.client !== f.client) return false;
      if (f.position !== "all" && r.assignment.position !== f.position) return false;
      if (f.department !== "all" && r.assignment.department !== f.department) return false;
      if (f.shift !== "all" && r.assignment.shift !== f.shift) return false;
      if (f.band !== "all" && r.band !== f.band) return false;
      return true;
    });
  }, [allRows, f]);

  // Sorted by queue rank: front of line first, no-shows last.
  const sorted = useMemo(
    () => [...rows].sort((a, b) => a.rank - b.rank),
    [rows]
  );

  const totalEmployees = new Set(allRows.map((r) => r.id)).size;
  const filtersActive =
    f.search.trim() !== "" ||
    f.client !== "all" ||
    f.position !== "all" ||
    f.department !== "all" ||
    f.shift !== "all" ||
    f.band !== "all";
  const reset = () => setF(INITIAL);

  // Branch 3 KPI strip — recomputes from filtered set.
  const showingCount = sorted.length;
  const placedCount = sorted.filter(
    (r) => r.status === "active" || r.status === "onboarding"
  ).length;
  const scoreableForAvg = sorted.filter((r) => r.attendanceTotal > 0);
  const avgAttendance = scoreableForAvg.length
    ? Math.round(
        (scoreableForAvg.reduce((s, r) => s + r.attendancePct, 0) /
          scoreableForAvg.length) *
          10
      ) / 10
    : 0;
  const flagged = sorted.filter(
    (r) => r.attendanceTotal > 0 && r.attendancePct < 85
  ).length;

  return (
    <Shell>
      <Topbar
        crumb="WORKSPACE / EMPLOYEES"
        scriptWord="Multi-Client "
        title="Roster"
        actions={
          <>
            <button className="dt-btn">Export CSV</button>
            <Link href="/onboarding" className="dt-btn dt-btn-gold">
              <span>+ Add Employee</span>
            </Link>
          </>
        }
      />

      {/* Filtered KPI strip — recomputes live */}
      <div
        style={{
          display: "flex",
          gap: 14,
          marginBottom: 22,
          flexWrap: "wrap",
        }}
      >
        <Stat
          label="Showing"
          value={String(showingCount)}
          sub={`of ${allRows.length} placements`}
        />
        <Stat
          label="On Assignment"
          value={String(placedCount)}
          sub="active or onboarding"
        />
        <Stat
          label="Avg Attendance"
          value={scoreableForAvg.length ? `${avgAttendance}%` : "—"}
          accent="var(--dt-gold-deep)"
          sub="trailing 30 days"
        />
        <Stat
          label="Attendance Flags"
          value={String(flagged)}
          accent={flagged > 0 ? "var(--dt-warning)" : "var(--dt-black)"}
          sub="below 85%"
        />
      </div>

      {/* Client chips */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 14,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: 10.5,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--dt-warm-500)",
            fontWeight: 400,
            marginRight: 4,
          }}
        >
          Clients
        </span>
        <button
          className={"dt-chip" + (f.client === "all" ? " active" : "")}
          onClick={() => setF((s) => ({ ...s, client: "all" }))}
        >
          All · {allRows.length}
        </button>
        {CLIENTS.map((c) => {
          const n = allRows.filter((r) => r.assignment.client === c.id).length;
          return (
            <button
              key={c.id}
              className={"dt-chip" + (f.client === c.id ? " active" : "")}
              onClick={() => setF((s) => ({ ...s, client: c.id }))}
            >
              {c.name} · {n}
            </button>
          );
        })}
      </div>

      {/* Advanced filters */}
      <div className="dt-card" style={{ padding: "16px 18px", marginBottom: 16 }}>
        <div className="dt-filter-grid">
          <label className="dt-filter dt-filter-search">
            <span className="dt-filter-label">Search</span>
            <input
              className="dt-filter-input"
              type="search"
              placeholder="Name, position, department…"
              value={f.search}
              onChange={(e) => setF((s) => ({ ...s, search: e.target.value }))}
            />
          </label>
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
          <FilterSelect
            label="Score"
            value={f.band}
            onChange={(v) => setF((s) => ({ ...s, band: v }))}
            options={[
              { value: "all", label: "All Scores" },
              { value: "green", label: "Green — top of queue" },
              { value: "yellow", label: "Yellow — watch list" },
              { value: "red", label: "Red — back of queue" },
            ]}
          />
          <button
            type="button"
            className="dt-btn dt-btn-ghost tiny"
            onClick={reset}
            style={{
              alignSelf: "end",
              opacity: filtersActive ? 1 : 0.4,
              pointerEvents: filtersActive ? "auto" : "none",
            }}
          >
            Reset filters
          </button>
        </div>
      </div>

      <div className="dt-card gold-edge">
        <div className="dt-card-head">
          <div>
            <h3>
              {sorted.length === allRows.length
                ? `All ${sorted.length} placements`
                : `Showing ${sorted.length} of ${allRows.length} placements`}
            </h3>
            <div className="sub">
              Ordered by queue rank · greens first, no-shows last
            </div>
          </div>
          <Badge tone="dark">{totalEmployees} unique people</Badge>
        </div>
        <div className="dt-table-wrap">
          <table className="dt-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 22 }}>Employee</th>
                <th>Client</th>
                <th>Position</th>
                <th>Shift</th>
                <th>Score</th>
                <th>Attendance · 30d</th>
                <th>Last 14d</th>
                <th style={{ textAlign: "right", paddingRight: 22 }}>Rate</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const client = CLIENTS.find(
                  (c) => c.id === r.assignment.client
                )!;
                return (
                  <tr key={`${r.id}-${r.assignment.client}-${r.assignment.shift}`}>
                    <td style={{ paddingLeft: 22 }}>
                      <Link
                        href={`/employees/${r.id}`}
                        className="dt-person dt-person-link"
                      >
                        <Avatar name={r.name} />
                        <div>
                          <div className="name">{r.name}</div>
                          <div className="meta">
                            {r.status === "onboarding"
                              ? "ONBOARDING"
                              : `RANK ${r.rank}`}
                            {r.assignments.length > 1 &&
                              ` · ${r.assignments.length} clients`}
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td>
                      <span style={{ fontWeight: 400 }}>{client.name}</span>
                      <div
                        style={{
                          fontSize: 10.5,
                          color: "var(--dt-warm-500)",
                          marginTop: 3,
                          letterSpacing: "0.06em",
                        }}
                      >
                        {client.city}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 300 }}>
                        {r.assignment.position}
                      </span>
                      <div
                        style={{
                          fontSize: 10.5,
                          color: "var(--dt-warm-500)",
                          marginTop: 3,
                        }}
                      >
                        {r.assignment.department}
                      </div>
                    </td>
                    <td>
                      <span
                        className="tab-num"
                        style={{
                          fontSize: 12,
                          color: "var(--dt-warm-700)",
                          fontFamily: "var(--dt-mono)",
                        }}
                      >
                        {r.assignment.shift}
                      </span>
                    </td>
                    <td>
                      <BandPill band={r.band} />
                    </td>
                    <td>
                      {r.attendanceTotal === 0 ? (
                        <span
                          style={{
                            fontSize: 10.5,
                            letterSpacing: "0.16em",
                            textTransform: "uppercase",
                            color: "var(--dt-warm-500)",
                          }}
                        >
                          No history
                        </span>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 130 }}>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                            <span
                              className="tab-num"
                              style={{
                                fontSize: 13,
                                fontWeight: 400,
                                color: attRateColor(r.attendancePct),
                              }}
                            >
                              {r.attendancePct}%
                            </span>
                            {r.noShows > 0 && (
                              <span
                                style={{
                                  fontSize: 9.5,
                                  letterSpacing: "0.16em",
                                  textTransform: "uppercase",
                                  color: "var(--dt-danger)",
                                  fontWeight: 400,
                                }}
                              >
                                {r.noShows} NCNS
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: 10.5,
                              color: "var(--dt-warm-500)",
                              letterSpacing: "0.04em",
                            }}
                          >
                            <span className="tab-num">{r.missedDays}</span> missed ·{" "}
                            <span className="tab-num">{r.attendanceTotal}</span>d
                          </div>
                        </div>
                      )}
                    </td>
                    <td>
                      <LastFourteenDays
                        records={r.attendance.filter(
                          (x) => x.client === r.assignment.client,
                        )}
                      />
                    </td>
                    <td
                      className="tab-num"
                      style={{
                        textAlign: "right",
                        paddingRight: 22,
                        fontWeight: 400,
                      }}
                    >
                      ${r.assignment.rate.toFixed(2)}/hr
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
                      fontSize: 13,
                    }}
                  >
                    No placements match these filters.{" "}
                    <button
                      type="button"
                      onClick={reset}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--dt-gold-deep)",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        fontSize: "inherit",
                        padding: 0,
                        marginLeft: 4,
                      }}
                    >
                      Reset →
                    </button>
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
