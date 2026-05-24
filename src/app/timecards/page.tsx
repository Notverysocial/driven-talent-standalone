import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { listTimecards } from "@/lib/timecards.server";
import { TIMECARD_STATUSES, fmtWeekRange } from "@/lib/timecards";
import type { TimecardStatus } from "@/lib/supabase/types";
import { getServerDictionary } from "@/lib/i18n/server";

export default async function TimecardsListPage() {
  const all = await listTimecards();

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
                    return (
                      <tr key={t.id}>
                        <td style={{ paddingLeft: 22 }}>
                          <Link
                            href={`/timecards/${t.id}`}
                            className="dt-person dt-person-link"
                          >
                            <Avatar name={t.employees.full_name} />
                            <div>
                              <div className="name">{t.employees.full_name}</div>
                              <div className="meta">${Number(t.hourly_rate).toFixed(2)}/hr</div>
                            </div>
                          </Link>
                        </td>
                        <td>{t.clients.name}</td>
                        <td className="tab-num" style={{ fontSize: 12 }}>
                          {fmtWeekRange(t.week_start)}
                        </td>
                        <td className="tab-num">{Number(t.reg_hours).toFixed(1)}</td>
                        <td
                          className="tab-num"
                          style={{ color: t.ot_hours > 0 ? "var(--dt-gold-deep)" : "var(--dt-warm-300)" }}
                        >
                          {Number(t.ot_hours).toFixed(1)}
                        </td>
                        <td className="tab-num" style={{ fontWeight: 400 }}>
                          {Number(t.total_hours).toFixed(1)}
                        </td>
                        <td className="tab-num" style={{ fontSize: 11 }}>
                          {t.submitted_at
                            ? new Date(t.submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                            : "—"}
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
                          ${gross.toFixed(2)}
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
