"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { EMPLOYEES, type Employee } from "@/lib/employees";

type ChecklistItem = {
  id: string;
  label: string;
  detail: string;
  category: "Documentation" | "Compliance" | "Training" | "Equipment" | "Review";
};

const CHECKLIST: ChecklistItem[] = [
  {
    id: "i9",
    label: "Form I-9 — Employment Eligibility",
    detail: "Verify identity & work authorization within 3 days of hire",
    category: "Compliance",
  },
  {
    id: "w4",
    label: "Form W-4 — Tax Withholding",
    detail: "Federal & California state tax election",
    category: "Documentation",
  },
  {
    id: "directdeposit",
    label: "Direct Deposit Authorization",
    detail: "Bank routing & account on file",
    category: "Documentation",
  },
  {
    id: "background",
    label: "Background Check Cleared",
    detail: "7-year criminal + employment verification",
    category: "Compliance",
  },
  {
    id: "drug",
    label: "Drug Screen — 5-Panel",
    detail: "Required for warehouse + driving positions",
    category: "Compliance",
  },
  {
    id: "handbook",
    label: "Employee Handbook Acknowledged",
    detail: "Signed receipt of policies & code of conduct",
    category: "Documentation",
  },
  {
    id: "safety",
    label: "OSHA-10 Safety Training",
    detail: "10-hour general industry certification",
    category: "Training",
  },
  {
    id: "forklift",
    label: "Forklift Certification (if applicable)",
    detail: "Powered industrial truck operator license",
    category: "Training",
  },
  {
    id: "siteorientation",
    label: "Client Site Orientation",
    detail: "Walkthrough at assigned client facility",
    category: "Training",
  },
  {
    id: "ppe",
    label: "PPE Issued",
    detail: "Hi-vis vest, steel-toe boots, hard hat, gloves",
    category: "Equipment",
  },
  {
    id: "badge",
    label: "Site Badge & Access Credentials",
    detail: "Photo ID, badge, parking permit",
    category: "Equipment",
  },
  {
    id: "uniform",
    label: "Uniform Sizing & Issuance",
    detail: "2 sets minimum, branded with Driven Talent",
    category: "Equipment",
  },
  {
    id: "day1",
    label: "Day-1 Check-In Call",
    detail: "Driven Talent rep confirms first-day arrival",
    category: "Review",
  },
  {
    id: "day7",
    label: "7-Day Review",
    detail: "Coordinator + supervisor sync on early performance",
    category: "Review",
  },
  {
    id: "day30",
    label: "30-Day Review",
    detail: "Formal performance check + scoring entry",
    category: "Review",
  },
];

const STARTING_PROGRESS: Record<string, string[]> = {
  "EM-1005": ["i9", "w4", "directdeposit", "background", "drug", "handbook", "safety"],
  "EM-1010": ["i9", "w4", "directdeposit", "background"],
  "EM-1015": [
    "i9",
    "w4",
    "directdeposit",
    "background",
    "drug",
    "handbook",
    "safety",
    "forklift",
    "siteorientation",
    "ppe",
    "badge",
    "uniform",
  ],
};

function progressFor(state: Record<string, Set<string>>, employeeId: string) {
  const done = state[employeeId]?.size ?? 0;
  return { done, total: CHECKLIST.length, pct: done / CHECKLIST.length };
}

const CATEGORY_TONE: Record<
  ChecklistItem["category"],
  "gold" | "amber" | "green" | "warm" | "dark"
> = {
  Compliance: "amber",
  Documentation: "warm",
  Training: "gold",
  Equipment: "warm",
  Review: "dark",
};

