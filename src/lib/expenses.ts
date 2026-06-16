// Reimbursements + Expenses — client-safe labels, tones, and formatters.
// Matches supabase/migrations/0009_reimbursements_expenses.sql.

import type { BadgeTone } from "@/components/Badge";
import type {
  ExpensePaymentMethod,
  ReimbursementCategory,
  ReimbursementStatus,
} from "./supabase/types";

// ---------- Reimbursement status ----------------------------------------

export const REIMBURSEMENT_STATUS_LABEL: Record<ReimbursementStatus, string> = {
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
  paid: "Paid",
};

export const REIMBURSEMENT_STATUS_TONE: Record<ReimbursementStatus, BadgeTone> = {
  submitted: "amber",
  approved: "gold",
  rejected: "red",
  paid: "green",
};

export const REIMBURSEMENT_STATUSES: ReimbursementStatus[] = [
  "submitted",
  "approved",
  "rejected",
  "paid",
];

// ---------- Reimbursement category --------------------------------------

export const REIMBURSEMENT_CATEGORY_LABEL: Record<ReimbursementCategory, string> = {
  mileage: "Mileage",
  meals: "Meals",
  travel: "Travel",
  supplies: "Supplies",
  equipment: "Equipment",
  training: "Training",
  phone: "Phone",
  uniform: "Uniform",
  other: "Other",
};

export const REIMBURSEMENT_CATEGORIES: ReimbursementCategory[] = [
  "mileage",
  "meals",
  "travel",
  "supplies",
  "equipment",
  "training",
  "phone",
  "uniform",
  "other",
];

// ---------- Expense category --------------------------------------------
// Categories now live in the user-managed `expense_categories` lookup table
// (migration 0029). These helpers operate on the rows fetched at request
// time rather than a hardcoded list.

// Valid badge tones operators can pick when creating/editing a category.
export const EXPENSE_CATEGORY_TONES: BadgeTone[] = [
  "warm",
  "gold",
  "green",
  "amber",
  "red",
  "dark",
];

// Narrow an arbitrary stored tone string to a valid BadgeTone (fallback warm).
export function asBadgeTone(tone: string | null | undefined): BadgeTone {
  return EXPENSE_CATEGORY_TONES.includes(tone as BadgeTone)
    ? (tone as BadgeTone)
    : "warm";
}

// Derive a stable slug from a free-text category label.
export function slugifyCategory(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// ---------- Payment method ----------------------------------------------

export const PAYMENT_METHOD_LABEL: Record<ExpensePaymentMethod, string> = {
  check: "Check",
  ach: "ACH",
  card: "Card",
  cash: "Cash",
  payroll: "Payroll",
  wire: "Wire",
  other: "Other",
};

export const PAYMENT_METHODS: ExpensePaymentMethod[] = [
  "check",
  "ach",
  "card",
  "cash",
  "payroll",
  "wire",
  "other",
];

// ---------- formatters --------------------------------------------------

export function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const date = /T/.test(d) ? new Date(d) : new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
