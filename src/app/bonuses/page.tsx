import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import {
  listBonuses,
  listCandidatesForPicker,
  listPositionsForPicker,
  type BonusRow,
} from "@/lib/bonuses.server";
import { listClientsForPicker, listEmployeesForPicker } from "@/lib/hr.server";
import {
  BONUS_KIND_LABEL,
  BONUS_KIND_TONE,
  BONUS_STATUS_LABEL,
  BONUS_STATUS_TONE,
  fmtDate,
  fmtMoney,
  type BonusKind,
  type BonusStatus,
} from "@/lib/bonuses";
import { createBonus, markBonusPaid, setBonusStatus } from "./actions";

type View = "all" | BonusKind;

export default async function BonusesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const sp = await searchParams;
  const view: View =
    sp.view === "recruiter" || sp.view === "referral" ? (sp.view as BonusKind) : "all";

  const [bonuses, employees, clients, positions, candidates] = await Promise.all([
    listBonuses(),
    listEmployeesForPicker(),
    listClientsForPicker(),
    listPositionsForPicker(),
    listCandidatesForPicker(),
  ]);

  const filtered = view === "all" ? bonuses : bonuses.filter((b) => b.kind === view);

  const pendingTotal = bonuses
    .filter((b) => b.status === "pending")
    .reduce((s, b) => s + Number(b.amount), 0);
  const approvedTotal = bonuses
    .filter((b) => b.status === "approved")
    .reduce((s, b) => s + Number(b.amount), 0);
  const paidYtdTotal = (() => {
    const yearStart = `${new Date().getFullYear()}-01-01`;
    return bonuses
      .filter((b) => b.status === "paid" && (b.paid_at ?? "") >= yearStart)
      .reduce((s, b) => s + Number(b.amount), 0);
  })();
  const pendingCount = bonuses.filter((b) => b.status === "pending").length;

  const recruiterCount = bonuses.filter((b) => b.kind === "recruiter").length;
  const referralCount = bonuses.filter((b) => b.kind === "referral").length;

  return (
    <Shell>
      <Topbar
        crumb="WORKSPACE / PAYROLL & FINANCE / BONUSES"
        scriptWord="Recruiter & Referral "
        title="Bonuses"
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
          marginBottom: 22,
        }}
      >
        <KPI
          label="Pending"
          value={fmtMoney(pendingTotal)}
          sub={`${pendingCount} awaiting approval`}
          accent={pendingCount > 0 ? "var(--dt-warning)" : "var(--dt-black)"}
        />
        <KPI label="Approved" value={fmtMoney(approvedTotal)} sub="ready to pay" />
        <KPI label="Paid YTD" value={fmtMoney(paidYtdTotal)} sub="disbursed this year" />
        <KPI label="On File" value={String(bonuses.length)} sub="all bonus records" />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <Link href="/bonuses" className={"dt-chip" + (view === "all" ? " active" : "")}>
          All · {bonuses.length}
        </Link>
        <Link
          href="/bonuses?view=recruiter"
          className={"dt-chip" + (view === "recruiter" ? " active" : "")}
        >
          Recruiter · {recruiterCount}
        </Link>
        <Link
          href="/bonuses?view=referral"
          className={"dt-chip" + (view === "referral" ? " active" : "")}
        >
          Referral · {referralCount}
        </Link>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 360px",
          gap: 22,
          alignItems: "start",
        }}
      >
        <div className="dt-card gold-edge">
          <div className="dt-card-head">
            <div>
              <h3>
                {filtered.length} {filtered.length === 1 ? "bonus" : "bonuses"}
                {view !== "all" ? ` · ${BONUS_KIND_LABEL[view]}` : ""}
              </h3>
              <div className="sub">Newest earned first</div>
            </div>
            <Badge tone="gold">Pending → Approved → Paid</Badge>
          </div>

          <div className="dt-table-wrap">
            <table className="dt-table">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 22 }}>Kind / Status</th>
                  <th>Paid To</th>
                  <th>For (Hire)</th>
                  <th>Position</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th>Earned</th>
                  <th style={{ paddingRight: 22 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => (
                  <BonusRowView key={b.id} bonus={b} />
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      style={{
                        textAlign: "center",
                        padding: "48px 22px",
                        color: "var(--dt-warm-500)",
                        fontStyle: "italic",
                      }}
                    >
                      No bonuses logged
                      {view !== "all" ? ` in ${BONUS_KIND_LABEL[view]}` : ""} yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="dt-card" style={{ padding: 0 }}>
          <div className="dt-card-head">
            <div>
              <h3>Log Bonus</h3>
              <div className="sub">Recruiter or referral</div>
            </div>
          </div>
          <form
            action={createBonus}
            style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 12 }}
          >
            <Field label="Kind">
              <select name="kind" required defaultValue="recruiter" className="dt-filter-input">
                <option value="recruiter">Recruiter</option>
                <option value="referral">Referral</option>
              </select>
            </Field>

            <Field label="Amount ($)">
              <input
                name="amount"
                type="number"
                step="0.01"
                min="0"
                required
                placeholder="250.00"
                className="dt-filter-input"
              />
            </Field>

            <Field label="Earned date">
              <input
                name="earned_date"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                className="dt-filter-input"
              />
            </Field>

            <Field label="Recruiter name (recruiter bonus)">
              <input
                name="recruiter_name"
                type="text"
                placeholder="Leangel · Estefany · …"
                className="dt-filter-input"
              />
            </Field>

            <Field label="Referring employee (referral bonus)">
              <select name="referrer_employee_id" defaultValue="" className="dt-filter-input">
                <option value="">—</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.full_name}</option>
                ))}
              </select>
            </Field>

            <div
              style={{
                marginTop: 4,
                paddingTop: 12,
                borderTop: "1px solid var(--dt-warm-100)",
                fontSize: 10.5,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--dt-warm-500)",
              }}
            >
              About the hire
            </div>

            <Field label="Placed employee">
              <select name="employee_id" defaultValue="" className="dt-filter-input">
                <option value="">—</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.full_name}</option>
                ))}
              </select>
            </Field>

            <Field label="…or candidate (pre-hire)">
              <select name="candidate_id" defaultValue="" className="dt-filter-input">
                <option value="">—</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>{c.full_name}</option>
                ))}
              </select>
            </Field>

            <Field label="…or just a name">
              <input
                name="subject_name"
                type="text"
                placeholder="Name (if no employee / candidate record yet)"
                className="dt-filter-input"
              />
            </Field>

            <Field label="Position (optional)">
              <select name="position_id" defaultValue="" className="dt-filter-input">
                <option value="">—</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>{p.role_title}</option>
                ))}
              </select>
            </Field>

            <Field label="Client (optional)">
              <select name="client_id" defaultValue="" className="dt-filter-input">
                <option value="">—</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>

            <Field label="Notes">
              <textarea
                name="notes"
                rows={2}
                className="dt-filter-input"
                style={{ resize: "vertical", minHeight: 50 }}
              />
            </Field>

            <button type="submit" className="dt-btn dt-btn-primary" style={{ marginTop: 4 }}>
              <span>Log Bonus</span>
            </button>
          </form>
        </aside>
      </div>
    </Shell>
  );
}

