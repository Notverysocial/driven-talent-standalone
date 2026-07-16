import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { listTimecards } from "@/lib/timecards.server";
import type { ResolvedTimecard } from "@/lib/timecards.server";
import { TIMECARD_STATUSES, fmtWeekRange, isoWeekStart, startOfWeek } from "@/lib/timecards";
import type { TimecardStatus } from "@/lib/supabase/types";
import { getServerDictionary } from "@/lib/i18n/server";
import { getIntegration } from "@/lib/integrations/db";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function shiftWeek(weekStart: string, deltaWeeks: number): string {
  const d = new Date(weekStart + "T00:00:00");
  d.setDate(d.getDate() + deltaWeeks * 7);
  return isoDate(d);
}
// Snap an arbitrary ?week= value to its Monday; ignore unparseable input so a
// bad query string can never 500 the page.
function resolveWeek(raw: string | undefined): string {
  if (!raw) return isoWeekStart();
  const d = new Date(raw + "T00:00:00");
  if (Number.isNaN(d.getTime())) return isoWeekStart();
  return isoDate(startOfWeek(d));
}

export default async function TimecardsListPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; all?: string }>;
}) {
  const sp = await searchParams;

  // View mode: a single week (default = current week) or all weeks. When a
  // week is passed we snap it to that week's Monday so any date works.
  const showAll = sp.all === "1";
  const selectedWeek = showAll ? null : resolveWeek(sp.week);

  // Skip timecards whose employee or client join came back null (orphaned FK
  // or RLS-hidden parent). Accessing .full_name / .name on those throws during
  // render. Filtering here keeps the KPI counts and the tables consistent.
  const all = (
    await listTimecards(selectedWeek ? { weekStart: selectedWeek } : undefined)
  ).filter((t): t is ResolvedTimecard => Boolean(t.employees && t.clients));

  // uAttend connection status — shown as a thin banner so payroll
  // sees at a glance whether punches are flowing.  We swallow errors
  // (e.g. the integrations table not yet migrated in dev) so the
  // page still renders if the row is missing.
  let uattend: Awaited<ReturnType<typeof getIntegration>> | null = null;
  try {
    uattend = await getIntegration("uattend");
  } catch {
    uattend = null;
  }

  const byStatus = new Map<TimecardStatus, typeof all>();
  for (const s of TIMECARD_STATUSES) byStatus.set(s.id, []);
  for (const t of all) byStatus.get(t.status)?.push(t);

  const tb = (await getServerDictionary()).topbar.timecards;

  return (
    <Shell>
      <Topbar
        crumb={tb.crumb}
        scriptWord={tb.scriptWord}
        title={tb.title}
        actions={
          <>
            <Link href="/timecards/export" className="dt-btn">
              Export CSV
            </Link>
            <Link href="/timecards/new" className="dt-btn dt-btn-gold">
              <span>+ New Timecard</span>
            </Link>
          </>
        }
      />

      <UAttendStatus integration={uattend} />

      {/* Week selector: default is the current week; prev/next step by a week,
          the date box jumps to any week, and "All weeks" shows everything. */}
      <div
        className="dt-card"
        style={{
          padding: "12px 18px",
          marginBottom: 14,
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        {selectedWeek ? (
          <>
            <Link
              href={`/timecards?week=${shiftWeek(selectedWeek, -1)}`}
              className="dt-btn tiny"
              aria-label="Previous week"
            >
              ← Prev
            </Link>
            <div style={{ minWidth: 150, textAlign: "center", fontWeight: 400 }}>
              {fmtWeekRange(selectedWeek)}
              {selectedWeek === isoWeekStart() && (
                <span style={{ marginLeft: 6, fontSize: 10.5, color: "var(--dt-gold-deep)" }}>
                  (this week)
                </span>
              )}
            </div>
            <Link
              href={`/timecards?week=${shiftWeek(selectedWeek, 1)}`}
              className="dt-btn tiny"
              aria-label="Next week"
            >
              Next →
            </Link>
            <form method="get" style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="date"
                name="week"
                defaultValue={selectedWeek}
                className="dt-filter-input"
                style={{ fontSize: 12 }}
              />
              <button type="submit" className="dt-btn tiny">
                Go
              </button>
            </form>
            <Link
              href="/timecards?all=1"
              className="dt-btn tiny"
              style={{ marginLeft: "auto" }}
            >
              View all weeks
            </Link>
          </>
        ) : (
          <>
            <div style={{ fontWeight: 400 }}>Showing all weeks</div>
            <Link href="/timecards" className="dt-btn tiny" style={{ marginLeft: "auto" }}>
              Back to this week
            </Link>
          </>
        )}
      </div>

      {/* How invoices get built — plain-language flow so an unchanged Invoices
          page after editing hours doesn't read as a bug. */}
      <div
        className="dt-card"
        style={{
          padding: "10px 18px",
          marginBottom: 14,
          fontSize: 12,
          color: "var(--dt-warm-700, #5a4a3a)",
          lineHeight: 1.5,
        }}
      >
        Invoices are built from <strong>approved</strong> time cards. Editing a time card
        does not change invoices on its own. To update invoices: approve the time cards,
        then open the matching{" "}
        <Link href="/payroll" style={{ color: "var(--dt-gold-deep)" }}>
          pay period
        </Link>{" "}
        and run Generate. See{" "}
        <Link href="/invoices" style={{ color: "var(--dt-gold-deep)" }}>
          Invoices
        </Link>
        .
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 22,
        }}
      >
        {TIMECARD_STATUSES.map((s) => {
          const n = byStatus.get(s.id)?.length ?? 0;
          return (
            <div key={s.id} className="dt-card" style={{ padding: "14px 16px" }}>
              <div
                style={{
                  fontSize: 10.5,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "var(--dt-warm-500)",
                  fontWeight: 400,
                }}
              >
                {s.label}
              </div>
              <div
                className="tab-num"
                style={{
                  fontFamily: "var(--dt-display)",
                  fontSize: 26,
                  fontWeight: 300,
                  marginTop: 6,
                }}
              >
                {n}
              </div>
            </div>
          );
        })}
      </div>

      {TIMECARD_STATUSES.map((s) => {
        const rows = byStatus.get(s.id) ?? [];
        if (rows.length === 0) return null;
        return (
          <div key={s.id} className="dt-card" style={{ marginBottom: 18 }}>
            <div className="dt-card-head">
              <div>
                <h3>{s.label}</h3>
                <div className="sub">
                  {rows.length} {rows.length === 1 ? "timecard" : "timecards"}
                </div>
              </div>
              <Badge tone={s.tone}>{s.label}</Badge>
            </div>
            <div className="dt-table-wrap">
              <table className="dt-table">
                <thead>
                  <tr>
                    <th style={{ paddingLeft: 22 }}>Employee</th>
                    <th>Client</th>
                    <th>Week</th>
                    <th>Reg</th>
                    <th>OT</th>
                    <th>Total</th>
                    <th>Submitted</th>
                    <th style={{ textAlign: "right", paddingRight: 22 }}>Gross Est.</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => {
                    const gross = t.reg_hours * t.hourly_rate + t.ot_hours * t.hourly_rate * 1.5;
                    const href = `/timecards/${t.id}`;
                    // Cell wrapper: every TD's content is a Link to the detail page,
                    // so clicking any cell of the row navigates. Display:block + width:100%
                    // makes the entire cell area clickable, not just the text.
                    const cellLink = (content: React.ReactNode, extraStyle?: React.CSSProperties): React.ReactNode => (
                      <Link
                        href={href}
                        style={{
                          display: "block",
                          width: "100%",
                          color: "inherit",
                          textDecoration: "none",
                          ...extraStyle,
                        }}
                      >
                        {content}
                      </Link>
                    );
                    return (
                      <tr key={t.id} style={{ cursor: "pointer" }}>
                        <td style={{ paddingLeft: 22 }}>
                          <Link
                            href={href}
                            className="dt-person dt-person-link"
                          >
                            <Avatar name={t.employees.full_name} />
                            <div>
                              <div className="name">{t.employees.full_name}</div>
                              <div className="meta">${Number(t.hourly_rate).toFixed(2)}/hr</div>
                            </div>
                          </Link>
                        </td>
                        <td>{cellLink(t.clients.name)}</td>
                        <td className="tab-num" style={{ fontSize: 12 }}>
                          {cellLink(fmtWeekRange(t.week_start))}
                        </td>
                        <td className="tab-num">{cellLink(Number(t.reg_hours).toFixed(1))}</td>
                        <td
                          className="tab-num"
                          style={{ color: t.ot_hours > 0 ? "var(--dt-gold-deep)" : "var(--dt-warm-300)" }}
                        >
                          {cellLink(Number(t.ot_hours).toFixed(1))}
                        </td>
                        <td className="tab-num" style={{ fontWeight: 400 }}>
                          {cellLink(Number(t.total_hours).toFixed(1))}
                        </td>
                        <td className="tab-num" style={{ fontSize: 11 }}>
                          {cellLink(
                            t.submitted_at
                              ? new Date(t.submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                              : "—",
                          )}
                        </td>
                        <td
                          className="tab-num"
                          style={{
                            textAlign: "right",
                            paddingRight: 22,
                            fontWeight: 400,
                            color: "var(--dt-gold-deep)",
                          }}
                        >
                          {cellLink(`$${gross.toFixed(2)}`, { textAlign: "right" })}
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

      {all.length === 0 && (
        <div
          className="dt-card"
          style={{ padding: "48px 32px", textAlign: "center", color: "var(--dt-warm-500)" }}
        >
          {selectedWeek ? (
            <>
              No time cards for the week of {fmtWeekRange(selectedWeek)} yet.{" "}
              <Link
                href={`/timecards/new?week=${selectedWeek}`}
                style={{ color: "var(--dt-gold-deep)" }}
              >
                Add one →
              </Link>
              <div style={{ marginTop: 10, fontSize: 12 }}>
                Looking for another week? Use the arrows above or{" "}
                <Link href="/timecards?all=1" style={{ color: "var(--dt-gold-deep)" }}>
                  view all weeks
                </Link>
                .
              </div>
            </>
          ) : (
            <>
              No timecards yet.{" "}
              <Link href="/timecards/new" style={{ color: "var(--dt-gold-deep)" }}>
                Create the first one →
              </Link>
            </>
          )}
        </div>
      )}
    </Shell>
  );
}

// Thin banner rendered above the KPI row.  Three states:
//   1. uAttend connected + recently synced — green dot + relative time
//   2. uAttend connected but no recent sync — amber dot + warning
//   3. uAttend disconnected / no row — neutral dot + Connect link
function UAttendStatus({
  integration,
}: {
  integration: {
    status: string;
    last_sync_at: string | null;
    last_error: string | null;
  } | null;
}) {
  const status = integration?.status ?? "disconnected";
  const lastSync = integration?.last_sync_at ?? null;
  const lastErr = integration?.last_error ?? null;

  let dot = "var(--dt-warm-300)";
  let label: React.ReactNode = (
    <>
      uAttend not connected —{" "}
      <Link href="/integrations" style={{ color: "var(--dt-gold-deep)" }}>
        go to /integrations
      </Link>
    </>
  );

  if (status === "connected") {
    dot = "var(--dt-success)";
    label = lastSync ? (
      <>
        Last uAttend sync{" "}
        <span className="tab-num" style={{ color: "var(--dt-black)" }}>
          {new Date(lastSync).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>
      </>
    ) : (
      <>uAttend connected — no sync yet</>
    );
  } else if (status === "error") {
    dot = "var(--dt-danger)";
    label = (
      <>
        uAttend sync error{lastErr ? ` — ${lastErr.slice(0, 120)}` : ""} ·{" "}
        <Link href="/integrations" style={{ color: "var(--dt-gold-deep)" }}>
          view
        </Link>
      </>
    );
  } else if (status === "syncing") {
    dot = "var(--dt-gold-deep)";
    label = <>uAttend syncing…</>;
  }

  return (
    <div
      className="dt-card"
      style={{
        padding: "10px 18px",
        marginBottom: 14,
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 12.5,
        color: "var(--dt-warm-700, #5a4a3a)",
      }}
    >
      <span
        aria-hidden
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: dot,
        }}
      />
      <span>{label}</span>
    </div>
  );
}
