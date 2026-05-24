// Bonuses module — client-safe types + label tables.
// Matches supabase/migrations/0008_bonuses.sql.

import type { BadgeTone } from "@/components/Badge";

export type BonusKind = "recruiter" | "referral";
export type BonusStatus = "pending" | "approved" | "paid" | "void";

export type Bonus = {
  id: string;
  kind: BonusKind;
  status: BonusStatus;
  amount: number;

  recruiter_name: string | null;
  referrer_employee_id: string | null;

  employee_id: string | null;
  candidate_id: string | null;
  subject_name: string | null;
  position_id: string | null;
  client_id: string | null;

  earned_date: string;
  approved_at: string | null;
  approved_by: string | null;
  paid_at: string | null;
  payout_method: string | null;
  payout_reference: string | null;

  notes: string | null;
  created_at: string;
  updated_at: string;
};

export const BONUS_KIND_LABEL: Record<BonusKind, string> = {
  recruiter: "Recruiter",
  referral: "Referral",
};

export const BONUS_KIND_TONE: Record<BonusKind, BadgeTone> = {
  recruiter: "gold",
  referral: "warm",
};

export const BONUS_STATUSES: { id: BonusStatus; label: string; tone: BadgeTone }[] = [
  { id: "pending",  label: "Pending",  tone: "amber" },
  { id: "approved", label: "Approved", tone: "gold"  },
  { id: "paid",     label: "Paid",     tone: "green" },
  { id: "void",     label: "Void",     tone: "dark"  },
];

export const BONUS_STATUS_LABEL: Record<BonusStatus, string> =
  Object.fromEntries(BONUS_STATUSES.map((s) => [s.id, s.label])) as Record<BonusStatus, string>;

export const BONUS_STATUS_TONE: Record<BonusStatus, BadgeTone> =
  Object.fromEntries(BONUS_STATUSES.map((s) => [s.id, s.tone])) as Record<BonusStatus, BadgeTone>;

export function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const date = /T/.test(d) ? new Date(d) : new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
