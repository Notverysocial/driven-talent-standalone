"use server";

// AUTH: every export below is a directly-invocable endpoint, not a private
// function — Next compiles each one into its own addressable POST. The gate
// belongs on the ACTION, not only on the page that happens to render it.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  PAYMENT_METHODS,
  REIMBURSEMENT_CATEGORIES,
  asBadgeTone,
  slugifyCategory,
} from "@/lib/expenses";
import type {
  ExpensePaymentMethod,
  ReimbursementCategory,
  ReimbursementStatus,
} from "@/lib/supabase/types";
import { requireUser } from "@/lib/auth.server";

// Returns the set of valid (active or not) category slugs so we can give a
// friendly error instead of a raw FK violation.
async function validExpenseCategorySlugs(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("expense_categories")
    .select("slug");
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r: { slug: string }) => r.slug));
}

const REIMBURSEMENT_STATUSES: ReimbursementStatus[] = [
  "submitted",
  "approved",
  "rejected",
  "paid",
];

// ---------- Reimbursements ----------------------------------------------

export async function createReimbursement(formData: FormData) {
  await requireUser();
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
  await requireUser();
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
  await requireUser();
  const supabase = await createClient();

  const category = ((formData.get("category") as string) || "other").trim();
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

  const validCats = await validExpenseCategorySlugs(supabase);
  if (!validCats.has(category)) {
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

export async function updateExpense(id: string, formData: FormData) {
  await requireUser();
  if (!id) throw new Error("id is required");
  const supabase = await createClient();

  const category = ((formData.get("category") as string) || "other").trim();
  const amountRaw = (formData.get("amount") as string)?.trim();
  const expenseDate = (formData.get("expense_date") as string)?.trim();
  const paymentMethodRaw = ((formData.get("payment_method") as string) || "").trim();
  const paymentMethod =
    paymentMethodRaw && PAYMENT_METHODS.includes(paymentMethodRaw as ExpensePaymentMethod)
      ? (paymentMethodRaw as ExpensePaymentMethod)
      : null;

  const validCats = await validExpenseCategorySlugs(supabase);
  if (!validCats.has(category)) throw new Error(`Invalid category: ${category}`);
  if (!amountRaw) throw new Error("Amount is required");
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Amount must be a non-negative number");
  }
  if (!expenseDate) throw new Error("Expense date is required");

  const { error } = await supabase
    .from("expenses")
    .update({
      category,
      amount,
      expense_date: expenseDate,
      vendor: ((formData.get("vendor") as string) || "").trim() || null,
      description: ((formData.get("description") as string) || "").trim() || null,
      payment_method: paymentMethod,
      client_id: ((formData.get("client_id") as string) || "").trim() || null,
      reimbursable: formData.get("reimbursable") === "on",
      reference: ((formData.get("reference") as string) || "").trim() || null,
      notes: ((formData.get("notes") as string) || "").trim() || null,
      receipt_url: ((formData.get("receipt_url") as string) || "").trim() || null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/expenses");
}

export async function deleteExpense(id: string) {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/expenses");
}

// ---------- Expense category management (CR #9) -------------------------

export async function createExpenseCategory(formData: FormData) {
  await requireUser();
  const supabase = await createClient();
  const label = ((formData.get("label") as string) || "").trim();
  if (!label) throw new Error("Category name is required");
  const slug = slugifyCategory(label);
  if (!slug) throw new Error("Category name must contain letters or numbers");
  const tone = asBadgeTone((formData.get("tone") as string) || "warm");

  // Place new categories just before "other" if present, else at the end.
  const { data: maxRow } = await supabase
    .from("expense_categories")
    .select("sort")
    .order("sort", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sort = (Number(maxRow?.sort ?? 0) || 0) + 10;

  const { error } = await supabase
    .from("expense_categories")
    .insert({ slug, label, tone, sort });
  if (error) {
    if (error.code === "23505") {
      throw new Error(`A category with the key "${slug}" already exists`);
    }
    throw new Error(error.message);
  }
  revalidatePath("/expenses");
}

export async function updateExpenseCategory(id: string, formData: FormData) {
  await requireUser();
  if (!id) throw new Error("id is required");
  const supabase = await createClient();
  const label = ((formData.get("label") as string) || "").trim();
  if (!label) throw new Error("Category name is required");
  const tone = asBadgeTone((formData.get("tone") as string) || "warm");

  // Rename = change the display label (and tone). The slug stays stable so
  // existing expenses keep pointing at the same category.
  const { error } = await supabase
    .from("expense_categories")
    .update({ label, tone })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/expenses");
}

export async function setExpenseCategoryActive(id: string, isActive: boolean) {
  await requireUser();
  if (!id) throw new Error("id is required");
  const supabase = await createClient();
  const { error } = await supabase
    .from("expense_categories")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/expenses");
}
