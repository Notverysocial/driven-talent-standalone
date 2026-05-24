import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import {
  listClientsForPicker,
  listEmployeesForPicker,
  listExpenses,
  listReimbursements,
} from "@/lib/expenses.server";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABEL,
  EXPENSE_CATEGORY_TONE,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  REIMBURSEMENT_CATEGORIES,
  REIMBURSEMENT_CATEGORY_LABEL,
  REIMBURSEMENT_STATUS_LABEL,
  REIMBURSEMENT_STATUS_TONE,
  fmtDate,
  fmtMoney,
} from "@/lib/expenses";
import type {
  ExpenseCategory,
  ExpensePaymentMethod,
  ReimbursementCategory,
} from "@/lib/supabase/types";
import {
  createExpense,
  createReimbursement,
  setReimbursementStatus,
} from "./actions";

type View = "reimbursements" | "expenses";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const sp = await searchParams;
  const view: View = sp.view === "expenses" ? "expenses" : "reimbursements";

  const [reimbursements, expenses, employees, clients] = await Promise.all([
    listReimbursements(),
    listExpenses(),
    listEmployeesForPicker(),
    listClientsForPicker(),
  ]);

  const pendingReimb = reimbursements.filter((r) => r.status === "submitted").length;
  const approvedReimb = reimbursements.filter((r) => r.status === "approved").length;
  const reimbOwed = reimbursements
    .filter((r) => r.status === "approved" || r.status === "submitted")
    .reduce((s, r) => s + Number(r.amount), 0);

  const ytdStart = `${new Date().getFullYear()}-01-01`;
  const ytdExpenses = expenses
    .filter((e) => e.expense_date >= ytdStart)
    .reduce((s, e) => s + Number(e.amount), 0);

  const mtdStart = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;
  const mtdExpenses = expenses
    .filter((e) => e.expense_date >= mtdStart)
    .reduce((s, e) => s + Number(e.amount), 0);

  return (
    <Shell>
      <Topbar
        crumb="WORKSPACE / PAYROLL & FINANCE / EXPENSES"
        scriptWord={view === "reimbursements" ? "Reimbursement " : "Business "}
        title={view === "reimbursements" ? "Requests" : "Expenses"}
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
          label="Pending Reimb."
          value={String(pendingReimb)}
          sub="awaiting approval"
          accent={pendingReimb > 0 ? "var(--dt-warning)" : "var(--dt-black)"}
        />
        <KPI
          label="Approved · Unpaid"
          value={String(approvedReimb)}
          sub="ready to pay"
          accent={approvedReimb > 0 ? "var(--dt-gold-deep)" : "var(--dt-black)"}
        />
        <KPI label="Owed to Employees" value={fmtMoney(reimbOwed)} sub="submitted + approved" />
        <KPI label="MTD Expenses" value={fmtMoney(mtdExpenses)} sub="this month" />
        <KPI label="YTD Expenses" value={fmtMoney(ytdExpenses)} sub="calendar year" />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <Link
          href="/expenses"
          className={"dt-chip" + (view === "reimbursements" ? " active" : "")}
        >
          Reimbursements · {reimbursements.length}
        </Link>
        <Link
          href="/expenses?view=expenses"
          className={"dt-chip" + (view === "expenses" ? " active" : "")}
        >
          Expenses · {expenses.length}
        </Link>
      </div>

      {view === "reimbursements" ? (
        <ReimbursementsView
          reimbursements={reimbursements}
          employees={employees}
          clients={clients}
        />
      ) : (
        <ExpensesView expenses={expenses} clients={clients} />
      )}
    </Shell>
  );
}