function BonusRowView({ bonus }: { bonus: BonusRow }) {
  const paidTo =
    bonus.kind === "recruiter"
      ? bonus.recruiter_name ?? "—"
      : bonus.referrer_employee?.full_name ?? "—";

  const subjectName =
    bonus.subject_employee?.full_name ??
    bonus.subject_candidate?.full_name ??
    bonus.subject_name ??
    "—";
  const subjectHref = bonus.subject_employee
    ? `/employees/${bonus.subject_employee.id}`
    : bonus.subject_candidate
    ? `/candidates/${bonus.subject_candidate.id}`
    : null;

  return (
    <tr>
      <td style={{ paddingLeft: 22 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <Badge tone={BONUS_KIND_TONE[bonus.kind]}>{BONUS_KIND_LABEL[bonus.kind]}</Badge>
          <Badge tone={BONUS_STATUS_TONE[bonus.status]}>{BONUS_STATUS_LABEL[bonus.status]}</Badge>
        </div>
      </td>
      <td>
        {bonus.kind === "referral" && bonus.referrer_employee ? (
          <Link
            href={`/employees/${bonus.referrer_employee.id}`}
            className="dt-person dt-person-link"
          >
            <Avatar name={bonus.referrer_employee.full_name} />
            <div>
              <div className="name">{bonus.referrer_employee.full_name}</div>
              <div className="meta">Referrer</div>
            </div>
          </Link>
        ) : (
          <div style={{ fontSize: 13 }}>
            <div style={{ fontWeight: 500 }}>{paidTo}</div>
            <div className="muted" style={{ fontSize: 10.5 }}>
              {bonus.kind === "recruiter" ? "Recruiter" : "—"}
            </div>
          </div>
        )}
      </td>
      <td>
        {subjectHref ? (
          <Link href={subjectHref} className="dt-person dt-person-link">
            <Avatar name={subjectName} />
            <div>
              <div className="name">{subjectName}</div>
              <div className="meta">
                {bonus.subject_employee
                  ? "Employee"
                  : bonus.subject_candidate
                  ? "Candidate"
                  : "—"}
              </div>
            </div>
          </Link>
        ) : (
          <span style={{ fontSize: 12.5 }}>{subjectName}</span>
        )}
      </td>
      <td className="muted" style={{ fontSize: 12 }}>
        {bonus.position?.role_title ?? "—"}
        {bonus.client && (
          <div className="tiny" style={{ color: "var(--dt-warm-500)", marginTop: 2 }}>
            {bonus.client.name}
          </div>
        )}
      </td>
      <td className="tab-num" style={{ textAlign: "right", fontSize: 13, fontWeight: 500 }}>
        {fmtMoney(bonus.amount)}
      </td>
      <td className="tab-num" style={{ fontSize: 12 }}>
        <div>{fmtDate(bonus.earned_date)}</div>
        {bonus.status === "paid" && bonus.paid_at && (
          <div className="muted" style={{ fontSize: 10.5 }}>
            paid {fmtDate(bonus.paid_at)}
          </div>
        )}
        {bonus.status === "approved" && bonus.approved_at && (
          <div className="muted" style={{ fontSize: 10.5 }}>
            approved {fmtDate(bonus.approved_at)}
          </div>
        )}
      </td>
      <td style={{ paddingRight: 22 }}>
        <BonusActions bonus={bonus} />
      </td>
    </tr>
  );
}

function BonusActions({ bonus }: { bonus: BonusRow }) {
  if (bonus.status === "pending") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
        <StatusBtn id={bonus.id} status="approved" label="Approve" />
        <StatusBtn id={bonus.id} status="void" label="Void" subtle />
      </div>
    );
  }
  if (bonus.status === "approved") {
    return <MarkPaidForm id={bonus.id} />;
  }
  if (bonus.status === "paid") {
    return (
      <div className="tiny muted" style={{ textAlign: "right" }}>
        {bonus.payout_method ?? "—"}
        {bonus.payout_reference && <div>{bonus.payout_reference}</div>}
      </div>
    );
  }
  return (
    <StatusBtn id={bonus.id} status="pending" label="Reopen" subtle />
  );
}

