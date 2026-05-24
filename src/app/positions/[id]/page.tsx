import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/Badge";
import { createClient } from "@/lib/supabase/server";
import { getPosition } from "@/lib/recruiting.server";
import { POSITION_STATUSES, fmtPayRate } from "@/lib/recruiting";
import { PositionForm } from "../PositionForm";
import { updatePosition } from "../actions";
import { StatusBar } from "./StatusBar";
import { PlacementForm } from "./PlacementForm";

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

export default async function PositionPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const position = await getPosition(id);
  if (!position) notFound();

  const sb = await createClient();
  const [{ data: clients }, { data: placements }, { data: candidates }, { data: employees }] = await Promise.all([
    sb.from("clients").select("id, name").order("name"),
    sb
      .from("position_placements")
      .select("id, placed_at, notes, employee_id, candidate_id, employees(full_name), candidates(full_name)")
      .eq("position_id", id)
      .order("placed_at", { ascending: false }),
    sb.from("candidates").select("id, full_name").order("full_name"),
    sb.from("employees").select("id, full_name").eq("status", "active").order("full_name"),
  ]);

  const statusMeta = POSITION_STATUSES.find((s) => s.id === position.status);
  const clientName = position.client_id
    ? (clients ?? []).find((c) => c.id === position.client_id)?.name ?? "—"
    : "—";
  const remaining = Math.max(0, (position.headcount ?? 1) - (position.filled_count ?? 0));

  return (
    <Shell>
      <Topbar
        crumb="WORKSPACE / RECRUITING / POSITIONS"
        scriptWord=""
        title={position.role_title}
        actions={
          <Link href="/positions" className="dt-btn">
            ← All Positions
          </Link>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 18 }}>
        {/* Left: editable form */}
        <div className="dt-card" style={{ padding: "24px 28px" }}>
          <div className="dt-card-head" style={{ padding: 0, marginBottom: 18, border: "none" }}>
            <div>
              <h3>Requirements</h3>
              <div className="sub">Edit and save to update.</div>
            </div>
            {statusMeta && <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>}
          </div>

          <form action={updatePosition.bind(null, position.id)}>
            <PositionForm clients={clients ?? []} position={position} />
            <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
              <button type="submit" className="dt-btn dt-btn-gold">
                <span>Save Changes</span>
              </button>
            </div>
          </form>
        </div>

        {/* Right: status / quick facts */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="dt-card" style={{ padding: "18px 20px" }}>
            <div
              style={{
                fontSize: 10.5,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--dt-warm-500)",
                marginBottom: 10,
              }}
            >
              Quick Facts
            </div>
            <Fact k="Client" v={clientName} />
            <Fact k="Pay" v={fmtPayRate(position.pay_rate, position.pay_rate_unit)} />
            <Fact k="Headcount" v={`${position.filled_count ?? 0} of ${position.headcount ?? 1}${remaining ? ` (${remaining} open)` : ""}`} />
            <Fact k="Opened" v={fmtDate(position.opened_at)} />
            <Fact k="Needed by" v={fmtDate(position.needed_by)} />
            <Fact k="Filled" v={fmtDate(position.filled_at)} />
            <Fact k="Recruiter" v={position.recruiter ?? "—"} />
          </div>

          <div className="dt-card" style={{ padding: "18px 20px" }}>
            <div
              style={{
                fontSize: 10.5,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--dt-warm-500)",
                marginBottom: 10,
              }}
            >
              Set Status
            </div>
            <StatusBar positionId={position.id} current={position.status} />
          </div>

          <div className="dt-card" style={{ padding: "18px 20px" }}>
            <div
              style={{
                fontSize: 10.5,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--dt-warm-500)",
                marginBottom: 10,
              }}
            >
              Record Placement
            </div>
            <PlacementForm
              positionId={position.id}
              candidates={candidates ?? []}
              employees={employees ?? []}
            />
          </div>
        </div>
      </div>

      {/* Placement history */}
      {(placements?.length ?? 0) > 0 && (
        <div className="dt-card" style={{ marginTop: 18 }}>
          <div className="dt-card-head">
            <div>
              <h3>Placement History</h3>
              <div className="sub">
                {placements!.length} {placements!.length === 1 ? "placement" : "placements"} on this req
              </div>
            </div>
          </div>
          <div className="dt-table-wrap">
            <table className="dt-table">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 22 }}>Name</th>
                  <th>Source</th>
                  <th>Placed</th>
                  <th style={{ paddingRight: 22 }}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {placements!.map((p) => {
                  const emp = Array.isArray(p.employees) ? p.employees[0] : p.employees;
                  const cand = Array.isArray(p.candidates) ? p.candidates[0] : p.candidates;
                  const name = (emp as { full_name?: string } | null)?.full_name
                    ?? (cand as { full_name?: string } | null)?.full_name
                    ?? "—";
                  return (
                    <tr key={p.id}>
                      <td style={{ paddingLeft: 22, fontWeight: 500 }}>{name}</td>
                      <td className="muted" style={{ fontSize: 12 }}>
                        {p.employee_id ? "Employee" : p.candidate_id ? "Candidate" : "—"}
                      </td>
                      <td className="tab-num" style={{ fontSize: 12 }}>{fmtDate(p.placed_at)}</td>
                      <td className="muted" style={{ paddingRight: 22, fontSize: 12 }}>{p.notes ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--dt-warm-100)", fontSize: 12.5 }}>
      <span style={{ color: "var(--dt-warm-500)" }}>{k}</span>
      <span style={{ fontWeight: 500, textAlign: "right" }}>{v}</span>
    </div>
  );
}
