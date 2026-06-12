import { listPunchesForEmployeeWeek, punchTypeLabel } from "@/lib/timeclock-punches.server";

// Read-only punch history for a single timecard.  Server component;
// queries timeclock_punches scoped to (employee_id, week_start) and
// renders a compact table.  Hidden inside a <details> so it doesn't
// bloat the timecard editor by default.

export async function PunchHistory({
  employeeId,
  weekStart,
}: {
  employeeId: string;
  weekStart: string;
}) {
  let punches: Awaited<ReturnType<typeof listPunchesForEmployeeWeek>> = [];
  let loadError: string | null = null;
  try {
    punches = await listPunchesForEmployeeWeek({ employeeId, weekStart });
  } catch (e) {
    loadError = e instanceof Error ? e.message : "load_failed";
  }

  return (
    <div className="dt-card" style={{ marginTop: 18 }}>
      <details>
        <summary
          style={{
            padding: "14px 22px",
            cursor: "pointer",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontFamily: "var(--dt-display)", fontSize: 16, fontWeight: 300 }}>
              Punch history
            </div>
            <div className="sub" style={{ fontSize: 11.5, color: "var(--dt-warm-500)" }}>
              uAttend clock-in / clock-out events for this week
            </div>
          </div>
          <div
            className="tab-num"
            style={{
              fontSize: 14,
              fontWeight: 400,
              color: punches.length > 0 ? "var(--dt-black)" : "var(--dt-warm-500)",
            }}
          >
            {punches.length} {punches.length === 1 ? "punch" : "punches"}
          </div>
        </summary>
        <div style={{ padding: "0 22px 18px" }}>
          {loadError && (
            <div style={{ color: "var(--dt-danger)", fontSize: 12 }}>
              Couldn&apos;t load punches: {loadError}
            </div>
          )}
          {!loadError && punches.length === 0 && (
            <div style={{ fontSize: 12.5, color: "var(--dt-warm-500)" }}>
              No uAttend punches recorded for this employee this week. If uAttend
              is connected, a punch will appear here within 15 minutes of being
              clocked.
            </div>
          )}
          {!loadError && punches.length > 0 && (
            <div className="dt-table-wrap">
              <table className="dt-table">
                <thead>
                  <tr>
                    <th style={{ paddingLeft: 0 }}>Type</th>
                    <th>Time</th>
                    <th>Device</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {punches.map((p) => {
                    const d = new Date(p.punch_time);
                    return (
                      <tr key={p.id}>
                        <td style={{ paddingLeft: 0 }}>
                          {punchTypeLabel(p.punch_type)}
                        </td>
                        <td className="tab-num" style={{ fontSize: 12 }}>
                          {d.toLocaleString(undefined, {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </td>
                        <td style={{ fontSize: 12, color: "var(--dt-warm-500)" }}>
                          {p.device_name ?? "—"}
                        </td>
                        <td style={{ fontSize: 12, color: "var(--dt-warm-500)" }}>
                          {p.notes ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
