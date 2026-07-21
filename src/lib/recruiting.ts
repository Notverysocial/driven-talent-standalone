// Types + label tables for the Recruiting module.
// Matches supabase/migrations/0003_recruiting.sql.

import type { BadgeTone } from "@/components/Badge";

// ---------- Inbound calls ------------------------------------------------

export type InboundCallStatus =
  | "new"
  | "contacted"
  | "left_voicemail"
  | "converted"
  | "dropped";

export type InboundCall = {
  id: string;
  caller_name: string;
  caller_phone: string | null;
  caller_email: string | null;
  position_of_interest: string | null;
  called_at: string;
  taken_by: string | null;
  notes: string | null;
  follow_up_status: InboundCallStatus;
  follow_up_due: string | null;
  converted_candidate_id: string | null;
  created_at: string;
  updated_at: string;
  // RingCentral integration fields — populated by sync() / webhooks.
  // Nullable on all CSV-imported rows; only the RingCentral path writes.
  ringcentral_id?: string | null;
  call_duration_seconds?: number | null;
  recording_url?: string | null;
  voicemail_transcription?: string | null;
  call_direction?: string | null;
  call_status?: string | null;
};

export const CALL_STATUSES: {
  id: InboundCallStatus;
  label: string;
  tone: BadgeTone;
}[] = [
  { id: "new",            label: "New",            tone: "gold" },
  { id: "left_voicemail", label: "Left Voicemail", tone: "amber" },
  { id: "contacted",      label: "Contacted",      tone: "warm" },
  { id: "converted",      label: "Converted",      tone: "green" },
  { id: "dropped",        label: "Dropped",        tone: "red" },
];

// ---------- Positions ----------------------------------------------------

export type PositionStatus = "open" | "on_hold" | "filled" | "cancelled";

export type Position = {
  id: string;
  client_id: string | null;
  role_title: string;
  department: string | null;
  shift: string | null;
  pay_rate: number | null;
  pay_rate_unit: string | null;
  headcount: number;
  filled_count: number;
  requirements: string | null;
  recruiting_notes: string | null;
  status: PositionStatus;
  opened_at: string;
  needed_by: string | null;
  filled_at: string | null;
  recruiter: string | null;
  created_at: string;
  updated_at: string;

  // ---------------------------------------------------------------------
  // Migration 0018 columns. The table gained 25 columns to match the
  // client's real requisition spreadsheet and NOTHING was updated to expose
  // them — this type stopped at the original 0004 shape, so the admin form
  // could not write them and the detail page could not read them.
  //
  // Split by AUDIENCE, because that distinction is now load-bearing: the
  // public careers page on driven-talent.com renders from this table.
  // ---------------------------------------------------------------------

  /** PUBLIC — safe to render on the careers page. */
  company_name: string | null;
  job_category: string | null;
  city: string | null;
  locality: string | null;
  min_pay_rate: number | null;
  max_pay_rate: number | null;
  schedule_hours: string | null;
  start_date: string | null;
  end_date: string | null;
  bilingual: boolean | null;
  special_skills: string | null;
  resume_required: boolean | null;
  job_description_url: string | null;

  /** INTERNAL — operational only. Never render publicly. */
  priority: string | null;
  deadline_to_fill: string | null;
  posted_redes: boolean | null;
  posted_indeed: boolean | null;
  posted_linkedin: boolean | null;

  // NOT surfaced in the admin form on purpose — contact/routing details that
  // are client-confidential or personal: hiring_manager, manager_email,
  // extra_cc, internal_client_manager, recruiter_email, backup_recruiter,
  // resume_folder. They exist on the table; adding a form field for each is a
  // separate decision, since every one is another place a leak could start.
  hiring_manager: string | null;
  manager_email: string | null;
  extra_cc: string | null;
  internal_client_manager: string | null;
  recruiter_email: string | null;
  backup_recruiter: string | null;
  resume_folder: string | null;
};

/**
 * Position fields the careers site is allowed to render. The public repo
 * enforces its own allowlist; this is the same list stated on our side so the
 * two can be compared, and so nobody adds a form field without deciding which
 * side of the line it falls on.
 */
export const PUBLIC_POSITION_FIELDS = [
  "role_title", "department", "shift", "headcount",
  "pay_rate", "pay_rate_unit", "min_pay_rate", "max_pay_rate",
  "company_name", "job_category", "city", "locality",
  "schedule_hours", "start_date", "end_date",
  "bilingual", "special_skills", "resume_required",
  "requirements", "job_description_url",
] as const;

/** Never renderable publicly. Asserted in the test suite. */
export const INTERNAL_POSITION_FIELDS = [
  "recruiting_notes", "priority", "deadline_to_fill",
  "hiring_manager", "manager_email", "extra_cc",
  "internal_client_manager", "recruiter_email", "backup_recruiter",
  "resume_folder", "posted_redes", "posted_indeed", "posted_linkedin",
] as const;

export const POSITION_STATUSES: {
  id: PositionStatus;
  label: string;
  tone: BadgeTone;
}[] = [
  { id: "open",      label: "Open",      tone: "gold" },
  { id: "on_hold",   label: "On Hold",   tone: "amber" },
  { id: "filled",    label: "Filled",    tone: "green" },
  { id: "cancelled", label: "Cancelled", tone: "red" },
];

export function fmtPayRate(rate: number | null, unit: string | null): string {
  if (rate == null) return "—";
  const u = unit ?? "hourly";
  if (u === "hourly") return `$${rate.toFixed(2)}/hr`;
  if (u === "salary") return `$${rate.toLocaleString()}/yr`;
  return `$${rate.toFixed(2)} (${u})`;
}

// ---------- Application intakes -----------------------------------------

export type ApplicationIntakeStatus =
  | "new"
  | "reviewed"
  | "promoted"
  | "rejected"
  | "spam";

export type ApplicationIntake = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  position_of_interest: string | null;
  experience_years: number | null;
  resume_url: string | null;
  cover_letter: string | null;
  source: string | null;
  user_agent: string | null;
  ip_hash: string | null;
  intake_payload: Record<string, unknown>;
  status: ApplicationIntakeStatus;
  conversation_id: string | null;
  promoted_candidate_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  // Applicant-Tracking claim (Change 1, migration 0038).
  claimed_by: string | null;
  claimed_at: string | null;
  // Migration 0044 — true for demo/QA seed rows (e.g. @example.com). Optional so
  // reads stay graceful before the migration is applied.
  is_seed?: boolean;
  created_at: string;
  updated_at: string;
};

export const INTAKE_STATUSES: {
  id: ApplicationIntakeStatus;
  label: string;
  tone: BadgeTone;
}[] = [
  { id: "new",      label: "New",       tone: "gold"  },
  { id: "reviewed", label: "Reviewed",  tone: "warm"  },
  { id: "promoted", label: "Promoted",  tone: "green" },
  { id: "rejected", label: "Rejected",  tone: "red"   },
  { id: "spam",     label: "Spam",      tone: "dark"  },
];