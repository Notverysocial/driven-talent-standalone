import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { listTimecards } from "@/lib/timecards.server";
import { TIMECARD_STATUSES, fmtWeekRange } from "@/lib/timecards";
import type { TimecardStatus } from "@/lib/supabase/types";
import { getServerDictionary } from "@/lib/i18n/server";
import { getIntegration } from "@/lib/integrations/db";

export default async function TimecardsListPage() {
  const all = await listTimecards();

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
          No timecards yet.{" "}
          <Link href="/timecards/new" style={{ color: "var(--dt-gold-deep)" }}>
            Create the first one →
          </Link>
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
