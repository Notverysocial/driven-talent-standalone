import "server-only";
import { createClient } from "./supabase/server";
import type {
  Employee,
  Expense,
  ExpenseCategoryRow,
  ReimbursementRequest,
} from "./supabase/types";

// ---------- Expense categories (lookup table, migration 0029) ------------

export async function listExpenseCategories(opts?: {
  includeInactive?: boolean;
}): Promise<ExpenseCategoryRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("expense_categories")
    .select("*")
    .order("sort", { ascending: true })
    .order("label", { ascending: true });
  if (!opts?.includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as ExpenseCategoryRow[];
}

// ---------- Reimbursements ----------------------------------------------

export type ReimbursementRow = ReimbursementRequest & {
  employee: Pick<Employee, "id" | "full_name">;
  client: { id: string; name: string } | null;
};

export async function listReimbursements(opts?: {
  status?: string;
}): Promise<ReimbursementRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("reimbursement_requests")
    .select(`*, employees ( id, full_name ), clients ( id, name )`)
    .order("submitted_at", { ascending: false });
  if (opts?.status) q = q.eq("status", opts.status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  type Row = ReimbursementRequest & {
    employees: Pick<Employee, "id" | "full_name">;
    clients: { id: string; name: string } | null;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    ...r,
    employee: r.employees,
    client: r.clients,
  }));
}

// ---------- Expenses ----------------------------------------------------

export type ExpenseRow = Expense & {
  client: { id: string; name: string } | null;
};

export async function listExpenses(opts?: {
  category?: string;
}): Promise<ExpenseRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("expenses")
    .select(`*, clients ( id, name )`)
    .order("expense_date", { ascending: false });
  if (opts?.category) q = q.eq("category", opts.category);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  type Row = Expense & {
    clients: { id: string; name: string } | null;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    ...r,
    client: r.clients,
  }));
}

// ---------- Pickers ------------------------------------------------------

export async function listEmployeesForPicker(): Promise<
  Pick<Employee, "id" | "full_name">[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select("id, full_name, status")
    .neq("status", "inactive")
    .order("full_name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Pick<Employee, "id" | "full_name">[];
}

export async function listClientsForPicker(): Promise<
  { id: string; name: string }[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id, name")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; name: string }[];
}
