import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/Badge";
import { createClient } from "@/lib/supabase/server";
import { listPositions } from "@/lib/recruiting.server";
import {
  POSITION_STATUSES,
  fmtPayRate,
  type Position,
  type PositionStatus,
} from "@/lib/recruiting";
import { getServerDictionary } from "@/lib/i18n/server";
import { requireUser } from "@/lib/auth.server";

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysOpen(opened: string): string {
  const d = Math.floor((Date.now() - new Date(opened).getTime()) / 86_400_000);
  if (d <= 0) return "today";
  if (d === 1) return "1 day";
  return `${d} days`;
}

export default async function PositionsPage() {
  // Server-side auth gate. The proxy redirects unauthenticated requests at
  // the edge from a cookie; this is the authoritative check. requireUser
  // rather than requireRole("admin") on purpose — recruiters, not just
  // admins, manage requisitions, and gating at admin would lock the people
  // this screen exists for out of it.
  await requireUser();
  const [positions, clients] = await Promise.all([
    listPositions(),
    (async () => {
      const sb = await createClient();
      const { data } = await sb.from("clients").select("id, name").order("name");
      return data ?? [];
    })(),
  ]);

  const clientMap = new Map(clients.map((c) => [c.id, c.name]));

  const byStatus = new Map<PositionStatus, Position[]>();
  for (const s of POSITION_STATUSES) byStatus.set(s.id, []);
  for (const p of positions) byStatus.get(p.status)?.push(p);

  const totalOpen = (byStatus.get("open")?.length ?? 0) + (byStatus.get("on_hold")?.length ?? 0);
  const totalSeats = (byStatus.get("open") ?? [])
    .concat(byStatus.get("on_hold") ?? [])
    .reduce((s, p) => s + Math.max(0, (p.headcount ?? 1) - (p.filled_count ?? 0)), 0);

  const tb = (await getServerDictionary()).topbar.positions;

  return (
    <Shell>
      <Topbar
        crumb={tb.crumb}
        scriptWord={tb.scriptWord}
        title={tb.title}
        actions={
          <Link href="/positions/new" className="dt-btn dt-btn-gold">
            <span>+ New Position</span>
          </Link>
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
        <StatCard label="Active Reqs" value={totalOpen} />
        <StatCard label="Seats to Fill" value={totalSeats} />
        <StatCard label="Filled" value={byStatus.get("filled")?.length ?? 0} />
        <StatCard label="Cancelled" value={byStatus.get("cancelled")?.length ?? 0} />
      </div>

      {POSITION_STATUSES.map((s) => {
        const rows = byStatus.get(s.id) ?? [];
        if (rows.length === 0) return null;
        return (
          <div key={s.id} className="dt-card" style={{ marginBottom: 18 }}>
            <div className="dt-card-head">
              <div>
                <h3>{s.label}</h3>
                <div className="sub">
                  {rows.length} {rows.length === 1 ? "position" : "positions"}
                </div>
              </div>
              <Badge tone={s.tone}>{s.label}</Badge>
            </div>
            <div className="dt-table-wrap">
              <table className="dt-table">
                <thead>
                  <tr>
                    <th style={{ paddingLeft: 22 }}>Role</th>
                    <th>Client</th>
                    <th>Pay</th>
                    <th>Headcount</th>
                    <th>Recruiter</th>
                    <th>{s.id === "filled" ? "Filled" : "Opened"}</th>
                    <th style={{ textAlign: "right", paddingRight: 22 }}>Needed By</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const remaining = Math.max(0, (p.headcount ?? 1) - (p.filled_count ?? 0));
                    const inIndeedFeed = s.id === "open";
                    return (
                      <tr key={p.id}>
                        <td style={{ paddingLeft: 22 }}>
                          <Link href={`/positions/${p.id}`} className="dt-person-link">
                            <div
                              className="name"
                              style={{ fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}
                            >
                              <span>{p.role_title}</span>
                              {inIndeedFeed && (
                                <span
                                  title="Auto-published to the Indeed XML feed"
                                  style={{
                                    fontSize: 9.5,
                                    letterSpacing: "0.1em",
                                    textTransform: "uppercase",
                                    color: "var(--dt-gold-deep, #8a6a1d)",
                                    border: "1px solid var(--dt-gold-deep, #8a6a1d)",
                                    padding: "1px 5px",
                                    borderRadius: 2,
                                    fontWeight: 500,
                                    background: "rgba(212, 175, 55, 0.08)",
                                  }}
                                >
                                  Indeed
                                </span>
                              )}
                            </div>
                            <div className="meta" style={{ fontSize: 11.5 }}>
                              {p.department ?? "—"}
                              {p.shift ? ` · ${p.shift}` : ""}
                            </div>
                          </Link>
                        </td>
                        <td>{p.client_id ? clientMap.get(p.client_id) ?? "—" : "—"}</td>
                        <td className="tab-num" style={{ fontSize: 12 }}>
                          {fmtPayRate(p.pay_rate, p.pay_rate_unit)}
                        </td>
                        <td className="tab-num" style={{ fontSize: 12 }}>
                          {p.filled_count ?? 0} / {p.headcount ?? 1}
                          {remaining > 0 && s.id !== "filled" && (
                            <div
                              style={{
                                fontSize: 10,
                                color: "var(--dt-warm-500)",
                                marginTop: 2,
                                letterSpacing: "0.1em",
                                textTransform: "uppercase",
                              }}
                            >
                              {remaining} to go
                            </div>
                          )}
                        </td>
                        <td className="muted" style={{ fontSize: 12 }}>{p.recruiter ?? "—"}</td>
                        <td className="tab-num" style={{ fontSize: 12 }}>
                          {s.id === "filled" ? fmtDate(p.filled_at) : fmtDate(p.opened_at)}
                          {s.id !== "filled" && (
                            <div style={{ fontSize: 10, color: "var(--dt-warm-500)", marginTop: 2 }}>
                              {daysOpen(p.opened_at)} open
                            </div>
                          )}
                        </td>
                        <td className="tab-num" style={{ textAlign: "right", paddingRight: 22, fontSize: 12 }}>
                          {fmtDate(p.needed_by)}
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

      {positions.length === 0 && (
        <div
          className="dt-card"
          style={{
            padding: "48px 32px",
            textAlign: "center",
            color: "var(--dt-warm-500)",
          }}
        >
          No open positions yet.{" "}
          <Link href="/positions/new" style={{ color: "var(--dt-gold-deep)" }}>
            Add the first req →
          </Link>
        </div>
      )}
    </Shell>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="dt-card" style={{ padding: "14px 16px" }}>
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
        className="tab-num"
        style={{
          fontFamily: "var(--dt-display)",
          fontSize: 26,
          fontWeight: 300,
          marginTop: 6,
        }}
      >
        {value}
      </div>
    </div>
  );
}
