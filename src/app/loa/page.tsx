import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { listEmployeesForPicker, listLoaRequests } from "@/lib/hr.server";
import {
  LOA_PROTECTED_BY_DEFAULT,
  LOA_STATUS_LABEL,
  LOA_STATUS_TONE,
  LOA_TYPE_LABEL,
  daysBetween,
  fmtDate,
  loaIsOpen,
} from "@/lib/hr";
import type { LoaStatus, LoaType } from "@/lib/supabase/types";
import { createLoaRequest, setLoaStatus } from "./actions";
import { getServerDictionary } from "@/lib/i18n/server";

const STATUS_FILTERS: { key: LoaStatus | "all" | "open"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "requested", label: "Requested" },
  { key: "approved", label: "Approved" },
  { key: "active", label: "On Leave" },
  { key: "returned", label: "Returned" },
  { key: "denied", label: "Denied" },
];

export default async function LoaPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const statusFilter = (sp.status ?? "open") as LoaStatus | "all" | "open";

  const [allRequests, employeePicker] = await Promise.all([
    listLoaRequests(),
    listEmployeesForPicker(),
  ]);

  const filtered = allRequests.filter((r) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "open") return loaIsOpen(r.status);
    return r.status === statusFilter;
  });

  const openCount = allRequests.filter((r) => loaIsOpen(r.status)).length;
  const activeCount = allRequests.filter((r) => r.status === "active").length;
  const requestedCount = allRequests.filter((r) => r.status === "requested").length;
  const protectedCount = allRequests.filter(
    (r) => r.protected && loaIsOpen(r.status),
  ).length;

  const tb = (await getServerDictionary()).topbar.loa;

  return (
    <Shell>
      <Topbar crumb={tb.crumb} scriptWord={tb.scriptWord} title={tb.title} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
          marginBottom: 22,
        }}
      >
        <KPI label="Open" value={String(openCount)} sub="cases tracked" accent="var(--dt-gold-deep)" />
        <KPI label="On Leave" value={String(activeCount)} sub="currently out" accent={activeCount > 0 ? "var(--dt-warning)" : "var(--dt-black)"} />
        <KPI label="Awaiting Decision" value={String(requestedCount)} sub="needs review" />
        <KPI label="Protected" value={String(protectedCount)} sub="CFRA / PDL / military" accent="var(--dt-success)" />
      </div>

      <div
        style={{
          fontSize: 11,
          color: "var(--dt-warm-500)",
          background: "var(--dt-warm-50)",
          border: "1px solid var(--dt-warm-150)",
          borderLeft: "3px solid var(--dt-gold)",
          padding: "10px 14px",
          marginBottom: 22,
          letterSpacing: "0.04em",
          lineHeight: 1.5,
        }}
      >
        <strong style={{ fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", fontSize: 10 }}>
          CA Protected Leave
        </strong>
        {" — "}
        CFRA (Gov Code § 12945.2), PDL (Gov Code § 12945), Bereavement (AB 1949),
        Jury Duty (CCP § 230), Military (USERRA), Workers&apos; Comp (Labor Code § 132a).
      </div>

      {/* Status chips */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <span
          style={{
            fontSize: 10.5,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--dt-warm-500)",
            fontWeight: 400,
            marginRight: 4,
          }}
        >
          Status
        </span>
        {STATUS_FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "open" ? "/loa" : `/loa?status=${f.key}`}
            className={"dt-chip" + (statusFilter === f.key ? " active" : "")}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 360px",
          gap: 22,
          alignItems: "start",
        }}
      >
        {/* Requests table */}
        <div className="dt-card gold-edge">
          <div className="dt-card-head">
            <div>
              <h3>{filtered.length} {filtered.length === 1 ? "request" : "requests"}</h3>
              <div className="sub">
                {statusFilter === "open" ? "Open cases" : LOA_STATUS_LABEL[statusFilter as LoaStatus] ?? "All"}
              </div>
            </div>
          </div>
          <div className="dt-table-wrap">
            <table className="dt-table">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 22 }}>Employee</th>
                  <th>Type</th>
                  <th>Dates</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th style={{ paddingRight: 22 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const days = daysBetween(r.start_date, r.end_date);
                  return (
                    <tr key={r.id}>
                      <td style={{ paddingLeft: 22 }}>
                        <Link
                          href={`/employees/${r.employee.id}`}
                          className="dt-person dt-person-link"
                        >
                          <Avatar name={r.employee.full_name} />
                          <div>
                            <div className="name">{r.employee.full_name}</div>
                            <div className="meta">{r.employee.city ?? "—"}</div>
                          </div>
                        </Link>
                      </td>
                      <td style={{ fontSize: 12.5 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <span>{LOA_TYPE_LABEL[r.type]}</span>
                          {r.protected && (
                            <span style={{ fontSize: 9.5, color: "var(--dt-success)", letterSpacing: "0.18em", textTransform: "uppercase" }}>
                              Protected
                            </span>
                          )}
                          {r.paid && (
                            <span style={{ fontSize: 9.5, color: "var(--dt-gold-deep)", letterSpacing: "0.18em", textTransform: "uppercase" }}>
                              Paid
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="tab-num" style={{ fontSize: 12 }}>
                        <div>{fmtDate(r.start_date)}</div>
                        <div className="muted" style={{ fontSize: 11 }}>
                          {r.end_date ? `→ ${fmtDate(r.end_date)}` : "→ indefinite"}
                          {days != null && (
                            <span style={{ marginLeft: 6 }}>· {days}d</span>
                          )}
                        </div>
                        {r.return_date && (
                          <div style={{ fontSize: 10.5, color: "var(--dt-success)", marginTop: 2 }}>
                            Returned {fmtDate(r.return_date)}
                          </div>
                        )}
                      </td>
                      <td className="muted" style={{ fontSize: 12, maxWidth: 260 }}>
                        {r.reason ?? "—"}
                      </td>
                      <td>
                        <Badge tone={LOA_STATUS_TONE[r.status]}>
                          {LOA_STATUS_LABEL[r.status]}
                        </Badge>
                      </td>
                      <td style={{ paddingRight: 22 }}>
                        <LoaStatusActions
                          id={r.id}
                          employeeId={r.employee.id}
                          status={r.status}
                        />
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      style={{
                        textAlign: "center",
                        padding: "48px 22px",
                        color: "var(--dt-warm-500)",
                        fontStyle: "italic",
                      }}
                    >
                      No leave requests in this view.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* New-request panel */}
        <aside className="dt-card" style={{ padding: 0 }}>
          <div className="dt-card-head">
            <div>
              <h3>New Request</h3>
              <div className="sub">Capture for review</div>
            </div>
          </div>
          <form
            action={createLoaRequest}
            style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 14 }}
          >
            <Field label="Employee">
              <select name="employee_id" required className="dt-filter-input" defaultValue="">
                <option value="">Select employee…</option>
                {employeePicker.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Type">
              <select name="type" required className="dt-filter-input" defaultValue="medical">
                {(Object.keys(LOA_TYPE_LABEL) as LoaType[]).map((t) => (
                  <option key={t} value={t}>
                    {LOA_TYPE_LABEL[t]}
                    {LOA_PROTECTED_BY_DEFAULT[t] ? " · protected" : ""}
                  </option>
                ))}
              </select>
            </Field>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Start">
                <input name="start_date" type="date" required className="dt-filter-input" />
              </Field>
              <Field label="End (optional)">
                <input name="end_date" type="date" className="dt-filter-input" />
              </Field>
            </div>

            <Field label="Reason / detail">
              <textarea
                name="reason"
                rows={3}
                className="dt-filter-input"
                style={{ resize: "vertical", minHeight: 60 }}
                placeholder="Short description (no PHI)"
              />
            </Field>

            <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
              <input type="checkbox" name="paid" />
              <span>Paid leave</span>
            </label>

            <button type="submit" className="dt-btn dt-btn-primary" style={{ marginTop: 4 }}>
              <span>Create Request</span>
            </button>
          </form>
        </aside>
      </div>
    </Shell>
  );
}

function LoaStatusActions({
  id,
  employeeId,
  status,
}: {
  id: string;
  employeeId: string;
  status: LoaStatus;
}) {
  if (status === "cancelled" || status === "denied" || status === "returned") {
    return <span className="muted" style={{ fontSize: 11 }}>—</span>;
  }
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {status === "requested" && (
        <>
          <ActionButton id={id} employeeId={employeeId} status="approved" label="Approve" />
          <ActionButton id={id} employeeId={employeeId} status="denied" label="Deny" />
        </>
      )}
      {status === "approved" && (
        <ActionButton id={id} employeeId={employeeId} status="active" label="Start" />
      )}
      {status === "active" && (
        <ActionButton id={id} employeeId={employeeId} status="returned" label="Return" />
      )}
      {(status === "requested" || status === "approved") && (
        <ActionButton
          id={id}
          employeeId={employeeId}
          status="cancelled"
          label="Cancel"
          ghost
        />
      )}
    </div>
  );
}

function ActionButton({
  id,
  employeeId,
  status,
  label,
  ghost,
}: {
  id: string;
  employeeId: string;
  status: LoaStatus;
  label: string;
  ghost?: boolean;
}) {
  return (
    <form
      action={async () => {
        "use server";
        await setLoaStatus(id, employeeId, status);
      }}
    >
      <button
        type="submit"
        className={"dt-btn " + (ghost ? "dt-btn-ghost" : "")}
        style={{ padding: "5px 10px", fontSize: 9.5, letterSpacing: "0.14em" }}
      >
        <span>{label}</span>
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="dt-filter">
      <span className="dt-filter-label">{label}</span>
      {children}
    </label>
  );
}

function KPI({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="dt-card" style={{ padding: "18px 20px" }}>
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
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
        <div
          className="tab-num"
          style={{
            fontFamily: "var(--dt-display)",
            fontSize: 28,
            fontWeight: 300,
            color: accent || "var(--dt-black)",
            letterSpacing: "-0.01em",
          }}
        >
          {value}
        </div>
        {sub && <div style={{ fontSize: 11.5, color: "var(--dt-warm-500)" }}>{sub}</div>}
      </div>
    </div>
  );
}
