// HR & Safety — client-safe constants, labels and pure helpers.
// CA-specific compliance notes live here so the UI can surface them inline.

import type {
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
  LoaStatus,
  LoaType,
  SickEntryType,
  WarningCategory,
  WarningLevel,
} from "./supabase/types";

// ---------- Sick Time (CA Labor Code § 246 / SB 616) ---------------------

// CA paid sick leave: accrue 1 hr per 30 hrs worked, 5-day / 40-hr usage
// minimum per year, total accrual cap = 80 hours / 10 days.
export const CA_SICK_ACCRUAL_CAP_HOURS = 80;
export const CA_SICK_ANNUAL_USAGE_HOURS = 40;
export const CA_SICK_ACCRUAL_RATE = 1 / 30; // hours of sick per hour worked

export const SICK_ENTRY_LABEL: Record<SickEntryType, string> = {
  accrual: "Accrual",
  usage: "Used",
  adjustment: "Adjustment",
  payout: "Payout",
};

export const SICK_ENTRY_TONE: Record<
  SickEntryType,
  "green" | "amber" | "warm" | "red"
> = {
  accrual: "green",
  usage: "amber",
  adjustment: "warm",
  payout: "red",
};

// ---------- LOA ----------------------------------------------------------

export const LOA_TYPE_LABEL: Record<LoaType, string> = {
  medical: "Medical",
  cfra: "CFRA (Family Care)",
  pdl: "Pregnancy Disability (PDL)",
  personal: "Personal",
  bereavement: "Bereavement",
  military: "Military",
  jury_duty: "Jury Duty",
  workers_comp: "Workers' Comp",
  other: "Other",
};

// Whether the leave type is statutorily protected under CA law.
// The UI sets `protected = true` by default for these.
export const LOA_PROTECTED_BY_DEFAULT: Record<LoaType, boolean> = {
  medical: false,
  cfra: true,
  pdl: true,
  personal: false,
  bereavement: true,     // CA AB 1949 — protected bereavement
  military: true,        // USERRA / CA Mil & Vet Code
  jury_duty: true,       // CA CCP § 230
  workers_comp: true,    // Labor Code § 132a
  other: false,
};

export const LOA_STATUS_LABEL: Record<LoaStatus, string> = {
  requested: "Requested",
  approved: "Approved",
  denied: "Denied",
  active: "On Leave",
  returned: "Returned",
  cancelled: "Cancelled",
};

export const LOA_STATUS_TONE: Record<
  LoaStatus,
  "warm" | "gold" | "green" | "amber" | "red" | "dark"
> = {
  requested: "amber",
  approved: "gold",
  active: "dark",
  returned: "green",
  denied: "red",
  cancelled: "warm",
};

export function loaIsOpen(status: LoaStatus): boolean {
  return status === "requested" || status === "approved" || status === "active";
}

// ---------- Safety Incidents ---------------------------------------------

export const INCIDENT_TYPE_LABEL: Record<IncidentType, string> = {
  injury: "Injury",
  illness: "Illness",
  near_miss: "Near Miss",
  property_damage: "Property Damage",
  vehicle: "Vehicle",
  other: "Other",
};

export const INCIDENT_SEVERITY_LABEL: Record<IncidentSeverity, string> = {
  first_aid: "First Aid",
  recordable: "Recordable",
  lost_time: "Lost Time",
  fatality: "Fatality",
  unknown: "Unknown",
};

export const INCIDENT_SEVERITY_TONE: Record<
  IncidentSeverity,
  "warm" | "amber" | "red" | "dark" | "gold"
> = {
  first_aid: "warm",
  recordable: "amber",
  lost_time: "red",
  fatality: "dark",
  unknown: "warm",
};

export const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = {
  reported: "Reported",
  investigating: "Investigating",
  resolved: "Resolved",
  closed: "Closed",
};

export const INCIDENT_STATUS_TONE: Record<
  IncidentStatus,
  "amber" | "gold" | "green" | "warm"
> = {
  reported: "amber",
  investigating: "gold",
  resolved: "green",
  closed: "warm",
};

// Compliance checklist for an incident (drives the "outstanding" badge).
export const INCIDENT_COMPLIANCE_FIELDS = [
  { key: "s1_triage_called_at",          label: "S1 Medical Triage called" },
  { key: "safety_manager_notified_at",   label: "Safety Manager notified" },
  { key: "client_notified_at",           label: "Client notified" },
  { key: "dwc1_sent_at",                 label: "DWC-1 sent (within 1 working day)" },
] as const;

// ---------- Disciplinary Warnings ----------------------------------------

export const WARNING_LEVEL_LABEL: Record<WarningLevel, string> = {
  verbal: "Verbal",
  written: "Written",
  final: "Final",
  suspension: "Suspension",
};

export const WARNING_LEVEL_TONE: Record<
  WarningLevel,
  "warm" | "amber" | "red" | "dark"
> = {
  verbal: "warm",
  written: "amber",
  final: "red",
  suspension: "dark",
};

export const WARNING_CATEGORY_LABEL: Record<WarningCategory, string> = {
  attendance: "Attendance",
  performance: "Performance",
  conduct: "Conduct",
  safety: "Safety",
  policy: "Policy",
  other: "Other",
};

// ---------- date helpers --------------------------------------------------

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const date = /T/.test(d) ? new Date(d) : new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function fmtDateShort(d: string | null | undefined): string {
  if (!d) return "—";
  const date = /T/.test(d) ? new Date(d) : new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function daysBetween(a: string, b: string | null): number | null {
  if (!b) return null;
  const da = new Date(a + "T00:00:00").getTime();
  const db = new Date(b + "T00:00:00").getTime();
  return Math.round((db - da) / 86_400_000) + 1;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