function ReimbursementsView({
  reimbursements,
  employees,
  clients,
}: {
  reimbursements: Awaited<ReturnType<typeof listReimbursements>>;
  employees: Awaited<ReturnType<typeof listEmployeesForPicker>>;
  clients: Awaited<ReturnType<typeof listClientsForPicker>>;
}) {
  return (
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
              {reimbursements.length} {reimbursements.length === 1 ? "request" : "requests"} on file
            </h3>
            <div className="sub">Most recent submissions first</div>
          </div>
        </div>
        <div style={{ padding: 0 }}>
          {reimbursements.length === 0 && (
            <div
              style={{
                padding: "48px 22px",
                textAlign: "center",
                color: "var(--dt-warm-500)",
                fontStyle: "italic",
              }}
            >
              No reimbursement requests yet.
            </div>
          )}
          {reimbursements.map((r) => (
            <div
              key={r.id}
              style={{
                padding: "18px 26px",
                borderBottom: "1px solid var(--dt-warm-100)",
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto",
                gap: 14,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <Link
                    href={`/employees/${r.employee.id}`}
                    className="dt-person dt-person-link"
                    style={{ fontSize: 12 }}
                  >
                    <Avatar name={r.employee.full_name} />
                    <div>
                      <div className="name" style={{ fontSize: 13 }}>
                        {r.employee.full_name}
                      </div>
                      <div className="meta" style={{ fontSize: 10 }}>
                        {r.client?.name ?? "—"} · {fmtDate(r.expense_date)}
                      </div>
                    </div>
                  </Link>
                  <div
                    className="tab-num"
                    style={{
                      fontFamily: "var(--dt-display)",
                      fontSize: 22,
                      fontWeight: 300,
                      marginLeft: "auto",
                      color: "var(--dt-black)",
                    }}
                  >
                    {fmtMoney(Number(r.amount))}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <Badge tone={REIMBURSEMENT_STATUS_TONE[r.status]}>
                    {REIMBURSEMENT_STATUS_LABEL[r.status]}
                  </Badge>
                  <Badge tone="warm">{REIMBURSEMENT_CATEGORY_LABEL[r.category]}</Badge>
                  {r.payment_method && (
                    <Badge tone="dark">{PAYMENT_METHOD_LABEL[r.payment_method]}</Badge>
                  )}
                </div>

                <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--dt-warm-700)", lineHeight: 1.5 }}>
                  {r.description}
                </div>

                {r.receipt_url && (
                  <div style={{ marginTop: 6, fontSize: 11.5 }}>
                    <a
                      href={r.receipt_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "var(--dt-gold-deep)" }}
                    >
                      View receipt ↗
                    </a>
                  </div>
                )}

                <div style={{ marginTop: 8, fontSize: 10.5, color: "var(--dt-warm-500)", display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <span>Submitted {fmtDate(r.submitted_at)}</span>
                  {r.approved_at && <span>Approved {fmtDate(r.approved_at)}{r.approved_by ? ` by ${r.approved_by}` : ""}</span>}
                  {r.paid_at && <span>Paid {fmtDate(r.paid_at)}{r.paid_reference ? ` · ${r.paid_reference}` : ""}</span>}
                  {r.rejected_reason && <span style={{ color: "var(--dt-danger)" }}>Rejected: {r.rejected_reason}</span>}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                {r.status === "submitted" && (
                  <>
                    <ApproveBtn id={r.id} employeeId={r.employee.id} />
                    <RejectBtn id={r.id} employeeId={r.employee.id} />
                  </>
                )}
                {r.status === "approved" && <PayBtn id={r.id} employeeId={r.employee.id} />}
              </div>
            </div>
          ))}
        </div>
      </div>

      <aside className="dt-card" style={{ padding: 0 }}>
        <div className="dt-card-head">
          <div>
            <h3>Submit Reimbursement</h3>
            <div className="sub">Out-of-pocket expense</div>
          </div>
        </div>
        <form
          action={createReimbursement}
          style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 12 }}
        >
          <Field label="Employee">
            <select name="employee_id" required className="dt-filter-input" defaultValue="">
              <option value="">Select employee…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.full_name}</option>
              ))}
            </select>
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Amount ($)">
              <input
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                required
                className="dt-filter-input"
                placeholder="0.00"
              />
            </Field>
            <Field label="Expense Date">
              <input
                name="expense_date"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
                className="dt-filter-input"
              />
            </Field>
          </div>

          <Field label="Category">
            <select name="category" required defaultValue="other" className="dt-filter-input">
              {REIMBURSEMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>{REIMBURSEMENT_CATEGORY_LABEL[c as ReimbursementCategory]}</option>
              ))}
            </select>
          </Field>

          <Field label="Description (required)">
            <textarea
              name="description"
              rows={3}
              required
              className="dt-filter-input"
              style={{ resize: "vertical", minHeight: 60 }}
              placeholder="What was this for?"
            />
          </Field>

          <Field label="Bill to client (optional)">
            <select name="client_id" className="dt-filter-input" defaultValue="">
              <option value="">—</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>

          <Field label="Receipt URL">
            <input
              name="receipt_url"
              type="url"
              className="dt-filter-input"
              placeholder="https://…"
            />
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
            <span>Submit Request</span>
          </button>
        </form>
      </aside>
    </div>
  );
}

