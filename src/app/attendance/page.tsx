"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { PerformanceBadge } from "@/components/PerformanceBadge";
import {
  CLIENTS,
  EMPLOYEES,
  POSITIONS,
  type Client,
  type Position,
} from "@/lib/employees";
import {
  seedAttendance,
  statusLabel,
  summarize,
  summarizeFor,
  type AttendanceRecord,
  type AttendanceStatus,
} from "@/lib/attendance";

type GroupBy = "client" | "position";

const STATUS_TONE: Record<
  AttendanceStatus,
  { color: string; bg: string; border: string }
> = {
  present: {
    color: "var(--dt-success)",
    bg: "var(--dt-success-bg)",
    border: "#BFD3A6",
  },
  late: {
    color: "var(--dt-warning)",
    bg: "var(--dt-warning-bg)",
    border: "#E6C887",
  },
  excused: {
    color: "rgba(26,26,26,0.65)",
    bg: "var(--dt-warm-100)",
    border: "var(--dt-warm-200)",
  },
  missed: {
    color: "var(--dt-danger)",
    bg: "var(--dt-danger-bg)",
    border: "#D9A6A6",
  },
};

function StatusPill({ s }: { s: AttendanceStatus }) {
  const t = STATUS_TONE[s];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        fontSize: 9.5,
        fontWeight: 400,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: t.color,
        background: t.bg,
        border: `1px solid ${t.border}`,
        paddingLeft: "calc(10px + 0.18em)",
      }}
    >
      {statusLabel(s)}
    </span>
  );
}

function StatBlock({
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
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
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
        {sub && <div style={{ fontSize: 11.5, color: "var(--dt-warm-500)" }}>{sub}</div>}
      </div>
    </div>
  );
}

