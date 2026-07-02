import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/Badge";
import { requireUser, roleAtLeast } from "@/lib/auth.server";
import { listRecords, listSections } from "@/lib/terminations.server";
import { computeProgress } from "@/lib/terminations";

export const dynamic = "force-dynamic";

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const parsed = new Date(d.length <= 10 ? `${d}T00:00:00` : d);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function TerminationsPage() {
  const me = await requireUser();
  const isAdmin = roleAtLeast(me.profile.role, "admin");
  const [records, sections] = await Promise.all([
    listRecords(false),
    listSections(false),
  ]);

  return (
    <Shell>
      <Topbar
        crumb="HR / OFFBOARDING / TERMINATIONS"
        scriptWord="Terminations "
        title="Tracker"
        actions={
          <>
            {isAdmin && (
              <Link href="/terminations/settings" className="dt-btn">
                Manage fields
              </Link>
            )}
            <Link href="/terminations/new" className="dt-btn dt-btn-gold">
              <span>+ New Termination</span>
            </Link>
          </>
        }
      />

      <div className="dt-card" style={{ marginBottom: 18 }}>
        <div className="dt-card-head">
          <div>
            <h3>Active Terminations</h3>
            <div className="sub">
              {records.length} {records.length === 1 ? "record" : "records"} ·
              fields are team-editable under “Manage fields”
            </div>
          </div>
        </div>
        {records.length === 0 ? (
          <div
            style={{
              padding: "44px 28px",
              textAlign: "center",
              color: "var(--dt-warm-500)",
              fontSize: 13,
            }}
          >
            No terminations logged yet.{" "}
            <Link
              href="/terminations/new"
              style={{ color: "var(--dt-gold-deep)" }}
            >
              Log the first one →
            </Link>
          </div>
        ) : (
          <div className="dt-table-wrap">
            <table className="dt-table">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 22 }}>Employee</th>
                  <th>Taken by</th>
                  <th>Term date</th>
                  <th>Reason</th>
                  <th>Overall</th>
                  <th style={{ textAlign: "right", paddingRight: 22 }}>
                    Progress
                  </th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => {
                  const prog = computeProgress(sections, r.values);
                  const overall = r.values["overall_progress"] ?? "";
                  const tone =
                    overall === "Complete"
                      ? "green"
                      : overall === "In Progress"
                        ? "gold"
                        : "warm";
                  return (
                    <tr key={r.id}>
                      <td style={{ paddingLeft: 22 }}>
                        <Link
                          href={`/terminations/${r.id}`}
                          className="dt-person-link"
                          style={{ fontWeight: 500 }}
                        >
                          {r.employee_name || "Unnamed"}
                        </Link>
                      </td>
                      <td className="muted" style={{ fontSize: 12.5 }}>
                        {r.values["termination_taken_by"] || "—"}
                      </td>
                      <td className="tab-num" style={{ fontSize: 12.5 }}>
                        {fmtDate(r.values["termination_date"] || null)}
                      </td>
                      <td className="muted" style={{ fontSize: 12.5 }}>
                        {r.values["termination_reason"] || "—"}
                      </td>
                      <td>
                        {overall ? <Badge tone={tone}>{overall}</Badge> : "—"}
                      </td>
                      <td style={{ textAlign: "right", paddingRight: 22 }}>
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <div
                            style={{
                              width: 70,
                              height: 6,
                              background: "var(--dt-warm-100)",
                              borderRadius: 3,
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                width: `${prog.pct}%`,
                                height: "100%",
                                background:
                                  prog.pct === 100
                                    ? "var(--dt-success)"
                                    : "var(--dt-gold)",
                              }}
                            />
                          </div>
                          <span
                            className="tab-num"
                            style={{ fontSize: 11.5, color: "var(--dt-warm-500)" }}
                          >
                            {prog.pct}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Shell>
  );
}