function ExpensesView({
  expenses,
  clients,
}: {
  expenses: Awaited<ReturnType<typeof listExpenses>>;
  clients: Awaited<ReturnType<typeof listClientsForPicker>>;
}) {
  return (
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
              {expenses.length} {expenses.length === 1 ? "expense" : "expenses"} logged
            </h3>
            <div className="sub">Newest first</div>
          </div>
        </div>
        <div className="dt-table-wrap">
          <table className="dt-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 22 }}>Date</th>
                <th>Vendor</th>
                <th>Category</th>
                <th>Method</th>
                <th>Client</th>
                <th style={{ textAlign: "right", paddingRight: 22 }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id}>
                  <td style={{ paddingLeft: 22 }} className="tab-num">
                    {fmtDate(e.expense_date)}
                  </td>
                  <td>
                    <div style={{ fontSize: 13 }}>{e.vendor ?? "—"}</div>
                    {e.description && (
                      <div className="muted" style={{ fontSize: 11 }}>
                        {e.description}
                      </div>
                    )}
                    {e.reference && (
                      <div className="muted" style={{ fontSize: 10.5 }}>
                        Ref · {e.reference}
                      </div>
                    )}
                  </td>
                  <td>
                    <Badge tone={EXPENSE_CATEGORY_TONE[e.category]}>
                      {EXPENSE_CATEGORY_LABEL[e.category]}
                    </Badge>
                  </td>
                  <td className="muted" style={{ fontSize: 11.5 }}>
                    {e.payment_method ? PAYMENT_METHOD_LABEL[e.payment_method] : "—"}
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {e.client?.name ?? "—"}
                    {e.reimbursable && (
                      <div style={{ fontSize: 10, color: "var(--dt-gold-deep)" }}>billable</div>
                    )}
                  </td>
                  <td
                    className="tab-num"
                    style={{ textAlign: "right", paddingRight: 22, fontSize: 13 }}
                  >
                    {fmtMoney(Number(e.amount))}
                  </td>
                </tr>
              ))}
              {expenses.length === 0 && (
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
                    No expenses logged yet.
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
            <h3>Log Expense</h3>
            <div className="sub">Business outlay</div>
          </div>
        </div>
        <form
          action={createExpense}
          style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 12 }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Amount ($)">
              <input
                name="amount"
                type="number"
                step="0.01"
                min="0"
                required
                className="dt-filter-input"
                placeholder="0.00"
              />
            </Field>
            <Field label="Date">
              <input
                name="expense_date"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
                className="dt-filter-input"
              />
            </Field>
          </div>

          <Field label="Category">
            <select name="category" required defaultValue="other" className="dt-filter-input">
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{EXPENSE_CATEGORY_LABEL[c as ExpenseCategory]}</option>
              ))}
            </select>
          </Field>

          <Field label="Vendor">
            <input name="vendor" type="text" className="dt-filter-input" placeholder="Who was paid" />
          </Field>

          <Field label="Description">
            <textarea
              name="description"
              rows={2}
              className="dt-filter-input"
              style={{ resize: "vertical", minHeight: 50 }}
            />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Payment method">
              <select name="payment_method" className="dt-filter-input" defaultValue="">
                <option value="">—</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABEL[m as ExpensePaymentMethod]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Reference">
              <input
                name="reference"
                type="text"
                className="dt-filter-input"
                placeholder="Check #, invoice #"
              />
            </Field>
          </div>

          <Field label="Bill to client (optional)">
            <select name="client_id" className="dt-filter-input" defaultValue="">
              <option value="">—</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>

          <label
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              fontSize: 12,
              color: "var(--dt-warm-700)",
            }}
          >
            <input type="checkbox" name="reimbursable" />
            Billable / pass-through to client
          </label>

          <Field label="Receipt URL">
            <input
              name="receipt_url"
              type="url"
              className="dt-filter-input"
              placeholder="https://…"
            />
          </Field>

          <Field label="Logged by">
            <input name="created_by" type="text" className="dt-filter-input" placeholder="Your name" />
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
            <span>Log Expense</span>
          </button>
        </form>
      </aside>
    </div>
  );
}

