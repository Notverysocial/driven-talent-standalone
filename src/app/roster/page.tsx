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
  type ClientId,
  type Position,
  type Department,
  type Shift,
  type ScoreBand,
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

export default function RosterPage() {
  const [f, setF] = useState<FilterState>(INITIAL);

  const allRows = useMemo(() => flattenRoster(), []);

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
  const greenCount = allRows.filter((r) => r.band === "green").length;
  const yellowCount = allRows.filter((r) => r.band === "yellow").length;
  const redCount = allRows.filter((r) => r.band === "red").length;
  const onboardingCount = allRows.filter((r) => r.status === "onboarding").length;

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

      <div
        style={{
          display: "flex",
          gap: 14,
          marginBottom: 22,
          flexWrap: "wrap",
        }}
      >
        <Stat
          label="Active Employees"
          value={String(totalEmployees)}
          sub={`${allRows.length} placements`}
        />
        <Stat
          label="Green"
          value={String(greenCount)}
          accent="var(--dt-success)"
          sub="front of queue"
        />
        <Stat
          label="Yellow"
          value={String(yellowCount)}
          accent="var(--dt-warning)"
          sub="watch list"
        />
        <Stat
          label="Red"
          value={String(redCount)}
          accent="var(--dt-danger)"
          sub="back of queue"
        />
        <Stat
          label="Onboarding"
          value={String(onboardingCount)}
          accent="var(--dt-gold-deep)"
          sub="this month"
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
            onClick={() => setF(INITIAL)}
            style={{ alignSelf: "end" }}
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
                <th>Department</th>
                <th>Shift</th>
                <th>Score</th>
                <th>Missed</th>
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
                    </td>
                    <td>
                      <span style={{ color: "var(--dt-warm-700)" }}>
                        {r.assignment.department}
                      </span>
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
                      <span
                        className="tab-num"
                        style={{
                          fontWeight: 400,
                          color:
                            r.missedDays >= 3
                              ? "var(--dt-danger)"
                              : r.missedDays >= 1
                              ? "var(--dt-warning)"
                              : "var(--dt-warm-500)",
                        }}
                      >
                        {r.missedDays}d
                      </span>
                      {r.noShows > 0 && (
                        <span
                          style={{
                            fontSize: 9.5,
                            letterSpacing: "0.16em",
                            textTransform: "uppercase",
                            color: "var(--dt-danger)",
                            marginLeft: 8,
                            fontWeight: 400,
                          }}
                        >
                          {r.noShows} NO-SHOW
                        </span>
                      )}
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
                      fontStyle: "italic",
                    }}
                  >
                    No placements match these filters.
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
