// Labels + helpers for the Sales Pipeline / CRM module.
// Matches supabase/migrations/0015_sales_pipeline.sql.

import type { BadgeTone } from "@/components/Badge";
import type {
  SalesLeadActivityType,
  SalesLeadSource,
  SalesLeadStage,
} from "./supabase/types";

export const SALES_LEAD_STAGES: {
  id: SalesLeadStage;
  label: string;
  tone: BadgeTone;
  short: string;
}[] = [
  { id: "new",       label: "New",       tone: "warm",  short: "Just added — not yet contacted" },
  { id: "contacted", label: "Contacted", tone: "gold",  short: "Outreach started, awaiting reply" },
  { id: "qualified", label: "Qualified", tone: "amber", short: "Real need, budget, decision-maker" },
  { id: "proposal",  label: "Proposal",  tone: "gold",  short: "Quote / contract under review" },
  { id: "won",       label: "Won",       tone: "green", short: "Closed-won — onboarding" },
  { id: "lost",      label: "Lost",      tone: "red",   short: "Closed-lost — capture reason" },
];

// The stages a lead actively moves through (excludes terminal won/lost).
// Used for the Kanban "active pipeline" columns.
export const SALES_LEAD_ACTIVE_STAGES: SalesLeadStage[] = [
  "new",
  "contacted",
  "qualified",
  "proposal",
];

export const SALES_LEAD_SOURCES: { id: SalesLeadSource; label: string }[] = [
  { id: "referral",        label: "Referral" },
  { id: "cold_outreach",   label: "Cold Outreach" },
  { id: "inbound_web",     label: "Inbound (Website)" },
  { id: "event",           label: "Event / Trade Show" },
  { id: "existing_client", label: "Existing Client (Expansion)" },
  { id: "partner",         label: "Partner / Channel" },
  { id: "other",           label: "Other" },
];

export const SALES_LEAD_ACTIVITY_TYPES: {
  id: SalesLeadActivityType;
  label: string;
  tone: BadgeTone;
}[] = [
  { id: "note",           label: "Note",          tone: "warm"  },
  { id: "call",           label: "Call",          tone: "gold"  },
  { id: "email",          label: "Email",         tone: "gold"  },
  { id: "meeting",        label: "Meeting",       tone: "amber" },
  { id: "stage_changed",  label: "Stage Change",  tone: "dark"  },
  { id: "owner_changed",  label: "Owner Change",  tone: "dark"  },
  { id: "task",           label: "Task",          tone: "warm"  },
];

export function stageLabel(s: SalesLeadStage): string {
  return SALES_LEAD_STAGES.find((x) => x.id === s)?.label ?? s;
}

export function stageTone(s: SalesLeadStage): BadgeTone {
  return SALES_LEAD_STAGES.find((x) => x.id === s)?.tone ?? "warm";
}

export function sourceLabel(s: SalesLeadSource): string {
  return SALES_LEAD_SOURCES.find((x) => x.id === s)?.label ?? s;
}

// Currency display for pipeline value strip, stage tiles, lead cards,
// lead detail, and Won YTD widget. Format contract:
//   < $1,000        → "$N"             (e.g. "$500")
//   ≥ $1,000        → "$Nk"            (e.g. "$5k", "$12.5k")
//   ≥ $1,000,000    → "$NM"            (e.g. "$1M", "$1.5M")
// Partial thousands/millions keep one decimal so $12,500 reads as "$12.5k"
// instead of collapsing to "$13k" — preserves the magnitude the user typed.
export function fmtCurrency(n: number | null | undefined): string {
  if (n == null) return "—";
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  const sign = num < 0 ? "-" : "";
  const abs = Math.abs(num);
  if (abs >= 1_000_000) return `${sign}$${trimDecimal(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}$${trimDecimal(abs / 1_000)}k`;
  return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
}

function trimDecimal(n: number): string {
  return n.toFixed(1).replace(/\.0$/, "");
}

export function fmtShortDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
