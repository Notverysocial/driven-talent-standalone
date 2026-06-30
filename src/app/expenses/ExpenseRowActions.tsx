"use client";

import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABEL } from "@/lib/expenses";
import type {
  Expense,
  ExpenseCategoryRow,
  ExpensePaymentMethod,
} from "@/lib/supabase/types";
import { deleteExpense, updateExpense } from "./actions";

type ExpenseRow = Expense & { client: { id: string; name: string } | null };

export function ExpenseRowActions({
  expense,
  clients,
  categories,
}: {
  expense: ExpenseRow;
  clients: { id: string; name: string }[];
  categories: ExpenseCategoryRow[];
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // Ensure the expense's current category is selectable even if archived.
  const catOptions = categories.some((c) => c.slug === expense.category)
    ? categories
    : [
        ...categories,
        {
          slug: expense.category,
          label: expense.category,
        } as Pick<ExpenseCategoryRow, "slug" | "label">,
      ];

  return (
    <>
      <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
        <button
          type="button"
          className="dt-btn dt-btn-ghost"
          style={{ padding: "4px 8px", fontSize: 11 }}
          onClick={() => setEditOpen(true)}
        >
          Edit
        </button>
        <button
          type="button"
          className="dt-btn dt-btn-ghost"
          style={{ padding: "4px 8px", fontSize: 11, color: "var(--dt-danger)" }}
          onClick={() => setDeleteOpen(true)}
        >
          ✕
        </button>
      </div>

      {editOpen && (
        <div
          className="dt-cal-dialog-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditOpen(false);
          }}
        >
          <div className="dt-cal-dialog" role="dialog" aria-modal="true">
            <div className="dt-cal-dialog-head">
              <div>
                <div className="crumb">Edit expense</div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 300, letterSpacing: "0.06em" }}>
                  {expense.vendor ?? "Expense"}
                </h3>
              </div>
              <button
                type="button"
                className="dt-btn dt-btn-ghost tiny"
                onClick={() => setEditOpen(false)}
              >
                Close ✕
              </button>
            </div>

            <form
              action={updateExpense.bind(null, expense.id)}
              onSubmit={() => setEditOpen(false)}
              className="dt-cal-dialog-body"
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Amount ($)">
                  <input
                    name="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    defaultValue={String(expense.amount)}
                    className="dt-filter-input"
                  />
                </Field>
                <Field label="Date">
                  <input
                    name="expense_date"
                    type="date"
                    required
                    defaultValue={expense.expense_date}
                    className="dt-filter-input"
                  />
                </Field>
              </div>

              <Field label="Category">
                <select name="category" required defaultValue={expense.category} className="dt-filter-input">
                  {catOptions.map((c) => (
                    <option key={c.slug} value={c.slug}>{c.label}</option>
                  ))}
                </select>
              </Field>

              <Field label="Vendor">
                <input name="vendor" defaultValue={expense.vendor ?? ""} className="dt-filter-input" />
              </Field>

              <Field label="Description">
                <textarea
                  name="description"
                  defaultValue={expense.description ?? ""}
                  rows={2}
                  className="dt-filter-input"
                  style={{ resize: "vertical", minHeight: 50 }}
                />
              </Field>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Payment method">
                  <select
                    name="payment_method"
                    defaultValue={expense.payment_method ?? ""}
                    className="dt-filter-input"
                  >
                    <option value="">—</option>
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {PAYMENT_METHOD_LABEL[m as ExpensePaymentMethod]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Reference">
                  <input name="reference" defaultValue={expense.reference ?? ""} className="dt-filter-input" />
                </Field>
              </div>

              <Field label="Bill to client (optional)">
                <select name="client_id" defaultValue={expense.client_id ?? ""} className="dt-filter-input">
                  <option value="">—</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>

              <label
                style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "var(--dt-warm-700)" }}
              >
                <input type="checkbox" name="reimbursable" defaultChecked={expense.reimbursable} />
                Billable / pass-through to client
              </label>

              <Field label="Receipt URL">
                <input name="receipt_url" type="url" defaultValue={expense.receipt_url ?? ""} className="dt-filter-input" />
              </Field>

              <Field label="Notes">
                <textarea
                  name="notes"
                  defaultValue={expense.notes ?? ""}
                  rows={2}
                  className="dt-filter-input"
                  style={{ resize: "vertical", minHeight: 50 }}
                />
              </Field>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                <button type="button" className="dt-btn" onClick={() => setEditOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="dt-btn dt-btn-gold">
                  <span>Save</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteOpen}
        title="Delete this expense?"
        description="This permanently removes the expense from the ledger."
        confirmLabel="Delete expense"
        destructive
        busy={pending}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() =>
          startTransition(async () => {
            await deleteExpense(expense.id);
            setDeleteOpen(false);
          })
        }
        testId="expense-delete-dialog"
      />
    </>
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
