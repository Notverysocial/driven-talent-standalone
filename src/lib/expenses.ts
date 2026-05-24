// Reimbursements + Expenses — client-safe labels, tones, and formatters.
// Matches supabase/migrations/0009_reimbursements_expenses.sql.

import type { BadgeTone } from "@/components/Badge";
import type {
  ExpenseCategory,
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

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  rent: "Rent",
  utilities: "Utilities",
  software: "Software",
  marketing: "Marketing",
  insurance: "Insurance",
  supplies: "Supplies",
  travel: "Travel",
  meals: "Meals",
  professional_services: "Professional Services",
  payroll: "Payroll",
  taxes: "Taxes",
  equipment: "Equipment",
  other: "Other",
};

export const EXPENSE_CATEGORY_TONE: Record<ExpenseCategory, BadgeTone> = {
  rent: "dark",
  utilities: "warm",
  software: "gold",
  marketing: "amber",
  insurance: "dark",
  supplies: "warm",
  travel: "amber",
  meals: "warm",
  professional_services: "gold",
  payroll: "dark",
  taxes: "red",
  equipment: "warm",
  other: "warm",
};

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "rent",
  "utilities",
  "software",
  "marketing",
  "insurance",
  "supplies",
  "travel",
  "meals",
  "professional_services",
  "payroll",
  "taxes",
  "equipment",
  "other",
];

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
