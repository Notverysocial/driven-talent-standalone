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
};

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