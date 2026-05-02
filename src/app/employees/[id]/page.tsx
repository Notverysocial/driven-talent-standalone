import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import {
  EMPLOYEES,
  getClient,
  bandColor,
  countAttendance,
  weightedAttendancePct,
  type AttendanceEntry,
} from "@/lib/data";
import { PerformanceBadge } from "@/components/PerformanceBadge";

export function generateStaticParams() {
  return EMPLOYEES.map((e) => ({ id: e.id }));
}

function pctDone(n: number, total: number) {
  return total === 0 ? 0 : Math.round((n / total) * 100);
}

function attCellClass(s: AttendanceEntry["status"]) {
  return `dt-att-cell ${s}`;
}

function attLabel(s: AttendanceEntry["status"]) {
  if (s === "present") return "✓";
  if (s === "late") return "L";
  if (s === "missed") return "M";
  if (s === "no-show") return "✗";
  return "·";
}

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const employee = EMPLOYEES.find((e) => e.id === id);
  if (!employee) notFound();

  const c = bandColor(employee.band);
  const totals = countAttendance(employee.attendance);
  const presentCount = totals.present;
  const missedCount = totals.missed + totals.noShow;
  const noShowCount = totals.noShow;
  const overallAttendancePct = weightedAttendancePct(employee.attendance);

  const checklistDone = employee.onboarding.checklist.filter((t) => t.done).length;
  const docsDone = employee.onboarding.documents.filter((d) => d.received).length;

  // Group attendance by client
  const byClient = new Map<string, AttendanceEntry[]>();
  for (const a of employee.attendance) {
    const arr = byClient.get(a.client) ?? [];
    arr.push(a);
    byClient.set(a.client, arr);
  }

  return (
    <Shell>
      <Topbar
        crumb="WORKSPACE / EMPLOYEE PROFILE"
        scriptWord="Employee "
        title="Profile"
        actions={
          <>
            <Link href="/roster" className="dt-btn">
              ← Back to Roster
            </Link>
            <Link
              href={`/attendance?employee=${employee.id}`}
              className="dt-btn"
            >
              Attendance Report
            </Link>
            <button className="dt-btn dt-btn-gold">
              <span>Add Assignment</span>
            </button>
          </>
        }
      />

      {/* Header card */}
      <div
        className="dt-card gold-edge"
        style={{
          padding: "24px 26px",
          marginBottom: 22,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
          flexWrap: "wrap",
        }}
      >
        <div className="dt-person">
          <Avatar name={employee.name} size="lg" />
          <div>
            <div
              style={{
                fontFamily: "var(--dt-display)",
                fontSize: 24,
                fontWeight: 300,
              }}
            >
              {employee.name}
            </div>
            <div
              style={{
                fontSize: 12.5,
                color: "var(--dt-warm-500)",
                marginTop: 4,
              }}
            >
              {employee.city} · Hired{" "}
              {new Date(employee.hireDate).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}{" "}
              · ID {employee.id.toUpperCase()}
            </div>
            <div
              style={{
                display: "flex",
                gap: 18,
                marginTop: 10,
                flexWrap: "wrap",
                fontSize: 12,
                color: "var(--dt-warm-700)",
              }}
            >
              <span>{employee.phone}</span>
              <span>{employee.email}</span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div
              className="tiny muted"
              style={{
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                fontWeight: 400,
              }}
            >
              Score
            </div>
            <div
              className="tab-num"
              style={{
                fontFamily: "var(--dt-display)",
                fontSize: 44,
                fontWeight: 300,
                color: c.fg,
                lineHeight: 1.05,
                marginTop: 4,
              }}
            >
              {employee.score || "—"}
            </div>
            <div style={{ marginTop: 6 }}>
              <Badge tone={c.tone}>
                {employee.band === "green"
                  ? "Front of Queue"
                  : employee.band === "yellow"
                  ? "Watch List"
                  : "Back of Queue"}
              </Badge>
            </div>
          </div>
          <div
            style={{ width: 1, height: 80, background: "var(--dt-warm-150)" }}
          />
          <div style={{ textAlign: "center" }}>
            <div
              className="tiny muted"
              style={{
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                fontWeight: 400,
              }}
            >
              Queue Rank
            </div>
            <div
              className="tab-num"
              style={{
                fontFamily: "var(--dt-display)",
                fontSize: 44,
                fontWeight: 300,
                marginTop: 4,
                color:
                  employee.status === "onboarding"
                    ? "var(--dt-warm-300)"
                    : "var(--dt-black)",
              }}
            >
              {employee.status === "onboarding" ? "—" : `#${employee.rank}`}
            </div>
            <div
              style={{
                fontSize: 10,
                color: "var(--dt-warm-500)",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                marginTop: 6,
              }}
            >
              of dispatch list
            </div>
          </div>
        </div>
      </div>

      {employee.notes && (
        <div
          className="dt-card"
          style={{
            padding: "16px 22px",
            marginBottom: 22,
            background: "var(--dt-warm-50)",
            borderLeft: "2px solid var(--dt-gold)",
          }}
        >
          <div
            className="tiny muted"
            style={{
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              fontWeight: 400,
            }}
          >
            Roxanna&apos;s Note
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 13.5,
              fontFamily: "var(--dt-display)",
              fontStyle: "italic",
              color: "var(--dt-warm-700)",
              lineHeight: 1.6,
            }}
          >
            “{employee.notes}”
          </div>
        </div>
      )}

      <div className="dt-detail-grid">
        <div className="col gap-md">
          {/* Assignments */}
          <div className="dt-card">
            <div className="dt-card-head">
              <div>
                <h3>Active Assignments</h3>
                <div className="sub">
                  {employee.assignments.length === 1
                    ? "Single client placement"
                    : `Placed at ${employee.assignments.length} client sites`}
                </div>
              </div>
              <Badge tone="gold">{employee.assignments.length} active</Badge>
            </div>
            <div style={{ padding: "8px 26px 18px" }}>
              {employee.assignments.map((a, i) => {
                const client = getClient(a.client);
                const clientMissed = (byClient.get(a.client) ?? []).filter(
                  (x) => x.status === "missed" || x.status === "no-show"
                ).length;
                return (
                  <div
                    key={`${a.client}-${a.shift}`}
                    style={{
                      padding: "16px 0",
                      borderBottom:
                        i < employee.assignments.length - 1
                          ? "1px solid var(--dt-warm-100)"
                          : "none",
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: 16,
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontFamily: "var(--dt-display)",
                          fontSize: 16,
                          fontWeight: 400,
                          letterSpacing: "0.04em",
                        }}
                      >
                        {client.name}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--dt-warm-500)",
                          marginTop: 4,
                        }}
                      >
                        {a.position} · {a.department} · {a.shift}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: 18,
                          marginTop: 8,
                          fontSize: 11,
                          color: "var(--dt-warm-700)",
                          letterSpacing: "0.06em",
                        }}
                      >
                        <span>
                          Started{" "}
                          {new Date(a.startDate).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                        <span>{client.city}</span>
                        {clientMissed > 0 && (
                          <span style={{ color: "var(--dt-danger)" }}>
                            {clientMissed} missed at this site
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="tab-num" style={{ textAlign: "right" }}>
                      <div
                        style={{
                          fontFamily: "var(--dt-display)",
                          fontSize: 22,
                          fontWeight: 300,
                          color: "var(--dt-gold-deep)",
                        }}
                      >
                        ${a.rate.toFixed(2)}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: "var(--dt-warm-500)",
                          letterSpacing: "0.18em",
                          textTransform: "uppercase",
                        }}
                      >
                        per hr
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 30-day attendance */}
          <div className="dt-card">
            <div className="dt-card-head">
              <div>
                <h3>Attendance · Last 30 Days</h3>
                <div className="sub">
                  Weighted rate{" "}
                  {employee.attendance.length === 0 ? "—" : `${overallAttendancePct}%`}
                  {" · "}
                  present + 0.5×late · grouped by client site
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <PerformanceBadge
                  score={employee.score}
                  missedDays={missedCount}
                />
                <Badge tone="green">{presentCount} present</Badge>
                {missedCount > 0 && (
                  <Badge tone="red">
                    {missedCount} missed
                    {noShowCount > 0 && ` · ${noShowCount} NCNS`}
                  </Badge>
                )}
              </div>
            </div>
            <div style={{ padding: "16px 26px 22px" }}>
              {byClient.size === 0 ? (
                <div
                  style={{
                    padding: "16px 0",
                    color: "var(--dt-warm-500)",
                    fontSize: 13,
                    fontStyle: "italic",
                  }}
                >
                  No attendance records yet — employee is{" "}
                  {employee.status === "onboarding"
                    ? "still onboarding"
                    : "newly placed"}
                  .
                </div>
              ) : (
                Array.from(byClient.entries()).map(([clientId, entries]) => {
                  const client = getClient(clientId as ReturnType<typeof getClient>["id"]);
                  const clientPct = weightedAttendancePct(entries);
                  const clientRate =
                    clientPct >= 95
                      ? "var(--dt-success)"
                      : clientPct >= 85
                      ? "var(--dt-gold-deep)"
                      : "var(--dt-danger)";
                  return (
                    <div key={clientId} style={{ marginBottom: 22 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 10,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11.5,
                            fontWeight: 400,
                            letterSpacing: "0.18em",
                            textTransform: "uppercase",
                            color: "var(--dt-warm-700)",
                          }}
                        >
                          {client.name}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: 10,
                            alignItems: "baseline",
                          }}
                        >
                          <span
                            className="tab-num"
                            style={{
                              fontSize: 13,
                              fontWeight: 400,
                              color: clientRate,
                            }}
                          >
                            {clientPct}%
                          </span>
                          <span
                            style={{
                              fontSize: 10.5,
                              color: "var(--dt-warm-500)",
                              letterSpacing: "0.14em",
                              textTransform: "uppercase",
                            }}
                          >
                            {entries.length} shifts
                          </span>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {entries.map((entry) => (
                          <div
                            key={entry.date}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <div
                              style={{
                                fontSize: 9.5,
                                color: "var(--dt-warm-500)",
                                letterSpacing: "0.14em",
                              }}
                            >
                              {new Date(entry.date)
                                .toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                })
                                .toUpperCase()}
                            </div>
                            <div
                              className={attCellClass(entry.status)}
                              title={
                                entry.status.toUpperCase() +
                                (entry.notes ? ` — ${entry.notes}` : "")
                              }
                            >
                              {attLabel(entry.status)}
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* Notes */}
                      {entries.some((e) => e.notes) && (
                        <ul
                          style={{
                            margin: "12px 0 0",
                            padding: 0,
                            listStyle: "none",
                            fontSize: 11.5,
                            color: "var(--dt-warm-500)",
                            lineHeight: 1.6,
                          }}
                        >
                          {entries
                            .filter((e) => e.notes)
                            .map((e) => (
                              <li key={e.date}>
                                <span
                                  style={{
                                    display: "inline-block",
                                    minWidth: 70,
                                    color: "var(--dt-warm-700)",
                                  }}
                                >
                                  {new Date(e.date).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                  })}
                                </span>
                                <span
                                  style={{
                                    color:
                                      e.status === "no-show"
                                        ? "var(--dt-danger)"
                                        : "var(--dt-warm-700)",
                                    fontWeight: 400,
                                    marginRight: 8,
                                    textTransform: "uppercase",
                                    fontSize: 9.5,
                                    letterSpacing: "0.16em",
                                  }}
                                >
                                  {e.status}
                                </span>
                                — {e.notes}
                              </li>
                            ))}
                        </ul>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Sidebar — onboarding + scoring rationale */}
        <div className="col gap-md">
          <div className="dt-card">
            <div className="dt-card-head" style={{ padding: "18px 22px 14px" }}>
              <div>
                <h3>Onboarding</h3>
                <div className="sub">
                  {checklistDone}/{employee.onboarding.checklist.length} steps ·{" "}
                  {docsDone}/{employee.onboarding.documents.length} docs
                </div>
              </div>
            </div>
            <div style={{ padding: "8px 22px 22px" }}>
              <div className="dt-progress" style={{ marginBottom: 18 }}>
                <div
                  className={
                    "fill" +
                    (checklistDone === employee.onboarding.checklist.length
                      ? " done"
                      : "")
                  }
                  style={{
                    width:
                      pctDone(
                        checklistDone,
                        employee.onboarding.checklist.length
                      ) + "%",
                  }}
                />
              </div>
              {employee.onboarding.checklist.map((t) => (
                <div key={t.id} className="dt-check-item">
                  <div className={"dt-check-box" + (t.done ? " done" : "")} />
                  <div>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 400,
                        color: t.done
                          ? "var(--dt-warm-500)"
                          : "var(--dt-black)",
                        textDecoration: t.done ? "line-through" : "none",
                      }}
                    >
                      {t.label}
                    </div>
                    {t.doneOn && (
                      <div
                        style={{
                          fontSize: 10,
                          color: "var(--dt-warm-500)",
                          marginTop: 2,
                          letterSpacing: "0.14em",
                        }}
                      >
                        {new Date(t.doneOn).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </div>
                    )}
                  </div>
                  <div />
                </div>
              ))}
            </div>
          </div>

          <div className="dt-card">
            <div className="dt-card-head" style={{ padding: "18px 22px 14px" }}>
              <div>
                <h3>Documents</h3>
                <div className="sub">Required for placement</div>
              </div>
            </div>
            <div style={{ padding: "8px 22px 22px" }}>
              {employee.onboarding.documents.map((d) => (
                <div
                  key={d.name}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 0",
                    borderBottom: "1px solid var(--dt-warm-100)",
                  }}
                >
                  <span style={{ fontSize: 12.5, fontWeight: 300 }}>
                    {d.name}
                  </span>
                  {d.received ? (
                    <Badge tone="green">On File</Badge>
                  ) : (
                    <Badge tone="amber">Pending</Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
