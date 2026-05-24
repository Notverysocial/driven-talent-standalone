"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  REIMBURSEMENT_CATEGORIES,
} from "@/lib/expenses";
import type {
  ExpenseCategory,
  ExpensePaymentMethod,
  ReimbursementCategory,
  ReimbursementStatus,
} from "@/lib/supabase/types";

const REIMBURSEMENT_STATUSES: ReimbursementStatus[] = [
  "submitted",
  "approved",
  "rejected",
  "paid",
];

// ---------- Reimbursements ----------------------------------------------

export async function createReimbursement(formData: FormData) {
  const supabase = await createClient();

  const employeeId = (formData.get("employee_id") as string)?.trim();
  const amountRaw = (formData.get("amount") as string)?.trim();
  const category = (formData.get("category") as ReimbursementCategory) || "other";
  const description = (formData.get("description") as string)?.trim();
  const expenseDate = (formData.get("expense_date") as string)?.trim();
  const clientId = ((formData.get("client_id") as string) || "").trim() || null;
  const receiptUrl = ((formData.get("receipt_url") as string) || "").trim() || null;
  const notes = ((formData.get("notes") as string) || "").trim() || null;

  if (!employeeId) throw new Error("Employee is required");
  if (!amountRaw) throw new Error("Amount is required");
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be a positive number");
  }
  if (!REIMBURSEMENT_CATEGORIES.includes(category)) {
    throw new Error(`Invalid category: ${category}`);
  }
  if (!description) throw new Error("Description is required");
  if (!expenseDate) throw new Error("Expense date is required");

  const { error } = await supabase.from("reimbursement_requests").insert({
    employee_id: employeeId,
    amount,
    category,
    description,
    expense_date: expenseDate,
    status: "submitted",
    client_id: clientId,
    receipt_url: receiptUrl,
    notes,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/expenses");
  revalidatePath(`/employees/${employeeId}`);
}

export async function setReimbursementStatus(
  id: string,
  employeeId: string,
  status: ReimbursementStatus,
  meta?: { approved_by?: string; paid_reference?: string; payment_method?: ExpensePaymentMethod; rejected_reason?: string },
) {
  if (!REIMBURSEMENT_STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
  const supabase = await createClient();

  const update: Record<string, unknown> = { status };
  const now = new Date().toISOString();
  if (status === "approved") {
    update.approved_at = now;
    if (meta?.approved_by) update.approved_by = meta.approved_by;
  }
  if (status === "rejected") {
    update.rejected_at = now;
    if (meta?.rejected_reason) update.rejected_reason = meta.rejected_reason;
  }
  if (status === "paid") {
    update.paid_at = now;
    if (meta?.paid_reference) update.paid_reference = meta.paid_reference;
    if (meta?.payment_method) update.payment_method = meta.payment_method;
  }

  const { error } = await supabase
    .from("reimbursement_requests")
    .update(update)
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/expenses");
  revalidatePath(`/employees/${employeeId}`);
}

// ---------- Expenses ----------------------------------------------------

export async function createExpense(formData: FormData) {
  const supabase = await createClient();

  const category = (formData.get("category") as ExpenseCategory) || "other";
  const amountRaw = (formData.get("amount") as string)?.trim();
  const expenseDate = (formData.get("expense_date") as string)?.trim();
  const vendor = ((formData.get("vendor") as string) || "").trim() || null;
  const description = ((formData.get("description") as string) || "").trim() || null;
  const paymentMethodRaw = ((formData.get("payment_method") as string) || "").trim();
  const paymentMethod =
    paymentMethodRaw && PAYMENT_METHODS.includes(paymentMethodRaw as ExpensePaymentMethod)
      ? (paymentMethodRaw as ExpensePaymentMethod)
      : null;
  const clientId = ((formData.get("client_id") as string) || "").trim() || null;
  const reimbursable = formData.get("reimbursable") === "on";
  const reference = ((formData.get("reference") as string) || "").trim() || null;
  const notes = ((formData.get("notes") as string) || "").trim() || null;
  const receiptUrl = ((formData.get("receipt_url") as string) || "").trim() || null;
  const createdBy = ((formData.get("created_by") as string) || "").trim() || null;

  if (!EXPENSE_CATEGORIES.includes(category)) {
    throw new Error(`Invalid category: ${category}`);
  }
  if (!amountRaw) throw new Error("Amount is required");
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Amount must be a non-negative number");
  }
  if (!expenseDate) throw new Error("Expense date is required");

  const { error } = await supabase.from("expenses").insert({
    category,
    amount,
    expense_date: expenseDate,
    vendor,
    description,
    payment_method: paymentMethod,
    client_id: clientId,
    reimbursable,
    reference,
    notes,
    receipt_url: receiptUrl,
    created_by: createdBy,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/expenses");
}

export async function deleteExpense(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/expenses");
}