export default function AttendancePage() {
  const [records, setRecords] = useState<AttendanceRecord[]>(() => seedAttendance());
  const [selectedId, setSelectedId] = useState<string>(EMPLOYEES[0].id);
  const [groupBy, setGroupBy] = useState<GroupBy>("client");
  const [logDate, setLogDate] = useState<string>(() =>
    new Date("2026-05-02").toISOString().slice(0, 10)
  );
  const [logStatus, setLogStatus] = useState<AttendanceStatus>("missed");
  const [logNotes, setLogNotes] = useState<string>("");

  const selected = useMemo(
    () => EMPLOYEES.find((e) => e.id === selectedId) ?? EMPLOYEES[0],
    [selectedId]
  );

  const overall = useMemo(() => summarize(records), [records]);
  const selectedSummary = useMemo(
    () => summarizeFor(records, selected.id),
    [records, selected.id]
  );
  const selectedHistory = useMemo(
    () =>
      records
        .filter((r) => r.employeeId === selected.id)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 14),
    [records, selected.id]
  );

  const groups = useMemo(() => {
    if (groupBy === "client") {
      return CLIENTS.map((c) => ({
        key: c as string,
        employees: EMPLOYEES.filter((e) => e.client === (c as Client)),
      }));
    }
    return POSITIONS.map((p) => ({
      key: p as string,
      employees: EMPLOYEES.filter((e) => e.position === (p as Position)),
    }));
  }, [groupBy]);

  const logEntry = () => {
    if (!logDate) return;
    setRecords((prev) => {
      const filtered = prev.filter(
        (r) => !(r.employeeId === selected.id && r.date === logDate)
      );
      return [
        ...filtered,
        {
          employeeId: selected.id,
          date: logDate,
          status: logStatus,
          notes: logNotes.trim() || undefined,
        },
      ];
    });
    setLogNotes("");
  };

  return (
    <Shell>
      <Topbar
        crumb="WORKSPACE / ATTENDANCE"
        scriptWord="Daily "
        title="Attendance"
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

      <div style={{ display: "flex", gap: 14, marginBottom: 22, flexWrap: "wrap" }}>
        <StatBlock
          label="Attendance Rate"
          value={`${(overall.attendanceRate * 100).toFixed(1)}%`}
          accent="var(--dt-success)"
          sub="last 30 days"
        />
        <StatBlock
          label="Missed Days"
          value={String(overall.missed)}
          accent="var(--dt-danger)"
          sub="across roster"
        />
        <StatBlock
          label="Late Arrivals"
          value={String(overall.late)}
          accent="var(--dt-warning)"
          sub="last 30 days"
        />
        <StatBlock
          label="Excused"
          value={String(overall.excused)}
          sub="protected leave"
        />
      </div>

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
              <h3>Log Missed Day</h3>
              <div className="sub">Select an employee and record their attendance</div>
            </div>
          </div>
          <div style={{ padding: "20px 26px" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr)",
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
                  onChange={(e) => setSelectedId(e.target.value)}
                  style={{
                    fontFamily: "var(--dt-sans)",
                    fontSize: 12.5,
                    fontWeight: 300,
                    padding: "10px 12px",
                    background: "#FFFFFF",
                    border: "1px solid var(--dt-warm-200)",
                    color: "var(--dt-black)",
                    borderRadius: 0,
                  }}
                >
                  {EMPLOYEES.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} — {e.client}
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
                  Date
                </span>
                <input
                  type="date"
                  value={logDate}
                  onChange={(e) => setLogDate(e.target.value)}
                  style={{
                    fontFamily: "var(--dt-sans)",
                    fontSize: 12.5,
                    fontWeight: 300,
                    padding: "10px 12px",
                    background: "#FFFFFF",
                    border: "1px solid var(--dt-warm-200)",
                    color: "var(--dt-black)",
                    borderRadius: 0,
                  }}
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
                  onChange={(e) => setLogStatus(e.target.value as AttendanceStatus)}
                  style={{
                    fontFamily: "var(--dt-sans)",
                    fontSize: 12.5,
                    fontWeight: 300,
                    padding: "10px 12px",
                    background: "#FFFFFF",
                    border: "1px solid var(--dt-warm-200)",
                    color: "var(--dt-black)",
                    borderRadius: 0,
                  }}
                >
                  <option value="missed">Missed</option>
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
                style={{
                  fontFamily: "var(--dt-sans)",
                  fontSize: 12.5,
                  fontWeight: 300,
                  padding: "10px 12px",
                  background: "#FFFFFF",
                  border: "1px solid var(--dt-warm-200)",
                  color: "var(--dt-black)",
                  borderRadius: 0,
                }}
              />
            </label>
            <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
              <button onClick={logEntry} className="dt-btn dt-btn-primary">
                Save Entry
              </button>
            </div>
          </div>
        </div>

        <div className="dt-card">
          <div className="dt-card-head">
            <div>
              <h3>Selected · {selected.name}</h3>
              <div className="sub">
                {selected.client} · {selected.position} · {selected.shift} shift
              </div>
            </div>
            <PerformanceBadge score={selected.score} missedDays={selectedSummary.missed} />
          </div>
          <div style={{ padding: "18px 26px 22px" }}>
            <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginBottom: 16 }}>
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
                  Attendance Rate
                </div>
                <div
                  className="tab-num"
                  style={{
                    fontFamily: "var(--dt-display)",
                    fontSize: 26,
                    fontWeight: 300,
                    marginTop: 6,
                    color: "var(--dt-success)",
                  }}
                >
                  {(selectedSummary.attendanceRate * 100).toFixed(1)}%
                </div>
              </div>
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
                  Missed
                </div>
                <div
                  className="tab-num"
                  style={{
                    fontFamily: "var(--dt-display)",
                    fontSize: 26,
                    fontWeight: 300,
                    marginTop: 6,
                    color: "var(--dt-danger)",
                  }}
                >
                  {selectedSummary.missed}
                </div>
              </div>
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
                  Late
                </div>
                <div
                  className="tab-num"
                  style={{
                    fontFamily: "var(--dt-display)",
                    fontSize: 26,
                    fontWeight: 300,
                    marginTop: 6,
                    color: "var(--dt-warning)",
                  }}
                >
                  {selectedSummary.late}
                </div>
              </div>
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
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {selectedHistory.map((r) => (
                <div
                  key={r.date}
                  title={`${r.date} · ${statusLabel(r.status)}${r.notes ? " · " + r.notes : ""}`}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <div
                    style={{
                      fontSize: 9,
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      color: "var(--dt-warm-500)",
                      fontWeight: 300,
                    }}
                  >
                    {r.date.slice(5)}
                  </div>
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      background: STATUS_TONE[r.status].bg,
                      border: `1px solid ${STATUS_TONE[r.status].border}`,
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="dt-card gold-edge">
        <div className="dt-card-head">
          <div>
            <h3>Attendance Reports</h3>
            <div className="sub">Group by client or position · 30-day window</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setGroupBy("client")}
              className={"dt-btn tiny" + (groupBy === "client" ? " dt-btn-primary" : "")}
            >
              By Client
            </button>
            <button
              onClick={() => setGroupBy("position")}
              className={"dt-btn tiny" + (groupBy === "position" ? " dt-btn-primary" : "")}
            >
              By Position
            </button>
          </div>
        </div>
        <div style={{ padding: "0" }}>
          {groups.map((g, idx) => {
            const groupRecords = records.filter((r) =>
              g.employees.some((e) => e.id === r.employeeId)
            );
            const summary = summarize(groupRecords);
            return (
              <div
                key={g.key}
                style={{
                  borderBottom:
                    idx < groups.length - 1 ? "1px solid var(--dt-warm-100)" : "none",
                }}
              >
                <div
                  style={{
                    padding: "20px 26px 14px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-end",
                    flexWrap: "wrap",
                    gap: 12,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontFamily: "var(--dt-display)",
                        fontSize: 18,
                        fontWeight: 300,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                      }}
                    >
                      {g.key}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        letterSpacing: "0.2em",
                        textTransform: "uppercase",
                        color: "var(--dt-warm-500)",
                        fontWeight: 300,
                        marginTop: 4,
                        paddingLeft: "0.2em",
                      }}
                    >
                      {g.employees.length} employees
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                    <Badge tone="green">
                      {(summary.attendanceRate * 100).toFixed(1)}% on-time
                    </Badge>
                    <Badge tone="red">{summary.missed} missed</Badge>
                    <Badge tone="amber">{summary.late} late</Badge>
                    <Badge tone="warm">{summary.excused} excused</Badge>
                  </div>
                </div>
                <div className="dt-table-wrap">
                  <table className="dt-table">
                    <thead>
                      <tr>
                        <th style={{ paddingLeft: 26 }}>Employee</th>
                        <th>Client</th>
                        <th>Position</th>
                        <th>Shift</th>
                        <th style={{ textAlign: "right" }}>Missed</th>
                        <th style={{ textAlign: "right" }}>Late</th>
                        <th style={{ textAlign: "right" }}>Rate</th>
                        <th style={{ textAlign: "right", paddingRight: 26 }}>Performance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.employees.map((e) => {
                        const s = summarizeFor(records, e.id);
                        return (
                          <tr key={e.id}>
                            <td style={{ paddingLeft: 26 }}>
                              <div className="dt-person">
                                <Avatar name={e.name} />
                                <div>
                                  <div className="name">{e.name}</div>
                                  <div className="meta">{e.id}</div>
                                </div>
                              </div>
                            </td>
                            <td>{e.client}</td>
                            <td>{e.position}</td>
                            <td className="muted">{e.shift}</td>
                            <td className="tab-num" style={{ textAlign: "right" }}>
                              {s.missed}
                            </td>
                            <td className="tab-num" style={{ textAlign: "right" }}>
                              {s.late}
                            </td>
                            <td className="tab-num" style={{ textAlign: "right" }}>
                              {(s.attendanceRate * 100).toFixed(0)}%
                            </td>
                            <td style={{ textAlign: "right", paddingRight: 26 }}>
                              <PerformanceBadge score={e.score} missedDays={s.missed} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 22 }} className="dt-card">
        <div className="dt-card-head">
          <div>
            <h3>Recent Activity · {selected.name}</h3>
            <div className="sub">Detailed log with notes</div>
          </div>
          <Badge tone="dark">{selectedHistory.length} entries</Badge>
        </div>
        <div className="dt-table-wrap">
          <table className="dt-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 22 }}>Date</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {selectedHistory.map((r) => (
                <tr key={r.date}>
                  <td className="tab-num" style={{ paddingLeft: 22 }}>
                    {r.date}
                  </td>
                  <td>
                    <StatusPill s={r.status} />
                  </td>
                  <td className="muted">{r.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
