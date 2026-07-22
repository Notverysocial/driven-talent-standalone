// Client-safe team-admin + separations constants. Matches
// supabase/migrations/0012_team_members.sql — pure data, no Supabase imports.

import type { BadgeTone } from "@/components/Badge";

// ---------- Team members -------------------------------------------------

export type TeamMemberRole =
  | "founder"
  | "admin"
  | "recruiter"
  | "safety_manager"
  | "onboarding_coordinator"
  | "payroll"
  | "finance"
  | "sales"
  | "staff";

export type TeamMemberStatus = "active" | "inactive";

export type TeamMember = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: TeamMemberRole;
  status: TeamMemberStatus;
  title: string | null;
  initials: string | null;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export const ROLE_LABEL: Record<TeamMemberRole, string> = {
  founder: "Founder",
  admin: "Admin",
  recruiter: "Recruiter",
  safety_manager: "Safety Manager",
  onboarding_coordinator: "Onboarding Coord.",
  payroll: "Payroll",
  finance: "Finance",
  sales: "Sales",
  staff: "Staff",
};

export const ROLE_TONE: Record<TeamMemberRole, BadgeTone> = {
  founder: "gold",
  admin: "gold",
  recruiter: "warm",
  safety_manager: "amber",
  onboarding_coordinator: "warm",
  payroll: "warm",
  finance: "warm",
  sales: "warm",
  staff: "dark",
};

export const TEAM_ROLES: TeamMemberRole[] = [
  "founder",
  "admin",
  "recruiter",
  "safety_manager",
  "onboarding_coordinator",
  "payroll",
  "finance",
  "sales",
  "staff",
];

// ---------- Separations / DNR -------------------------------------------

export type SeparationReason =
  | "voluntary"
  | "job_abandonment"
  | "performance"
  | "conduct"
  | "attendance"
  | "reduction_in_force"
  | "end_of_assignment"
  | "mutual"
  | "other";

export type SeparationEligibility = "eligible" | "conditional" | "do_not_return";

export type EmployeeSeparation = {
  id: string;
  employee_id: string;
  separation_date: string;
  reason: SeparationReason;
  eligibility: SeparationEligibility;
  client_id: string | null;
  last_position: string | null;
  detail: string | null;
  do_not_return_note: string | null;
  processed_by: string | null;
  final_check_issued: boolean;
  final_check_date: string | null;
  equipment_returned: boolean;
  exit_interview_done: boolean;
  rehire_allowed_clients: string[];
  created_at: string;
  updated_at: string;
};

export const REASON_LABEL: Record<SeparationReason, string> = {
  voluntary: "Voluntary",
  job_abandonment: "Job abandonment",
  performance: "Performance",
  conduct: "Conduct",
  attendance: "Attendance",
  reduction_in_force: "Reduction in force",
  end_of_assignment: "End of assignment",
  mutual: "Mutual",
  other: "Other",
};

export const ELIGIBILITY_LABEL: Record<SeparationEligibility, string> = {
  eligible: "Eligible for rehire",
  conditional: "Conditional",
  do_not_return: "Do Not Return",
};

export const ELIGIBILITY_TONE: Record<SeparationEligibility, BadgeTone> = {
  eligible: "green",
  conditional: "amber",
  do_not_return: "red",
};

// What eligibility to SHOW for a separated employee.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS
//
// /team/terminated derived the badge from the separation row alone:
//
//     const eligibility = separation?.eligibility ?? "eligible";
//
// markDoNotReturn() (roster/actions.ts) writes the standalone `do_not_return`
// table and flips employees.status = 'do_not_return', but never wrote an
// `employee_separations` row. listSeparatedEmployees() selects on
// status in ('terminated','do_not_return'), so the employee DID appear on the
// page — with no separation row, so the `?? "eligible"` fallback fired and the
// most dangerous state in the system rendered as the safest-looking one: a
// green "Eligible for rehire" badge, counted in the "eligible to return" tile.
//
// THE RULE: the employee's own status is authoritative for the BAR. A
// separation row can refine the picture (reason, client, note) but must never
// downgrade a do_not_return employee, and its ABSENCE must never read as "fine".
//
// Note the asymmetry — only `do_not_return` overrides. A plain `terminated`
// employee with no separation row still resolves to "eligible", because a
// missing form is not evidence of a bar and inventing one would hide genuinely
// rehireable people.
//
// This is the employee-side twin of sendBar() in candidate-eligibility.ts,
// which fixed the same class of error on the candidate side. That module is
// deliberately not reused here: it answers "may we send this candidate to a
// client", keyed on candidates.lifecycle_status, which is a different record
// and a different question.
// ---------------------------------------------------------------------------
export function resolveSeparationEligibility(input: {
  employeeStatus: string | null | undefined;
  separation: { eligibility: SeparationEligibility } | null | undefined;
}): SeparationEligibility {
  if (input.employeeStatus === "do_not_return") return "do_not_return";
  return input.separation?.eligibility ?? "eligible";
}

export const SEPARATION_REASONS: SeparationReason[] = [
  "voluntary",
  "job_abandonment",
  "performance",
  "conduct",
  "attendance",
  "reduction_in_force",
  "end_of_assignment",
  "mutual",
  "other",
];

export const SEPARATION_ELIGIBILITIES: SeparationEligibility[] = [
  "eligible",
  "conditional",
  "do_not_return",
];

// ---------- E-signature --------------------------------------------------

export type EsignProvider =
  | "documenso"
  | "docuseal"
  | "dropbox_sign"
  | "pandadocs"
  | "manual";

export type EsignStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "signed"
  | "declined"
  | "expired"
  | "cancelled";

export type EsignatureRequest = {
  id: string;
  employee_id: string;
  document_kind: string;
  document_title: string;
  provider: EsignProvider;
  provider_request_id: string | null;
  signing_url: string | null;
  status: EsignStatus;
  recipient_email: string | null;
  recipient_name: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  declined_at: string | null;
  signed_pdf_path: string | null;
  checklist_item_key: string | null;
  webhook_payload: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const PROVIDER_LABEL: Record<EsignProvider, string> = {
  documenso: "Documenso",
  docuseal: "DocuSeal",
  dropbox_sign: "Dropbox Sign",
  pandadocs: "PandaDocs (legacy)",
  manual: "Manual / printed",
};

export const ESIGN_STATUS_LABEL: Record<EsignStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  signed: "Signed",
  declined: "Declined",
  expired: "Expired",
  cancelled: "Cancelled",
};

export const ESIGN_STATUS_TONE: Record<EsignStatus, BadgeTone> = {
  draft: "warm",
  sent: "gold",
  viewed: "amber",
  signed: "green",
  declined: "red",
  expired: "red",
  cancelled: "dark",
};

// Document kinds the onboarding UI knows about. New kinds can be added as
// free strings; these are just the well-known ones with friendly labels.
export const DOCUMENT_KINDS: { key: string; label: string }[] = [
  { key: "welcome_letter",         label: "Welcome Letter" },
  { key: "agreement_expectations", label: "Agreement & Expectations" },
  { key: "i9",                     label: "I-9 Employment Eligibility" },
  { key: "w4",                     label: "W-4 Withholding" },
  { key: "direct_deposit",         label: "Direct Deposit" },
];

// ---------- helpers ------------------------------------------------------

export function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function fmtDateTime(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