export default function OnboardingPage() {
  const initialState = useMemo<Record<string, Set<string>>>(() => {
    const s: Record<string, Set<string>> = {};
    for (const emp of EMPLOYEES) {
      s[emp.id] = new Set(STARTING_PROGRESS[emp.id] ?? []);
    }
    return s;
  }, []);

  const [state, setState] = useState<Record<string, Set<string>>>(initialState);
  const onboardingEmployees = useMemo<Employee[]>(
    () =>
      EMPLOYEES.filter(
        (e) => e.status === "pending" || progressFor(state, e.id).pct < 1
      ),
    [state]
  );

  const [selectedId, setSelectedId] = useState<string>(
    onboardingEmployees[0]?.id ?? EMPLOYEES[0].id
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

  const totalSteps = CHECKLIST.length;
  const totalCompleted = Object.values(state).reduce((a, s) => a + s.size, 0);
  const totalAcrossAll = EMPLOYEES.length * totalSteps;
  const overallPct =
    totalAcrossAll === 0 ? 0 : (totalCompleted / totalAcrossAll) * 100;

  const grouped = useMemo(() => {
    const groups: Record<string, ChecklistItem[]> = {};
    for (const item of CHECKLIST) {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    }
    return groups;
  }, []);

  return (
    <Shell>
      <Topbar
        crumb="WORKSPACE / ONBOARDING"
        scriptWord="New "
        title="Onboarding"
        actions={
          <>
            <Link href="/roster" className="dt-btn">
              Back to Roster
            </Link>
            <button className="dt-btn dt-btn-gold">
              <span>+ Start New Hire</span>
            </button>
          </>
        }
      />

      <div style={{ display: "flex", gap: 14, marginBottom: 22, flexWrap: "wrap" }}>
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
            In Onboarding
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
            <div
              className="tab-num"
              style={{
                fontFamily: "var(--dt-display)",
                fontSize: 28,
                fontWeight: 300,
              }}
            >
              {onboardingEmployees.length}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--dt-warm-500)" }}>active hires</div>
          </div>
        </div>
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
            Avg Progress
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
            <div
              className="tab-num"
              style={{
                fontFamily: "var(--dt-display)",
                fontSize: 28,
                fontWeight: 300,
                color: "var(--dt-gold-deep)",
              }}
            >
              {overallPct.toFixed(0)}%
            </div>
            <div style={{ fontSize: 11.5, color: "var(--dt-warm-500)" }}>
              checklist complete
            </div>
          </div>
        </div>
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
            Total Steps
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
            <div
              className="tab-num"
              style={{
                fontFamily: "var(--dt-display)",
                fontSize: 28,
                fontWeight: 300,
              }}
            >
              {totalSteps}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--dt-warm-500)" }}>per new hire</div>
          </div>
        </div>
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
            Items Completed
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
            <div
              className="tab-num"
              style={{
                fontFamily: "var(--dt-display)",
                fontSize: 28,
                fontWeight: 300,
                color: "var(--dt-success)",
              }}
            >
              {totalCompleted}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--dt-warm-500)" }}>
              of {totalAcrossAll}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 0.9fr) minmax(0, 2fr)",
          gap: 22,
        }}
        className="dt-overview-grid"
      >
        <div className="dt-card">
          <div className="dt-card-head">
            <div>
              <h3>New Hires</h3>
              <div className="sub">Select to view checklist</div>
            </div>
          </div>
          <div style={{ padding: "8px 0" }}>
            {EMPLOYEES.map((e) => {
              const p = progressFor(state, e.id);
              const isSelected = e.id === selectedId;
              const tone =
                p.pct >= 1 ? "green" : p.pct >= 0.5 ? "gold" : "amber";
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
                  <div>
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
                      }}
                    >
                      {e.client} · {e.position}
                    </div>
                  </div>
                  <Badge tone={tone}>
                    {p.done}/{p.total}
                  </Badge>
                </button>
              );
            })}
          </div>
        </div>

        <div className="dt-card gold-edge">
          <div className="dt-card-head">
            <div className="dt-person">
              <Avatar name={selected.name} size="lg" />
              <div>
                <div className="name" style={{ fontSize: 16 }}>
                  {selected.name}
                </div>
                <div className="meta">
                  {selected.id} · {selected.client} · {selected.position} ·{" "}
                  {selected.shift} shift
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
                {Math.round(progressFor(state, selected.id).pct * 100)}%
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
                  width: `${progressFor(state, selected.id).pct * 100}%`,
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
            </div>
          </div>

          <div style={{ padding: "0 26px 24px" }}>
            {(Object.keys(grouped) as ChecklistItem["category"][]).map((cat) => (
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
                  <Badge tone={CATEGORY_TONE[cat]}>{grouped[cat].length}</Badge>
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {grouped[cat].map((item) => {
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
            ))}
          </div>
        </div>
      </div>
    </Shell>
  );
}