function StatusBtn({
  id,
  status,
  label,
  subtle,
}: {
  id: string;
  status: BonusStatus;
  label: string;
  subtle?: boolean;
}) {
  return (
    <form
      action={async () => {
        "use server";
        await setBonusStatus(id, status);
      }}
    >
      <button
        type="submit"
        className={subtle ? "dt-btn dt-btn-ghost" : "dt-btn"}
        style={{ padding: "5px 10px", fontSize: 9.5, letterSpacing: "0.14em" }}
      >
        <span>{label}</span>
      </button>
    </form>
  );
}

function MarkPaidForm({ id }: { id: string }) {
  return (
    <form
      action={async (fd: FormData) => {
        "use server";
        await markBonusPaid(id, fd);
      }}
      style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}
    >
      <input
        name="paid_at"
        type="date"
        defaultValue={new Date().toISOString().slice(0, 10)}
        className="dt-filter-input"
        style={{ padding: "3px 6px", fontSize: 11, width: 130 }}
      />
      <input
        name="payout_method"
        type="text"
        placeholder="payroll / check"
        className="dt-filter-input"
        style={{ padding: "3px 6px", fontSize: 11, width: 130 }}
      />
      <input
        name="payout_reference"
        type="text"
        placeholder="check # / period"
        className="dt-filter-input"
        style={{ padding: "3px 6px", fontSize: 11, width: 130 }}
      />
      <button
        type="submit"
        className="dt-btn dt-btn-gold"
        style={{ padding: "5px 10px", fontSize: 9.5, letterSpacing: "0.14em" }}
      >
        <span>Mark Paid</span>
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