function ApproveBtn({ id, employeeId }: { id: string; employeeId: string }) {
  return (
    <form
      action={async (formData: FormData) => {
        "use server";
        const approvedBy = ((formData.get("approved_by") as string) || "").trim() || undefined;
        await setReimbursementStatus(id, employeeId, "approved", { approved_by: approvedBy });
      }}
      style={{ display: "flex", gap: 4, alignItems: "center" }}
    >
      <input
        name="approved_by"
        type="text"
        placeholder="Approver"
        className="dt-filter-input"
        style={{ width: 92, fontSize: 11, padding: "4px 6px" }}
      />
      <button
        type="submit"
        className="dt-btn dt-btn-primary"
        style={{ padding: "5px 10px", fontSize: 9.5, letterSpacing: "0.14em" }}
      >
        <span>Approve</span>
      </button>
    </form>
  );
}

function RejectBtn({ id, employeeId }: { id: string; employeeId: string }) {
  return (
    <form
      action={async (formData: FormData) => {
        "use server";
        const reason = ((formData.get("rejected_reason") as string) || "").trim() || undefined;
        await setReimbursementStatus(id, employeeId, "rejected", { rejected_reason: reason });
      }}
      style={{ display: "flex", gap: 4, alignItems: "center" }}
    >
      <input
        name="rejected_reason"
        type="text"
        placeholder="Reason"
        className="dt-filter-input"
        style={{ width: 92, fontSize: 11, padding: "4px 6px" }}
      />
      <button
        type="submit"
        className="dt-btn"
        style={{ padding: "5px 10px", fontSize: 9.5, letterSpacing: "0.14em" }}
      >
        <span>Reject</span>
      </button>
    </form>
  );
}

function PayBtn({ id, employeeId }: { id: string; employeeId: string }) {
  return (
    <form
      action={async (formData: FormData) => {
        "use server";
        const paymentMethodRaw = ((formData.get("payment_method") as string) || "").trim();
        const paymentMethod =
          paymentMethodRaw && PAYMENT_METHODS.includes(paymentMethodRaw as ExpensePaymentMethod)
            ? (paymentMethodRaw as ExpensePaymentMethod)
            : undefined;
        const ref = ((formData.get("paid_reference") as string) || "").trim() || undefined;
        await setReimbursementStatus(id, employeeId, "paid", {
          payment_method: paymentMethod,
          paid_reference: ref,
        });
      }}
      style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}
    >
      <select
        name="payment_method"
        className="dt-filter-input"
        defaultValue="ach"
        style={{ width: 78, fontSize: 11, padding: "4px 6px" }}
      >
        {PAYMENT_METHODS.map((m) => (
          <option key={m} value={m}>
            {PAYMENT_METHOD_LABEL[m as ExpensePaymentMethod]}
          </option>
        ))}
      </select>
      <input
        name="paid_reference"
        type="text"
        placeholder="Ref"
        className="dt-filter-input"
        style={{ width: 78, fontSize: 11, padding: "4px 6px" }}
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
