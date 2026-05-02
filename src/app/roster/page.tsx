"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge, ScoreBadge, type BadgeTone } from "@/components/Badge";
import { PerformanceBadge } from "@/components/PerformanceBadge";
import {
  CLIENTS,
  DEPARTMENTS,
  EMPLOYEES,
  POSITIONS,
  SHIFTS,
  type Client,
  type Department,
  type EmployeeStatus,
  type Position,
  type Shift,
} from "@/lib/employees";
import { seedAttendance, summarizeFor } from "@/lib/attendance";

function StatusBadge({ status }: { status: EmployeeStatus }) {
  const map: Record<EmployeeStatus, { tone: BadgeTone; label: string }> = {
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

const ANY = "__any__";

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minWidth: 160,
        flex: 1,
      }}
    >
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
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          fontFamily: "var(--dt-sans)",
          fontSize: 12.5,
          fontWeight: 300,
          padding: "10px 12px",
          background: "#FFFFFF",
          border: "1px solid var(--dt-warm-200)",
          color: "var(--dt-black)",
          borderRadius: 0,
          letterSpacing: "0.04em",
          appearance: "none",
          cursor: "pointer",
        }}
      >
        <option value={ANY}>All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function RosterPage() {
  const [search, setSearch] = useState("");
  const [client, setClient] = useState<string>(ANY);
  const [position, setPosition] = useState<string>(ANY);
  const [department, setDepartment] = useState<string>(ANY);
  const [shift, setShift] = useState<string>(ANY);

  const attendance = useMemo(() => seedAttendance(), []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return EMPLOYEES.filter((e) => {
      if (q && !e.name.toLowerCase().includes(q) && !e.id.toLowerCase().includes(q))
        return false;
      if (client !== ANY && e.client !== (client as Client)) return false;
      if (position !== ANY && e.position !== (position as Position)) return false;
      if (department !== ANY && e.department !== (department as Department)) return false;
      if (shift !== ANY && e.shift !== (shift as Shift)) return false;
      return true;
    });
  }, [search, client, position, department, shift]);

  const activeFilters: { label: string; clear: () => void }[] = [];
  if (search) activeFilters.push({ label: `Name: "${search}"`, clear: () => setSearch("") });
  if (client !== ANY)
    activeFilters.push({ label: `Client: ${client}`, clear: () => setClient(ANY) });
  if (position !== ANY)
    activeFilters.push({ label: `Position: ${position}`, clear: () => setPosition(ANY) });
  if (department !== ANY)
    activeFilters.push({
      label: `Department: ${department}`,
      clear: () => setDepartment(ANY),
    });
  if (shift !== ANY)
    activeFilters.push({ label: `Shift: ${shift}`, clear: () => setShift(ANY) });

  const total = EMPLOYEES.length;
  const activeCount = filtered.filter((e) => e.status === "active").length;
  const avgScore = filtered.length
    ? (filtered.reduce((a, b) => a + b.score, 0) / filtered.length).toFixed(1)
    : "—";
  const onboardingCount = filtered.filter((e) => e.status === "pending").length;

  const clearAll = () => {
    setSearch("");
    setClient(ANY);
    setPosition(ANY);
    setDepartment(ANY);
    setShift(ANY);
  };

  return (
    <Shell>
      <Topbar
        crumb="WORKSPACE / PEOPLE"
        scriptWord="Our "
        title="Employee Roster"
        actions={
          <>
            <Link href="/attendance" className="dt-btn">
              Attendance
            </Link>
            <Link href="/onboarding" className="dt-btn">
              Onboarding
            </Link>
            <button className="dt-btn dt-btn-gold">
              <span>+ Add Employee</span>
            </button>
          </>
        }
      />

      <div style={{ display: "flex", gap: 14, marginBottom: 22, flexWrap: "wrap" }}>
        <Stat label="Showing" value={String(filtered.length)} sub={`of ${total} total`} />
        <Stat label="Active" value={String(activeCount)} sub="on assignment" />
        <Stat
          label="Avg Score"
          value={avgScore}
          accent="var(--dt-gold-deep)"
          sub="performance"
        />
        <Stat
          label="Onboarding"
          value={String(onboardingCount)}
          accent="#C28B1E"
          sub="pending"
        />
      </div>

      <div className="dt-card" style={{ padding: "20px 22px", marginBottom: 22 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(200px, 1.4fr) repeat(4, minmax(140px, 1fr))",
            gap: 14,
            alignItems: "end",
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
              Search Name
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or ID…"
              style={{
                fontFamily: "var(--dt-sans)",
                fontSize: 12.5,
                fontWeight: 300,
                padding: "10px 12px",
                background: "#FFFFFF",
                border: "1px solid var(--dt-warm-200)",
                color: "var(--dt-black)",
                borderRadius: 0,
                letterSpacing: "0.04em",
              }}
            />
          </label>
          <FilterSelect
            label="Client Company"
            value={client}
            options={CLIENTS}
            onChange={setClient}
          />
          <FilterSelect
            label="Position"
            value={position}
            options={POSITIONS}
            onChange={setPosition}
          />
          <FilterSelect
            label="Department"
            value={department}
            options={DEPARTMENTS}
            onChange={setDepartment}
          />
          <FilterSelect label="Shift" value={shift} options={SHIFTS} onChange={setShift} />
        </div>

        {activeFilters.length > 0 && (
          <div
            style={{
              marginTop: 16,
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: 9.5,
                letterSpacing: "0.28em",
                textTransform: "uppercase",
                color: "var(--dt-warm-500)",
                fontWeight: 400,
                paddingLeft: "0.28em",
              }}
            >
              Active Filters
            </span>
            {activeFilters.map((f) => (
              <button
                key={f.label}
                onClick={f.clear}
                className="dt-badge gold"
                style={{ cursor: "pointer", border: "1px solid var(--dt-gold)" }}
              >
                <span className="dot" />
                {f.label} ×
              </button>
            ))}
            <button
              onClick={clearAll}
              className="dt-btn dt-btn-ghost tiny"
              style={{ marginLeft: "auto" }}
            >
              Clear All
            </button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--dt-warm-500)",
            fontWeight: 400,
            marginRight: 4,
          }}
        >
          Quick Filter
        </span>
        <Badge tone="dark">All · {total}</Badge>
        {CLIENTS.map((c) => {
          const count = EMPLOYEES.filter((e) => e.client === c).length;
          const isActive = client === c;
          return (
            <button
              key={c}
              onClick={() => setClient(isActive ? ANY : c)}
              className={"dt-badge " + (isActive ? "gold" : "warm")}
              style={{ cursor: "pointer" }}
            >
              <span className="dot" />
              {c} · {count}
            </button>
          );
        })}
      </div>

      <div className="dt-card gold-edge">
        <div className="dt-card-head">
          <div>
            <h3>
              Showing {filtered.length} of {total} employees
            </h3>
            <div className="sub">Sorted by performance score · Multi-client view</div>
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
                <th style={{ paddingLeft: 22 }}>Employee</th>
                <th>Client</th>
                <th>Position</th>
                <th>Shift</th>
                <th>Score</th>
                <th>Performance</th>
                <th>Status</th>
                <th style={{ textAlign: "right", paddingRight: 22 }}>Bill Rate</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: "40px 20px", color: "var(--dt-warm-500)" }}>
                    No employees match your filters.
                  </td>
                </tr>
              )}
              {filtered
                .slice()
                .sort((a, b) => b.score - a.score)
                .map((p) => {
                  const summary = summarizeFor(attendance, p.id);
                  return (
                    <tr key={p.id}>
                      <td style={{ paddingLeft: 22 }}>
                        <div className="dt-person">
                          <Avatar name={p.name} />
                          <div>
                            <div className="name">{p.name}</div>
                            <div className="meta">
                              {p.id} · {p.department}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span style={{ fontWeight: 400 }}>{p.client}</span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 300 }}>{p.position}</span>
                      </td>
                      <td>
                        <span className="muted" style={{ fontSize: 12.5 }}>
                          {p.shift}
                        </span>
                      </td>
                      <td>
                        <ScoreBadge score={p.score} />
                      </td>
                      <td>
                        <PerformanceBadge score={p.score} missedDays={summary.missed} />
                      </td>
                      <td>
                        <StatusBadge status={p.status} />
                      </td>
                      <td
                        className="tab-num"
                        style={{ textAlign: "right", paddingRight: 22, fontWeight: 400 }}
                      >
                        {p.rate}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
