"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { PerformanceBadge } from "@/components/PerformanceBadge";
import {
  CLIENTS,
  POSITIONS,
  DEPARTMENTS,
  SHIFTS,
  EMPLOYEES,
  getClient,
  weightedAttendancePct,
  countAttendance,
  lastNDays,
  statusLabel,
  type ClientId,
  type Position,
  type Department,
  type Shift,
  type AttendanceEntry,
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
  attendanceRate: number;
  lastIncident?: AttendanceEntry;
};

function buildRows(
  log: Record<string, AttendanceEntry[]>,
): AttendanceRow[] {
  const rows: AttendanceRow[] = [];
  for (const e of EMPLOYEES) {
    const extras = log[e.id] ?? [];
    // Build by-date map so manually-logged entries override historical ones
    // for the same (employee, date) pair.
    const byDate = new Map<string, AttendanceEntry>();
    for (const a of e.attendance) byDate.set(a.date, a);
    for (const a of extras) byDate.set(a.date, a);
    const merged = Array.from(byDate.values());
    for (const a of e.assignments) {
      const recs = merged.filter((x) => x.client === a.client);
      const c = countAttendance(recs);
      const incidents = recs
        .filter((x) => x.status !== "present")
        .sort((x, y) => (x.date < y.date ? 1 : -1));
      rows.push({
        employeeId: e.id,
        name: e.name,
        client: a.client,
        position: a.position,
        department: a.department,
        shift: a.shift,
        rate: a.rate,
        missed: c.missed + c.noShow,
        noShows: c.noShow,
        late: c.late,
        present: c.present,
        total: c.total,
        attendanceRate: weightedAttendancePct(recs),
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

const STATUS_TONE: Record<
  AttendanceEntry["status"],
  { color: string; bg: string; border: string }
> = {
  present: { color: "var(--dt-success)", bg: "var(--dt-success-bg)", border: "#BFD3A6" },
  late: { color: "var(--dt-warning)", bg: "var(--dt-warning-bg)", border: "#E6C887" },
  excused: { color: "rgba(26,26,26,0.65)", bg: "var(--dt-warm-100)", border: "var(--dt-warm-200)" },
  missed: { color: "var(--dt-danger)", bg: "var(--dt-danger-bg)", border: "#D9A6A6" },
  "no-show": { color: "var(--dt-danger)", bg: "var(--dt-danger-bg)", border: "#D9A6A6" },
};

export default function AttendancePage() {
  const [f, setF] = useState<Filter>(INITIAL);
  const [logged, setLogged] = useState<Record<string, AttendanceEntry[]>>({});
  const [selectedId, setSelectedId] = useState<string>(EMPLOYEES[0].id);
  const [logDate, setLogDate] = useState<string>("2026-05-02");
  const [logStatus, setLogStatus] =
    useState<AttendanceEntry["status"]>("missed");
  const [logClient, setLogClient] = useState<ClientId>(
    EMPLOYEES[0].assignments[0].client,
  );
  const [logNotes, setLogNotes] = useState<string>("");

  const selected = useMemo(
    () => EMPLOYEES.find((e) => e.id === selectedId) ?? EMPLOYEES[0],
    [selectedId],
  );

  const allRows = useMemo(() => buildRows(logged), [logged]);

  const rows = useMemo(() => {
    return allRows.filter((r) => {
      if (f.client !== "all" && r.client !== f.client) return false;
      if (f.position !== "all" && r.position !== f.position) return false;
      if (f.department !== "all" && r.department !== f.department) return false;
      if (f.shift !== "all" && r.shift !== f.shift) return false;
      return true;
    });
  }, [allRows, f]);

  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          b.noShows - a.noShows ||
          b.missed - a.missed ||
          a.name.localeCompare(b.name),
      ),
    [rows],
  );

  const totalMissed = sorted.reduce((s, r) => s + r.missed, 0);
  const totalNoShows = sorted.reduce((s, r) => s + r.noShows, 0);
  const scoreableForAvg = sorted.filter((r) => r.total > 0);
  const avgRate = scoreableForAvg.length
    ? Math.round(
        scoreableForAvg.reduce((s, r) => s + r.attendanceRate, 0) /
          scoreableForAvg.length,
      )
    : 0;

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

  // Selected employee's merged history (real + logged)
  const selectedAll = useMemo(() => {
    const extras = logged[selected.id] ?? [];
    const byDate = new Map<string, AttendanceEntry>();
    for (const a of selected.attendance) byDate.set(a.date, a);
    for (const a of extras) byDate.set(a.date, a);
    return Array.from(byDate.values());
  }, [selected, logged]);

  const selectedCounts = useMemo(
    () => countAttendance(selectedAll),
    [selectedAll],
  );
  const selectedPct = useMemo(
    () => weightedAttendancePct(selectedAll),
    [selectedAll],
  );
  const selectedHistory = useMemo(
    () => lastNDays(selectedAll, 14).reverse(),
    [selectedAll],
  );

  const filtersActive =
    f.client !== "all" ||
    f.position !== "all" ||
    f.department !== "all" ||
    f.shift !== "all";

  const logEntry = () => {
    if (!logDate) return;
    setLogged((prev) => {
      const list = (prev[selected.id] ?? []).filter(
        (r) => !(r.date === logDate && r.client === logClient),
      );
      list.push({
        date: logDate,
        client: logClient,
        status: logStatus,
        notes: logNotes.trim() || undefined,
      });
      return { ...prev, [selected.id]: list };
    });
    setLogNotes("");
  };

  // Keep client choice valid when switching employees
  const ensureValidClient = (empId: string) => {
    setSelectedId(empId);
    const next = EMPLOYEES.find((e) => e.id === empId);
    if (next && !next.assignments.some((a) => a.client === logClient)) {
      setLogClient(next.assignments[0].client);
    }
  };

  return (
    <Shell>
      <Topbar
        crumb="PEOPLE OPS / ATTENDANCE"
        scriptWord="Attendance "
        title="Reports"
        actions={
          <>
            <Link href="/roster" className="dt-btn">
              Back to Roster
            </Link>
            <button className="dt-btn dt-btn-gold">
              <span>Export Report</span>
            </button>
          </>
        }
      />

      {/* Log entry + selected snapshot */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)",
          gap: 22,
          marginBottom: 22,
        }}
        className="dt-overview-grid"
      >
        <div className="dt-card gold-edge">
          <div className="dt-card-head">
            <div>
              <h3>Log a Missed Day</h3>
              <div className="sub">
                Records an attendance event for one employee at one client site
              </div>
            </div>
          </div>
          <div style={{ padding: "20px 26px 22px" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
                gap: 14,
                marginBottom: 14,
              }}
            >
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span
                  style={{
                    fontSize: 9,
                    letterSpacing: "0.32em",
                    textTransform: "uppercase",
                    color: "rgba(26,26,26,0.5)",
                    fontWeight: 400,
                    paddingLeft: "0.32em",
                  }}
                >
                  Employee
                </span>
                <select
                  value={selectedId}
                  onChange={(e) => ensureValidClient(e.target.value)}
                  className="dt-filter-input"
                >
                  {EMPLOYEES.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} — {e.assignments.map((a) => getClient(a.client).name).join(" + ")}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span
                  style={{
                    fontSize: 9,
                    letterSpacing: "0.32em",
                    textTransform: "uppercase",
                    color: "rgba(26,26,26,0.5)",
                    fontWeight: 400,
                    paddingLeft: "0.32em",
                  }}
                >
                  Client Site
                </span>
                <select
                  value={logClient}
                  onChange={(e) => setLogClient(e.target.value as ClientId)}
                  className="dt-filter-input"
                >
                  {selected.assignments.map((a) => (
                    <option key={a.client} value={a.client}>
                      {getClient(a.client).name} · {a.shift}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                gap: 14,
                marginBottom: 14,
              }}
            >
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span
                  style={{
                    fontSize: 9,
                    letterSpacing: "0.32em",
                    textTransform: "uppercase",
                    color: "rgba(26,26,26,0.5)",
                    fontWeight: 400,
                    paddingLeft: "0.32em",
                  }}
                >
                  Date
                </span>
                <input
                  type="date"
                  value={logDate}
                  onChange={(e) => setLogDate(e.target.value)}
                  className="dt-filter-input"
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span
                  style={{
                    fontSize: 9,
                    letterSpacing: "0.32em",
                    textTransform: "uppercase",
                    color: "rgba(26,26,26,0.5)",
                    fontWeight: 400,
                    paddingLeft: "0.32em",
                  }}
                >
                  Status
                </span>
                <select
                  value={logStatus}
                  onChange={(e) =>
                    setLogStatus(e.target.value as AttendanceEntry["status"])
                  }
                  className="dt-filter-input"
                >
                  <option value="missed">Missed</option>
                  <option value="no-show">No-Show (NCNS)</option>
                  <option value="late">Late</option>
                  <option value="excused">Excused</option>
                  <option value="present">Present</option>
                </select>
              </label>
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span
                style={{
                  fontSize: 9,
                  letterSpacing: "0.32em",
                  textTransform: "uppercase",
                  color: "rgba(26,26,26,0.5)",
                  fontWeight: 400,
                  paddingLeft: "0.32em",
                }}
              >
                Notes (optional)
              </span>
              <input
                type="text"
                value={logNotes}
                onChange={(e) => setLogNotes(e.target.value)}
                placeholder="e.g. called out sick, doctor's note received"
                className="dt-filter-input"
              />
            </label>
            <div
              style={{
                display: "flex",
                gap: 10,
                marginTop: 16,
                justifyContent: "flex-end",
              }}
            >
              <button onClick={logEntry} className="dt-btn dt-btn-gold">
                <span>Save Entry</span>
              </button>
            </div>
          </div>
        </div>

        <div className="dt-card">
          <div className="dt-card-head">
            <div>
              <h3>{selected.name}</h3>
              <div className="sub">
                {selected.assignments
                  .map(
                    (a) =>
                      `${getClient(a.client).name} · ${a.position} · ${a.shift}`,
                  )
                  .join(" + ")}
              </div>
            </div>
            <PerformanceBadge
              score={selected.score}
              missedDays={selectedCounts.missed + selectedCounts.noShow}
            />
          </div>
          <div style={{ padding: "18px 26px 22px" }}>
            <div
              style={{
                display: "flex",
                gap: 22,
                flexWrap: "wrap",
                marginBottom: 16,
              }}
            >
              <SnapshotStat
                label="30d Rate"
                value={selectedAll.length === 0 ? "—" : `${selectedPct}%`}
                accent="var(--dt-success)"
              />
              <SnapshotStat
                label="Missed"
                value={String(
                  selectedCounts.missed + selectedCounts.noShow,
                )}
                accent="var(--dt-danger)"
              />
              <SnapshotStat
                label="Late"
                value={String(selectedCounts.late)}
                accent="var(--dt-warning)"
              />
              <SnapshotStat
                label="Excused"
                value={String(selectedCounts.excused)}
              />
            </div>
            <div
              style={{
                fontSize: 9.5,
                letterSpacing: "0.28em",
                textTransform: "uppercase",
                color: "var(--dt-warm-500)",
                fontWeight: 400,
                paddingLeft: "0.28em",
                marginBottom: 8,
              }}
            >
              Last 14 Days
            </div>
            {selectedHistory.length === 0 ? (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--dt-warm-500)",
                  fontStyle: "italic",
                  padding: "8px 0",
                }}
              >
                No history yet — employee is{" "}
                {selected.status === "onboarding"
                  ? "still onboarding."
                  : "newly placed."}
              </div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {selectedHistory.map((r) => {
                  const t = STATUS_TONE[r.status];
                  return (
                    <div
                      key={`${r.date}-${r.client}`}
                      title={`${r.date} · ${getClient(r.client).name} · ${statusLabel(r.status)}${r.notes ? " · " + r.notes : ""}`}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 3,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 8.5,
                          color: "var(--dt-warm-500)",
                          letterSpacing: "0.12em",
                        }}
                      >
                        {new Date(r.date)
                          .toLocaleDateString("en-US", {
                            month: "numeric",
                            day: "numeric",
                          })
                          .replace("/", "·")}
                      </div>
                      <div
                        style={{
                          width: 22,
                          height: 22,
                          background: t.bg,
                          color: t.color,
                          border: `1px solid ${t.border}`,
                          display: "grid",
                          placeItems: "center",
                          fontSize: 10,
                          fontWeight: 400,
                        }}
                      >
                        {r.status === "present"
                          ? "✓"
                          : r.status === "late"
                          ? "L"
                          : r.status === "excused"
                          ? "E"
                          : r.status === "no-show"
                          ? "✗"
                          : "M"}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

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
            style={{
              alignSelf: "end",
              opacity: filtersActive ? 1 : 0.4,
              pointerEvents: filtersActive ? "auto" : "none",
            }}
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
            30-day window · {sorted.length} placements
          </div>
        </div>
        <ReportStat
          label="Total Missed"
          value={String(totalMissed)}
          accent={
            totalMissed > 15
              ? "var(--dt-danger)"
              : totalMissed > 5
              ? "var(--dt-warning)"
              : "var(--dt-success)"
          }
          sub="days across filter"
        />
        <ReportStat
          label="No Call / No Show"
          value={String(totalNoShows)}
          accent={totalNoShows > 0 ? "var(--dt-danger)" : "var(--dt-success)"}
          sub={totalNoShows === 1 ? "incident" : "incidents"}
        />
        <ReportStat
          label="Show Rate"
          value={scoreableForAvg.length ? `${avgRate}%` : "—"}
          accent={
            avgRate >= 90
              ? "var(--dt-success)"
              : avgRate >= 75
              ? "var(--dt-warning)"
              : "var(--dt-danger)"
          }
          sub="weighted, last 30d"
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
                          r.missed >= 5
                            ? "var(--dt-danger)"
                            : r.missed >= 2
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
                              { month: "short", day: "numeric" },
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
                    }}
                  >
                    No rows match these filters.{" "}
                    <button
                      type="button"
                      onClick={() => setF(INITIAL)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--dt-gold-deep)",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        fontSize: "inherit",
                        padding: 0,
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

function SnapshotStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 9.5,
          letterSpacing: "0.28em",
          textTransform: "uppercase",
          color: "var(--dt-warm-500)",
          fontWeight: 400,
          paddingLeft: "0.28em",
        }}
      >
        {label}
      </div>
      <div
        className="tab-num"
        style={{
          fontFamily: "var(--dt-display)",
          fontSize: 26,
          fontWeight: 300,
          marginTop: 6,
          color: accent || "var(--dt-black)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ReportStat({
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
