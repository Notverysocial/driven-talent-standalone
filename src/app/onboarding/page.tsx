"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import {
  EMPLOYEES,
  STANDARD_CHECKLIST,
  STANDARD_CHECKLIST_BY_CATEGORY,
  STANDARD_PROGRESS,
  getClient,
  type OnboardingCategory,
} from "@/lib/data";

const CATEGORY_TONE: Record<
  OnboardingCategory,
  "gold" | "amber" | "green" | "warm" | "dark"
> = {
  Compliance: "amber",
  Documentation: "warm",
  Training: "gold",
  Equipment: "warm",
  Review: "dark",
};

const CATEGORY_ORDER: OnboardingCategory[] = [
  "Compliance",
  "Documentation",
  "Training",
  "Equipment",
  "Review",
];

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

export default function OnboardingPage() {
  // Onboarding employees + recently-hired actives still finishing their checklist.
  // Cutoff: anyone hired after 2026-01-01 still has steps to verify (per ops playbook).
  const tracked = useMemo(() => {
    const cutoff = new Date("2026-01-01").getTime();
    return EMPLOYEES.filter(
      (e) =>
        e.status === "onboarding" ||
        new Date(e.hireDate).getTime() > cutoff,
    );
  }, []);

  const initialState = useMemo<Record<string, Set<string>>>(() => {
    const s: Record<string, Set<string>> = {};
    for (const emp of EMPLOYEES) {
      // Active employees with hireDate < 2026 are presumed fully checked off.
      if (
        emp.status === "active" &&
        new Date(emp.hireDate).getTime() <= new Date("2026-01-01").getTime()
      ) {
        s[emp.id] = new Set(STANDARD_CHECKLIST.map((i) => i.id));
        continue;
      }
      s[emp.id] = new Set(STANDARD_PROGRESS[emp.id] ?? []);
    }
    return s;
  }, []);

  const [state, setState] = useState<Record<string, Set<string>>>(initialState);
  const [selectedId, setSelectedId] = useState<string>(
    tracked[0]?.id ?? EMPLOYEES[0].id,
  );

  const selected =
    EMPLOYEES.find((e) => e.id === selectedId) ?? EMPLOYEES[0];
  const selectedDone = state[selected.id] ?? new Set<string>();

  const toggle = (item: string) => {
    setState((prev) => {
      const next = { ...prev };
      const set = new Set(next[selected.id] ?? []);
      if (set.has(item)) set.delete(item);
      else set.add(item);
      next[selected.id] = set;
      return next;
    });
  };

  const totalSteps = STANDARD_CHECKLIST.length;

  // Stats limited to the tracked group (those still moving through onboarding).
  const trackedTotal = tracked.length * totalSteps;
  const trackedCompleted = tracked.reduce(
    (a, e) => a + (state[e.id]?.size ?? 0),
    0,
  );
  const overallPct =
    trackedTotal === 0 ? 0 : (trackedCompleted / trackedTotal) * 100;

  const selectedClient = getClient(selected.assignments[0].client);
  const selectedAssignment = selected.assignments[0];

  return (
    <Shell>
      <Topbar
        crumb="PEOPLE OPS / ONBOARDING"
        scriptWord="New Hire "
        title="Workflow"
        actions={
          <>
            <Link href="/roster" className="dt-btn">
              View Active Roster
            </Link>
            <button className="dt-btn dt-btn-gold">
              <span>+ Start Onboarding</span>
            </button>
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
          label="In Onboarding"
          value={String(tracked.length)}
          accent="var(--dt-gold-deep)"
          sub="active hires"
        />
        <Stat
          label="Avg Progress"
          value={`${overallPct.toFixed(0)}%`}
          accent="var(--dt-gold-deep)"
          sub="checklist complete"
        />
        <Stat label="Total Steps" value={String(totalSteps)} sub="per new hire" />
        <Stat
          label="Items Cleared"
          value={String(trackedCompleted)}
          accent="var(--dt-success)"
          sub={`of ${trackedTotal}`}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 0.9fr) minmax(0, 2fr)",
          gap: 22,
        }}
        className="dt-overview-grid"
      >
        {/* Left: queue of new hires */}
        <div className="dt-card">
          <div className="dt-card-head">
            <div>
              <h3>New Hires</h3>
              <div className="sub">Select to view checklist</div>
            </div>
            <Badge tone="dark">{tracked.length}</Badge>
          </div>
          <div style={{ padding: "8px 0" }}>
            {tracked.map((e) => {
              const done = state[e.id]?.size ?? 0;
              const pct = done / totalSteps;
              const tone =
                pct >= 1 ? "green" : pct >= 0.5 ? "gold" : "amber";
              const isSelected = e.id === selectedId;
              const a = e.assignments[0];
              return (
                <button
                  key={e.id}
                  onClick={() => setSelectedId(e.id)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto",
                    gap: 12,
                    alignItems: "center",
                    padding: "14px 22px",
                    width: "100%",
                    textAlign: "left",
                    background: isSelected ? "#FBF6EC" : "transparent",
                    border: "none",
                    borderLeft: isSelected
                      ? "2px solid var(--dt-gold)"
                      : "2px solid transparent",
                    borderBottom: "1px solid var(--dt-warm-100)",
                    cursor: "pointer",
                    fontFamily: "var(--dt-sans)",
                  }}
                >
                  <Avatar name={e.name} />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 400,
                        color: "var(--dt-black)",
                      }}
                    >
                      {e.name}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        letterSpacing: "0.18em",
                        textTransform: "uppercase",
                        color: "var(--dt-warm-500)",
                        marginTop: 4,
                        fontWeight: 300,
                        paddingLeft: "0.18em",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {getClient(a.client).name} · {a.position}
                    </div>
                  </div>
                  <Badge tone={tone}>
                    {done}/{totalSteps}
                  </Badge>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: 15-step categorized checklist */}
        <div className="dt-card gold-edge">
          <div className="dt-card-head">
            <div className="dt-person">
              <Avatar name={selected.name} size="lg" />
              <div>
                <div className="name" style={{ fontSize: 16 }}>
                  {selected.name}
                </div>
                <div className="meta">
                  {selected.id.toUpperCase()} · {selectedClient.name} ·{" "}
                  {selectedAssignment.position} · {selectedAssignment.shift}
                </div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
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
                Progress
              </div>
              <div
                className="tab-num"
                style={{
                  fontFamily: "var(--dt-display)",
                  fontSize: 28,
                  fontWeight: 300,
                  marginTop: 4,
                  color: "var(--dt-gold-deep)",
                }}
              >
                {Math.round((selectedDone.size / totalSteps) * 100)}%
              </div>
            </div>
          </div>

          <div style={{ padding: "0 26px" }}>
            <div
              style={{
                height: 4,
                background: "var(--dt-warm-100)",
                margin: "18px 0 4px",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  width: `${(selectedDone.size / totalSteps) * 100}%`,
                  background: "var(--dt-gold)",
                  transition: "width 0.2s ease",
                }}
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
                marginBottom: 18,
              }}
            >
              {selectedDone.size} of {totalSteps} complete · Hired{" "}
              {selected.hireDate}
              {selected.assignments[0].startDate && (
                <>
                  {" · Starts "}
                  {new Date(selected.assignments[0].startDate).toLocaleDateString(
                    "en-US",
                    { month: "short", day: "numeric" },
                  )}
                </>
              )}
            </div>
          </div>

          <div style={{ padding: "0 26px 8px" }}>
            {CATEGORY_ORDER.map((cat) => {
              const items = STANDARD_CHECKLIST_BY_CATEGORY[cat];
              const catDone = items.filter((i) => selectedDone.has(i.id)).length;
              return (
                <div key={cat} style={{ marginBottom: 22 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginBottom: 10,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--dt-display)",
                        fontSize: 11,
                        fontWeight: 400,
                        letterSpacing: "0.32em",
                        textTransform: "uppercase",
                        color: "var(--dt-black)",
                        paddingLeft: "0.32em",
                      }}
                    >
                      {cat}
                    </span>
                    <Badge tone={CATEGORY_TONE[cat]}>
                      {catDone}/{items.length}
                    </Badge>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {items.map((item) => {
                      const checked = selectedDone.has(item.id);
                      return (
                        <button
                          key={item.id}
                          onClick={() => toggle(item.id)}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "auto 1fr auto",
                            gap: 14,
                            alignItems: "center",
                            padding: "12px 4px",
                            width: "100%",
                            textAlign: "left",
                            background: "transparent",
                            border: "none",
                            borderBottom: "1px solid var(--dt-warm-100)",
                            cursor: "pointer",
                            fontFamily: "var(--dt-sans)",
                          }}
                        >
                          <span
                            aria-hidden
                            style={{
                              width: 18,
                              height: 18,
                              border: `1px solid ${
                                checked ? "var(--dt-gold)" : "var(--dt-warm-200)"
                              }`,
                              background: checked ? "var(--dt-gold)" : "#FFFFFF",
                              display: "grid",
                              placeItems: "center",
                              transition: "all 0.15s",
                            }}
                          >
                            {checked && (
                              <svg
                                width="10"
                                height="10"
                                viewBox="0 0 12 12"
                                fill="none"
                                stroke="#FFFFFF"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M2 6.5l2.5 2.5L10 3.5" />
                              </svg>
                            )}
                          </span>
                          <div>
                            <div
                              style={{
                                fontSize: 13.5,
                                fontWeight: checked ? 300 : 400,
                                color: checked
                                  ? "var(--dt-warm-500)"
                                  : "var(--dt-black)",
                                textDecoration: checked ? "line-through" : "none",
                                letterSpacing: "0.02em",
                              }}
                            >
                              {item.label}
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                color: "var(--dt-warm-500)",
                                marginTop: 4,
                                fontWeight: 300,
                              }}
                            >
                              {item.detail}
                            </div>
                          </div>
                          <span
                            style={{
                              fontSize: 9,
                              letterSpacing: "0.28em",
                              textTransform: "uppercase",
                              color: checked
                                ? "var(--dt-success)"
                                : "var(--dt-warm-500)",
                              fontWeight: 400,
                              paddingLeft: "0.28em",
                            }}
                          >
                            {checked ? "Done" : "Pending"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Documents tray */}
          <div style={{ padding: "0 26px 22px" }}>
            <div
              style={{
                fontSize: 9.5,
                letterSpacing: "0.28em",
                textTransform: "uppercase",
                color: "var(--dt-warm-500)",
                fontWeight: 400,
                paddingLeft: "0.28em",
                marginBottom: 10,
              }}
            >
              Documents on File ·{" "}
              {selected.onboarding.documents.filter((d) => d.received).length}/
              {selected.onboarding.documents.length}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 8,
              }}
            >
              {selected.onboarding.documents.map((d) => (
                <div
                  key={d.name}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 12px",
                    border: "1px solid var(--dt-warm-150)",
                    background: d.received
                      ? "var(--dt-success-bg)"
                      : "var(--dt-warm-50)",
                    fontSize: 11.5,
                    fontWeight: 400,
                  }}
                >
                  <span>{d.name}</span>
                  <span
                    style={{
                      fontSize: 9.5,
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                      color: d.received
                        ? "var(--dt-success)"
                        : "var(--dt-warning)",
                      fontWeight: 400,
                    }}
                  >
                    {d.received ? "✓ On File" : "Pending"}
                  </span>
                </div>
              ))}
            </div>

            {selected.notes && (
              <div
                style={{
                  marginTop: 18,
                  padding: "12px 14px",
                  background: "var(--dt-warm-50)",
                  borderLeft: "2px solid var(--dt-gold)",
                  fontSize: 12,
                  fontStyle: "italic",
                  color: "var(--dt-warm-700)",
                  lineHeight: 1.6,
                }}
              >
                {selected.notes}
              </div>
            )}

            <div
              style={{
                display: "flex",
                gap: 10,
                marginTop: 18,
                flexWrap: "wrap",
              }}
            >
              <Link href={`/employees/${selected.id}`} className="dt-btn">
                Open Profile
              </Link>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
