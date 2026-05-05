import type { InvoiceStatus } from "./supabase/types";

export const INVOICE_STATUSES: { id: InvoiceStatus; label: string; tone: "warm" | "amber" | "green" | "red" | "dark" }[] = [
  { id: "draft",    label: "Draft",    tone: "warm" },
  { id: "sent",     label: "Sent",     tone: "amber" },
  { id: "paid",     label: "Paid",     tone: "green" },
  { id: "overdue",  label: "Overdue",  tone: "red" },
  { id: "void",     label: "Void",     tone: "dark" },
];

export function nextInvoiceNumber(count: number): string {
  const year = new Date().getFullYear();
  return `DT-${year}-${String(count + 1).padStart(4, "0")}`;
}

export function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtPeriod(start: string, end: string): string {
  const s = new Date(start + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const e = new Date(end + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${s} — ${e}`;
}
