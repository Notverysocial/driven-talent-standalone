import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { getEmployeeProfile } from "@/lib/employees.server";
import {
  attendanceColor,
  bandColor,
  bandFromScore,
  countAttendance,
  weightedAttendancePct,
  ATTENDANCE_LABEL,
  ATTENDANCE_DOT_COLOR,
  EMPLOYEE_STATUS_LABEL,
  employeeStatusTone,
} from "@/lib/staffing";
import type { OnboardingCategory } from "@/lib/supabase/types";

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function pct(n: number, total: number) {
  return total === 0 ? 0 : Math.round((n / total) * 100);
}

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await getEmployeeProfile(id);
  if (!profile) notFound();

  const { employee, assignments, attendance, checklist, documents } = profile;
  const band = employee.band ?? bandFromScore(employee.score);
  const tone = bandColor(band);
  const totals = countAttendance(attendance);
  const overallPct = weightedAttendancePct(attendance);

  // Group attendance by client for the per-client breakdown
  const attByClient = new Map<string, typeof attendance>();
  for (const a of attendance) {
    const arr = attByClient.get(a.client_id) ?? [];
    arr.push(a);
    attByClient.set(a.client_id, arr);
  }

  // Group checklist by category
  const checklistByCategory = new Map<OnboardingCategory, typeof checklist>();
  for (const i of checklist) {
    const arr = checklistByCategory.get(i.category) ?? [];
    arr.push(i);
    checklistByCategory.set(i.category, arr);
  }
  const checklistDone = checklist.filter((i) => i.status === "done").length;
  const docsDone = documents.filter((d) => d.received).length;

  const activeAssignments = assignments.filter((a) => a.active);

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
            <Link href={`/timecards?employee=${employee.id}`} className="dt-btn">
              Timecards
            </Link>
            <Link href={`/onboarding?employee=${employee.id}`} className="dt-btn dt-btn-gold">
              <span>Open Onboarding</span>
            </Link>
          </>
        }
      />

      {/* Header */}
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
          <Avatar name={employee.full_name} size="lg" />
          <div>
            <div style={{ fontFamily: "var(--dt-display)", fontSize: 24, fontWeight: 300 }}>
              {employee.full_name}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--dt-warm-500)", marginTop: 4 }}>
              {employee.city ?? "—"} · Hired {fmtDate(employee.hire_date)} ·{" "}
              {employee.status === "onboarding"
                ? "ONBOARDING"
                : `Rank ${employee.rank ?? "—"}`}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <Badge tone={employeeStatusTone(employee.status)}>
                {EMPLOYEE_STATUS_LABEL[employee.status]}
              </Badge>
              {band && <Badge tone={tone.tone}>{tone.label}</Badge>}
              {activeAssignments.length > 1 && (
                <Badge tone="gold">{activeAssignments.length} clients</Badge>
              )}
            </div>
          </div>
        </div>
        <div style={{ textAlign: "right", minWidth: 240 }}>
          <div className="tiny muted" style={{ letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 400 }}>
            Performance Score
          </div>
          <div
            className="tab-num"
            style={{
              fontFamily: "var(--dt-display)",
              fontSize: 48,
              fontWeight: 200,
              marginTop: 4,
              color: tone.fg,
              letterSpacing: "-0.02em",
              lineHeight: 1,
            }}
          >
            {employee.score || "—"}
          </div>
          <div style={{ fontSize: 11, color: "var(--dt-warm-500)", marginTop: 6 }}>
            {employee.email ?? "—"}
            <br />
            <span className="tab-num">{employee.phone ?? "—"}</span>
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 22 }}>
        <KPI label="30-Day Attendance" value={attendance.length ? `${overallPct}%` : "—"} accent={attendanceColor(overallPct)} sub={`${attendance.length} shifts logged`} />
        <KPI label="Present" value={String(totals.present)} accent="var(--dt-success)" sub="last 60 days" />
        <KPI label="Missed / No-Show" value={String(totals.missed + totals.noShow)} accent={(totals.missed + totals.noShow) > 0 ? "var(--dt-danger)" : "var(--dt-black)"} sub={`${totals.noShow} NCNS`} />
        <KPI
          label="Onboarding"
          value={`${pct(checklistDone, checklist.length)}%`}
          accent="var(--dt-gold-deep)"
          sub={`${checklistDone}/${checklist.length} steps · ${docsDone}/${documents.length} docs`}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: 22, marginBottom: 22 }}>
        {/* Assignments */}
        <div className="dt-card">
          <div className="dt-card-head">
            <div>
              <h3>Assignments</h3>
              <div className="sub">
                {activeAssignments.length} active · {assignments.length - activeAssignments.length} archived
              </div>
            </div>
          </div>
          <div className="dt-table-wrap">
            <table className="dt-table">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 22 }}>Client</th>
                  <th>Position</th>
                  <th>Shift</th>
                  <th>Started</th>
                  <th style={{ textAlign: "right", paddingRight: 22 }}>Rate</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr key={a.id} style={{ opacity: a.active ? 1 : 0.55 }}>
                    <td style={{ paddingLeft: 22 }}>
                      <div style={{ fontWeight: 400 }}>{a.client.name}</div>
                      <div style={{ fontSize: 10.5, color: "var(--dt-warm-500)", marginTop: 3 }}>
                        {a.client.city ?? "—"}
                      </div>
                    </td>
                    <td>
                      {a.position}
                      <div style={{ fontSize: 10.5, color: "var(--dt-warm-500)", marginTop: 3 }}>
                        {a.department}
                      </div>
                    </td>
                    <td className="tab-num" style={{ fontSize: 12, fontFamily: "var(--dt-mono)" }}>
                      {a.shift}
                    </td>
                    <td className="tab-num" style={{ fontSize: 12 }}>
                      {fmtDate(a.start_date)}
                    </td>
                    <td className="tab-num" style={{ textAlign: "right", paddingRight: 22, fontWeight: 400 }}>
                      ${Number(a.hourly_rate).toFixed(2)}/hr
                      {!a.active && (
                        <div style={{ fontSize: 9.5, letterSpacing: "0.16em", color: "var(--dt-warm-500)", marginTop: 3 }}>
                          ENDED
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {assignments.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: "32px 22px", color: "var(--dt-warm-500)", fontStyle: "italic" }}>
                      No assignments yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Onboarding side panel */}
        <div className="dt-card">
          <div className="dt-card-head">
            <div>
              <h3>Onboarding</h3>
              <div className="sub">
                {checklistDone} of {checklist.length} complete
              </div>
            </div>
            <Badge tone={checklistDone === checklist.length ? "green" : "amber"}>
              {pct(checklistDone, checklist.length)}%
            </Badge>
          </div>
          <div style={{ padding: "8px 22px 18px", maxHeight: 420, overflowY: "auto" }}>
            {Array.from(checklistByCategory.entries()).map(([cat, items]) => (
              <div key={cat} style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontSize: 9.5,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "var(--dt-warm-500)",
                    fontWeight: 400,
                    marginBottom: 8,
                  }}
                >
                  {cat}
                </div>
                {items.map((i) => (
                  <div
                    key={i.id}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      padding: "6px 0",
                      borderBottom: "1px solid var(--dt-warm-100)",
                    }}
                  >
                    <span
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 3,
                        marginTop: 2,
                        background: (i.status === "done") ? "var(--dt-success)" : "var(--dt-warm-100)",
                        border: (i.status === "done") ? "none" : "1px solid var(--dt-warm-200)",
                        color: "white",
                        fontSize: 10,
                        textAlign: "center",
                        lineHeight: "14px",
                        flexShrink: 0,
                      }}
                    >
                      {(i.status === "done") ? "✓" : ""}
                    </span>
                    <div style={{ flex: 1, fontSize: 12, lineHeight: 1.45 }}>
                      <div style={{ fontWeight: (i.status === "done") ? 300 : 400, color: (i.status === "done") ? "var(--dt-warm-500)" : "var(--dt-black)" }}>
                        {i.label}
                      </div>
                      {i.detail && (
                        <div style={{ fontSize: 10.5, color: "var(--dt-warm-500)", marginTop: 2 }}>
                          {i.detail}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent attendance */}
      <div className="dt-card">
        <div className="dt-card-head">
          <div>
            <h3>Attendance · Last 60 Days</h3>
            <div className="sub">Most recent first</div>
          </div>
        </div>
        <div className="dt-table-wrap">
          <table className="dt-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 22 }}>Date</th>
                <th>Client</th>
                <th>Status</th>
                <th>In · Out</th>
                <th style={{ paddingRight: 22 }}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {attendance.slice(0, 50).map((a) => {
                const c = profile.clientById.get(a.client_id);
                return (
                  <tr key={a.id}>
                    <td style={{ paddingLeft: 22 }} className="tab-num">
                      {fmtDate(a.date)}
                    </td>
                    <td>{c?.name ?? "—"}</td>
                    <td>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: 12,
                          fontWeight: 400,
                          color: ATTENDANCE_DOT_COLOR[a.status],
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: ATTENDANCE_DOT_COLOR[a.status],
                          }}
                        />
                        {ATTENDANCE_LABEL[a.status]}
                      </span>
                    </td>
                    <td className="tab-num" style={{ fontSize: 11, fontFamily: "var(--dt-mono)" }}>
                      {a.check_in ? `${a.check_in.slice(0, 5)}` : "—"}
                      {" · "}
                      {a.check_out ? `${a.check_out.slice(0, 5)}` : "—"}
                    </td>
                    <td style={{ paddingRight: 22, fontSize: 11.5, color: "var(--dt-warm-500)" }}>
                      {a.notes ?? "—"}
                    </td>
                  </tr>
                );
              })}
              {attendance.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "32px 22px", color: "var(--dt-warm-500)", fontStyle: "italic" }}>
                    No attendance recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {employee.notes && (
        <div className="dt-card" style={{ marginTop: 22, padding: "18px 24px" }}>
          <div
            className="tiny muted"
            style={{ letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 400, marginBottom: 8 }}
          >
            Notes
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.7, fontFamily: "var(--dt-display)", fontStyle: "italic", color: "var(--dt-warm-700)" }}>
            {employee.notes}
          </div>
        </div>
      )}
    </Shell>
  );
}

function KPI({ label, value, accent, sub }: { label: string; value: string; accent?: string; sub?: string }) {
  return (
    <div className="dt-card" style={{ padding: "18px 20px" }}>
      <div style={{ fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--dt-warm-500)", fontWeight: 400 }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
        <div className="tab-num" style={{ fontFamily: "var(--dt-display)", fontSize: 28, fontWeight: 300, color: accent || "var(--dt-black)", letterSpacing: "-0.01em" }}>
          {value}
        </div>
        {sub && <div style={{ fontSize: 11.5, color: "var(--dt-warm-500)" }}>{sub}</div>}
      </div>
    </div>
  );
}
