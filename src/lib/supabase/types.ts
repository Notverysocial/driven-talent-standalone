// Hand-written types matching supabase/migrations/0000_init.sql + 0001_ops_workflow.sql.

// Matches the `employee_status` enum: created in 0000_init.sql with
// (active, onboarding, inactive) and extended additively in 0012_team_members.sql
// with (terminated, do_not_return).
export type EmployeeStatus = "active" | "onboarding" | "inactive" | "terminated" | "do_not_return";
export type ScoreBand = "green" | "yellow" | "red";
// Document-language preference on a person record (migration 0033, task 86e20w8yz).
// Distinct from the app's UI locale: this is the language their onboarding docs /
// welcome letter should be generated in.
export type LanguagePref = "en" | "es";
// `present` is retained for historical rows; the attendance workflow now logs
// EXCEPTIONS only (everyone is assumed scheduled/present unless an exception is
// recorded). `sick_day` was added additively in migration 0027.
export type AttendanceStatus =
  | "present"
  | "late"
  | "missed"
  | "no_show"
  | "excused"
  | "sick_day";
// Updated by 0001 — old values were new/screening/interview/placed/inactive.
export type CandidateStatus = "applied" | "screening" | "interview" | "offer" | "hired" | "rejected";
export type CandidateLifecycleStatus =
  | "new_applicant"
  | "in_process"
  | "placed"
  | "available_for_rehire"
  | "do_not_return";
// Candidate-level screening outcome (migration 0040, card c2ad6f4f). Distinct
// from the pipeline `status`, the `lifecycle_status` enum, and the position-level
// open/on_hold status. null = not yet reviewed.
export type CandidateScreeningStatus = "approved" | "on_hold";
export type TimecardStatus = "draft" | "submitted" | "approved" | "rejected";
export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "void";
export type OnboardingCategory =
  | "Documentation"
  | "Compliance"
  | "Training"
  | "Equipment"
  | "Review";
export type OnboardingStatus = "not_started" | "in_progress" | "done" | "na";
export type PayrollPeriodStatus = "open" | "audited" | "submitted" | "approved" | "closed";
export type ClientReportFormat = "standard" | "hours_spent" | "timecard";
// Client lifecycle status (migration 0034). Distinguishes live accounts from
// prospects / churned ones in the Client section.
export type ClientStatus = "active" | "prospect" | "inactive";

export type Client = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  industry: string | null;
  address: string | null;
  contact_name: string | null;
  contact_email: string | null;
  terms: string | null;
  service_fee_pct: number;
  report_format: ClientReportFormat;
  // Added in 0033 — per-client config from the onboarding backlog (task 86e20w8qy).
  // `account_manager` is the DT person "in charge" of the account. The
  // workers_comp_* fields are the client's default WC code/class; per-position
  // overrides live in `client_workers_comp_codes`.
  workers_comp_code: string | null;
  workers_comp_class: string | null;
  account_manager: string | null;
  workers_comp_notes: string | null;
  // Added in 0034 — basic company info for the Client section.
  phone: string | null;
  website: string | null;
  status: ClientStatus;
  // Added in 0035 — customizable per-client report builder. `report_template_key`
  // selects a template from the code catalog (src/lib/reports/templates.ts),
  // falling back to `report_format` when null. `report_options` carries per-client
  // overrides (granularity, columns, label).
  report_template_key: string | null;
  report_options: ReportOptions;
  created_at: string;
  updated_at: string;
};

// Per-client report overrides stored in clients.report_options (migration 0035).
export type ReportGranularity = "employee_week" | "employee_day" | "hours_spent_matrix";
export type ReportOptions = {
  granularity?: ReportGranularity;
  columns?: string[];
  label?: string;
};

// Per-client × position workers-comp code mapping (migration 0033, task 86e20w8tq).
export type ClientWorkersCompCode = {
  id: string;
  client_id: string;
  position: string;
  wc_code: string;
  wc_class: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type Employee = {
  id: string;
  legacy_id: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  hire_date: string | null;
  status: EmployeeStatus;
  score: number;
  band: ScoreBand | null;
  rank: number | null;
  notes: string | null;
  recruiter: string | null;
  onboarding_in_charge: string | null;
  sick_hours_balance: number;
  birthday: string | null;
  // Added in 0033 — document-language preference (task 86e20w8yz).
  language_pref: LanguagePref;
  created_at: string;
  updated_at: string;
};

export type EmployeeAssignment = {
  id: string;
  employee_id: string;
  client_id: string;
  position: string;
  department: string;
  shift: string;
  start_date: string | null;
  hourly_rate: number;
  // Added in 0006 — what the client is billed per hour. Falls back to
  // hourly_rate × (1 + client.service_fee_pct/100) at invoice time when null.
  bill_rate: number | null;
  // Added (unused) in 0018, wired into invoicing in 0047 — the per-employee
  // markup over pay rate, as a percentage. Sits below bill_rate and above
  // clients.service_fee_pct in the resolution chain (src/lib/markup.ts).
  // null = not set (falls back); 0 = deliberately billed at cost.
  markup_percent: number | null;
  branch: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

// ---------- Do Not Return list (migration 0018 + employee link in 0026) ----
// Standalone DNR roster, originally seeded from the live spreadsheet. The
// employee_id link (0026) is set when an active employee is flagged from the
// roster, so the record can be synced (upsert) rather than duplicated.
export type DoNotReturnEntry = {
  id: string;
  employee_id: string | null;
  full_name: string;
  phone: string | null;
  last_company: string | null;
  reason: string | null;
  severity: string | null;
  date_logged: string | null;
  reported_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AttendanceEntry = {
  id: string;
  employee_id: string;
  client_id: string;
  date: string;
  status: AttendanceStatus;
  check_in: string | null;
  check_out: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CandidateCriterion = {
  key: string;
  label: string;
  sub: string;
  weight: number;
  value: number;
  note: string;
};

// One entry per past placement, stored on candidates.placement_history.
export type PlacementHistoryEntry = {
  client_id?: string | null;
  client_name?: string | null;
  role?: string | null;
  season?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  reason_for_end?: string | null;
};

export type Candidate = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  applied_for: string | null;
  source: string | null;
  applied_at: string | null;
  experience_years: number | null;
  certifications: string[];
  status: CandidateStatus;
  resume_path: string | null;
  notes: string | null;
  criteria: CandidateCriterion[];
  score: number | null;
  promoted_employee_id: string | null;
  client_id: string | null;
  recruiter: string | null;
  pandadoc_document_id: string | null;
  pandadoc_document_status: string | null;
  // Manual offer-doc fallback (migration 0049) used while PandaDoc is
  // disconnected. Optional so reads stay graceful before the migration lands.
  offer_doc_manual_sent_at?: string | null;
  offer_doc_manual_sent_by?: string | null;
  offer_doc_signed_path?: string | null;
  // Candidate-level screening outcome (migration 0040). null = not reviewed.
  screening_status: CandidateScreeningStatus | null;
  // Seasonal Talent Pool lifecycle layer (migration 0036).
  lifecycle_status: CandidateLifecycleStatus;
  placement_history: PlacementHistoryEntry[];
  last_placement_end: string | null;
  skills: string[];
  preferred_location: string | null;
  preferred_shift: string | null;
  do_not_return_reason: string | null;
  // Added in 0031 — used by the per-recruiter candidate tabs (#14).
  photo_url: string | null;
  responded: boolean;
  // Migration 0044 — true for demo/QA seed rows (e.g. @example.com) so they can
  // be excluded from the client-facing ATS without being deleted. Optional at
  // the type level so reads stay graceful before the migration is applied.
  is_seed?: boolean;
  // Added in 0033 — document-language preference (task 86e20w8yz).
  language_pref: LanguagePref;
  // ---- Candidates v2 (migration 0038) ----------------------------------
  primary_language: string | null;
  state: string | null;
  position: string | null;
  client_company: string | null;
  pay_rate: string | null;
  job_fit_score: number | null;
  transferred_to: string | null;
  red_flag: boolean;
  red_flag_reason: string | null;
  do_not_send: boolean;
  claimed_by: string | null;
  claimed_at: string | null;
  call_answered: boolean | null;
  voicemail_or_text_sent: boolean | null;
  last_contact_date: string | null;
  interview_scheduled: boolean | null;
  interview_at: string | null;
  showed_up: boolean | null;
  no_show_reason: string | null;
  interview_notes: string | null;
  strong_candidate: "yes" | "no" | "maybe" | null;
  other_positions_fit: string | null;
  resume_on_file: boolean | null;
  updated_profile_ready: boolean | null;
  sent_to_client: boolean | null;
  sent_at: string | null;
  client_response: "accepted" | "rejected" | "pending" | null;
  client_response_date: string | null;
  created_at: string;
  updated_at: string;
};

// PEOPLEASE new-hire forms tracker (migration 0033, task 86e20w8v9).
export type PeopleaseFormStatus = "pending" | "in_progress" | "complete" | "na";

export type EmployeePeopleaseForm = {
  id: string;
  employee_id: string;
  form_key: string;
  label: string;
  status: PeopleaseFormStatus;
  completed_on: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type OnboardingChecklistItem = {
  id: string;
  employee_id: string;
  key: string;
  label: string;
  detail: string | null;
  category: OnboardingCategory;
  status: OnboardingStatus;
  done_on: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type OnboardingDocument = {
  id: string;
  employee_id: string;
  name: string;
  received: boolean;
  received_on: string | null;
  file_path: string | null;
  created_at: string;
  updated_at: string;
};

export type WelcomeLetterDraft = {
  id: string;
  employee_id: string;
  body: string;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TimecardDay = {
  regular: number;
  overtime: number;
  holiday: number;
  in: string | null;
  out: string | null;
  locked: boolean;
  // Unpaid lunch break in minutes, deducted from the in→out span when both
  // punches are present. Undefined means "use the standard default" (30 min)
  // so existing rows keep working without a backfill.
  lunch_min?: number;
};

export type TimecardDays = Partial<
  Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", TimecardDay>
>;

export type TimecardFlags = {
  missed_punch?: boolean;
  punch_day?: string;
  hours_mismatch?: boolean;
  reason?: string;
};

export type Timecard = {
  id: string;
  employee_id: string;
  client_id: string;
  week_start: string;
  days: TimecardDays;
  reg_hours: number;
  ot_hours: number;
  holiday_hours: number;
  sick_hours: number;
  total_hours: number;
  hourly_rate: number;
  status: TimecardStatus;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  flags: TimecardFlags;
  payroll_period_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Invoice = {
  id: string;
  number: string;
  client_id: string;
  period_start: string;
  period_end: string;
  issued_at: string;
  due_at: string;
  terms: string | null;
  subtotal: number;
  fee_pct: number;
  fee: number;
  tax: number;
  total: number;
  status: InvoiceStatus;
  sent_at: string | null;
  paid_at: string | null;
  pdf_path: string | null;
  notes: string | null;
  bill_to_client_name: string | null;
  payroll_period_id: string | null;
  // Added in 0006 — department + branch dimensions per SOP grouping rule
  // (one invoice per client × department).
  department: string | null;
  branch: string | null;
  created_at: string;
  updated_at: string;
};

// Added in 0006 — tracks each batch generation of invoices from a
// payroll period. Lets the period detail page show "last generated"
// state and prevent accidental duplicate runs.
export type InvoiceRun = {
  id: string;
  payroll_period_id: string;
  ran_at: string;
  ran_by: string | null;
  invoices_created: number;
  line_items_created: number;
  total_billed: number;
  notes: string | null;
};

// Editable company / invoice settings (migration 0028). Single-row table:
// drives the invoice letterhead, remit/footer text, and format defaults.
export type CompanySettings = {
  id: boolean;
  company_name: string;
  tagline: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  ein: string | null;
  invoice_footer: string | null;
  accent_color: string | null;
  invoice_number_prefix: string | null;
  default_terms: string | null;
  default_fee_pct: number;
  created_at: string;
  updated_at: string;
};

export type InvoiceLineItem = {
  id: string;
  invoice_id: string;
  department: string | null;
  employee_name: string;
  role: string | null;
  hours: number;
  ot_hours: number;
  rate: number;
  amount: number;
  employee_cost: number | null;
  sort_order: number;
  timecard_id: string | null;
  created_at: string;
};

export type PayrollPeriod = {
  id: string;
  start_date: string;
  end_date: string;
  status: PayrollPeriodStatus;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  // Added in 0006 — date the invoices for this period were/will be cut.
  invoice_date: string | null;
  created_at: string;
  updated_at: string;
};

// ---- Calendar (migration 0003) -----------------------------------------

export type CalendarEventKind =
  | "birthday"
  | "holiday"
  | "social_post"
  | "internal"
  | "custom";

export type CalendarEvent = {
  id: string;
  kind: CalendarEventKind;
  title: string;
  description: string | null;
  event_date: string;              // YYYY-MM-DD
  start_time: string | null;       // HH:MM:SS
  end_time: string | null;         // HH:MM:SS
  all_day: boolean;
  location: string | null;
  link_url: string | null;
  assignee_name: string | null;
  employee_id: string | null;
  client_id: string | null;
  color_hex: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

// ---------- HR / Safety (migration 0005) ----------

export type SickEntryType = "accrual" | "usage" | "adjustment" | "payout";

export type SickTimeEntry = {
  id: string;
  employee_id: string;
  entry_date: string;
  entry_type: SickEntryType;
  hours: number;
  balance_delta: number;
  notes: string | null;
  client_id: string | null;
  timecard_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type LoaType =
  | "medical"
  | "cfra"
  | "pdl"
  | "personal"
  | "bereavement"
  | "military"
  | "jury_duty"
  | "workers_comp"
  | "other";

export type LoaStatus =
  | "requested"
  | "approved"
  | "denied"
  | "active"
  | "returned"
  | "cancelled";

export type LoaDocument = {
  name: string;
  file_path?: string | null;
  received_on?: string | null;
};

export type LeaveOfAbsenceRequest = {
  id: string;
  employee_id: string;
  type: LoaType;
  status: LoaStatus;
  requested_at: string;
  start_date: string;
  end_date: string | null;
  return_date: string | null;
  reason: string | null;
  protected: boolean;
  paid: boolean;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  documents: LoaDocument[];
  created_at: string;
  updated_at: string;
};

export type IncidentType =
  | "injury"
  | "illness"
  | "near_miss"
  | "property_damage"
  | "vehicle"
  | "other";

export type IncidentSeverity =
  | "first_aid"
  | "recordable"
  | "lost_time"
  | "fatality"
  | "unknown";

export type IncidentStatus =
  | "reported"
  | "investigating"
  | "resolved"
  | "closed";

export type IncidentWitness = { name: string; contact?: string | null };

export type SafetyIncident = {
  id: string;
  employee_id: string;
  client_id: string | null;
  incident_date: string;
  incident_time: string | null;
  reported_at: string;
  type: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  body_part: string | null;
  location: string | null;
  description: string;
  what_happened: string | null;
  equipment_used: string | null;
  hazardous_conditions: string | null;
  immediate_treatment: string | null;
  witnesses: IncidentWitness[];
  s1_triage_called_at: string | null;
  safety_manager_notified_at: string | null;
  client_notified_at: string | null;
  dwc1_sent_at: string | null;
  refusal_signed_at: string | null;
  reported_by: string | null;
  follow_up: string | null;
  // Peoplease workers' comp claim hand-off (migration 0013)
  peoplease_claim_drafted_at: string | null;
  peoplease_claim_email: string | null;
  created_at: string;
  updated_at: string;
};

export type WarningLevel = "verbal" | "written" | "final" | "suspension";

export type WarningCategory =
  | "attendance"
  | "performance"
  | "conduct"
  | "safety"
  | "policy"
  | "other";

export type DisciplinaryWarning = {
  id: string;
  employee_id: string;
  client_id: string | null;
  issued_date: string;
  level: WarningLevel;
  category: WarningCategory;
  description: string;
  action_required: string | null;
  employee_response: string | null;
  issued_by: string | null;
  witnessed_by: string | null;
  acknowledged_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

// ---------- Reimbursements + Expenses (migration 0009) ----------

export type ReimbursementStatus =
  | "submitted"
  | "approved"
  | "rejected"
  | "paid";

export type ReimbursementCategory =
  | "mileage"
  | "meals"
  | "travel"
  | "supplies"
  | "equipment"
  | "training"
  | "phone"
  | "uniform"
  | "other";

// Expense category is now a user-managed lookup table (migration 0029),
// not a fixed enum. The stored value on an expense is the category slug.
export type ExpenseCategorySlug = string;

export type ExpenseCategoryRow = {
  id: string;
  slug: string;
  label: string;
  tone: string;            // BadgeTone: warm|gold|green|amber|red|dark
  sort: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ExpensePaymentMethod =
  | "check"
  | "ach"
  | "card"
  | "cash"
  | "payroll"
  | "wire"
  | "other";

export type ReimbursementRequest = {
  id: string;
  employee_id: string;
  amount: number;
  category: ReimbursementCategory;
  description: string;
  expense_date: string;
  submitted_at: string;
  status: ReimbursementStatus;
  receipt_path: string | null;
  receipt_url: string | null;
  payment_method: ExpensePaymentMethod | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  rejected_at: string | null;
  paid_at: string | null;
  paid_reference: string | null;
  notes: string | null;
  client_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Expense = {
  id: string;
  category: ExpenseCategorySlug;
  amount: number;
  expense_date: string;
  vendor: string | null;
  description: string | null;
  payment_method: ExpensePaymentMethod | null;
  receipt_path: string | null;
  receipt_url: string | null;
  client_id: string | null;
  reimbursement_id: string | null;
  reimbursable: boolean;
  reference: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

// ---------- Legal Docs / Tasks / Meetings / Contacts (migration 0011) ----

export type LegalDocumentCategory =
  | "handbook"
  | "policy"
  | "agreement"
  | "nda"
  | "insurance"
  | "tax"
  | "license"
  | "poster"
  | "incorporation"
  | "compliance"
  | "notice"
  | "other";

export type LegalDocumentStatus =
  | "active"
  | "expiring_soon"
  | "expired"
  | "superseded"
  | "archived";

export type LegalDocument = {
  id: string;
  title: string;
  category: LegalDocumentCategory;
  status: LegalDocumentStatus;
  description: string | null;
  file_path: string | null;
  external_url: string | null;
  file_mime: string | null;
  file_size_bytes: number | null;
  document_number: string | null;
  issuer: string | null;
  jurisdiction: string | null;
  effective_date: string | null;
  expiry_date: string | null;
  reminder_days_before: number | null;
  client_id: string | null;
  employee_id: string | null;
  tags: string[];
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskStatus =
  | "todo"
  | "in_progress"
  | "blocked"
  | "done"
  | "cancelled";

export type TaskPriority = "low" | "normal" | "high" | "urgent";

export type TaskReminderChannel = "in_app" | "email" | "sms";

export type OpsTask = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_name: string | null;
  assignee_employee_id: string | null;
  due_at: string;
  start_at: string | null;
  completed_at: string | null;
  created_by: string | null;
  client_id: string | null;
  employee_id: string | null;
  legal_document_id: string | null;
  meeting_id: string | null;
  tags: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskReminder = {
  id: string;
  task_id: string;
  fire_at: string;
  channel: TaskReminderChannel;
  fired_at: string | null;
  acknowledged_at: string | null;
  notes: string | null;
  created_at: string;
};

export type MeetingStatus =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "rescheduled";

export type MeetingAttendeeStatus =
  | "invited"
  | "accepted"
  | "declined"
  | "tentative"
  | "attended"
  | "no_show";

export type Meeting = {
  id: string;
  title: string;
  description: string | null;
  status: MeetingStatus;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  link_url: string | null;
  agenda: string | null;
  notes: string | null;
  client_id: string | null;
  organizer_name: string | null;
  organizer_employee_id: string | null;
  tags: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type MeetingAttendee = {
  id: string;
  meeting_id: string;
  attendee_name: string | null;
  attendee_email: string | null;
  contact_id: string | null;
  employee_id: string | null;
  status: MeetingAttendeeStatus;
  is_organizer: boolean;
  created_at: string;
};

export type MeetingActionItem = {
  id: string;
  meeting_id: string;
  description: string;
  owner_name: string | null;
  owner_employee_id: string | null;
  due_date: string | null;
  done: boolean;
  task_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ContactType = "employer" | "job_seeker" | "other";

export type ContactRole =
  | "client_primary"
  | "client_billing"
  | "client_ops"
  | "vendor"
  | "partner"
  | "candidate_lead"
  | "employee"
  | "legal"
  | "accountant"
  | "insurance"
  | "government"
  | "other";

export type Contact = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  type: ContactType;
  source: string | null;
  notes: string | null;
  candidate_id: string | null;
  client_id: string | null;
  // Extended in 0011
  title: string | null;
  role: ContactRole | null;
  mobile_phone: string | null;
  work_phone: string | null;
  secondary_email: string | null;
  website: string | null;
  linkedin_url: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  birthday: string | null;
  tags: string[];
  owner: string | null;
  favorite: boolean;
  last_contacted_at: string | null;
  employee_id: string | null;
  created_at: string;
  updated_at: string;
};
// ---------- Incident case events (migration 0013) ----------------------

export type IncidentEventType =
  | "created"
  | "status_changed"
  | "compliance_flag"
  | "note"
  | "peoplease_email_drafted"
  | "peoplease_email_sent"
  | "export_pdf"
  | "export_excel"
  | "notification_sent";

export type IncidentCaseEvent = {
  id: string;
  incident_id: string;
  event_type: IncidentEventType;
  summary: string;
  note: string | null;
  actor: string | null;
  meta: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
};

// ---------- Sales Pipeline / CRM (migration 0015) -----------------------

export type SalesLeadStage =
  | "new"
  | "contacted"
  | "qualified"
  | "proposal"
  | "won"
  | "lost";

export type SalesLeadSource =
  | "referral"
  | "cold_outreach"
  | "inbound_web"
  | "event"
  | "existing_client"
  | "partner"
  | "other";

export type SalesLeadActivityType =
  | "note"
  | "call"
  | "email"
  | "meeting"
  | "stage_changed"
  | "owner_changed"
  | "task";

export type SalesLead = {
  id: string;
  company_name: string;
  industry: string | null;
  website: string | null;
  city: string | null;
  contact_name: string | null;
  contact_title: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  stage: SalesLeadStage;
  source: SalesLeadSource;
  source_detail: string | null;
  estimated_value: number | null;
  estimated_headcount: number | null;
  probability: number | null;
  owner: string | null;
  next_action: string | null;
  next_action_due: string | null;
  won_at: string | null;
  lost_at: string | null;
  lost_reason: string | null;
  client_id: string | null;
  notes: string | null;
  created_by: string | null;
  // Stamped once a new-inbound-lead notification email has been sent for this
  // lead (migration 0043). Null = not yet notified. Powers idempotent sweeps.
  lead_notified_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SalesLeadActivity = {
  id: string;
  lead_id: string;
  activity_type: SalesLeadActivityType;
  summary: string;
  body: string | null;
  actor: string | null;
  meta: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
};

// ---------- Bug Reports (migration 0014) --------------------------------

export type BugSeverity = "low" | "medium" | "high" | "critical";

export type BugStatus =
  | "new"
  | "in_progress"
  | "resolved"
  | "wont_fix"
  | "duplicate";

// ---------- RBAC / profiles (migration 0017) ---------------------------

// Authorisation tier. Distinct from team_member_role (which is the
// *job function* — recruiter/payroll/safety_manager/etc.). See
// 0017_rbac.sql for the rationale on keeping the two enums orthogonal.
export type AppRole = "owner" | "admin" | "user";

export type Profile = {
  id: string;             // matches auth.users.id
  email: string | null;
  full_name: string | null;
  role: AppRole;
  team_member_id: string | null;
  created_at: string;
  updated_at: string;
};

// ---------- Recruiters roster (migration 0034) -------------------------
// Canonical, self-serve recruiter list driving the per-recruiter candidate
// tabs. Candidates still link via the free-text candidates.recruiter column.
export type Recruiter = {
  id: string;
  name: string;
  email: string | null;
  active: boolean;
  sort: number;
  created_at: string;
  updated_at: string;
};

// ---------- Client contacts (migration 0020, surfaced in 0034 UI) ------
export type ClientContact = {
  id: string;
  client_id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  department: string | null;
  position: string | null;
  phone: string | null;
  email: string | null;
  shift: string | null;
  role_type: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

// ---------- Wellness / follow-up notes timeline (migration 0034) -------
// Immutable, append-only case-management entries scoped to an employee.
export type WellnessEntryType =
  | "note"
  | "follow_up"
  | "wellness_check"
  | "incident"
  | "accident"
  | "return_to_work"
  | "other";

export type WellnessNote = {
  id: string;
  employee_id: string;
  entry_type: WellnessEntryType;
  body: string;
  author_name: string;
  author_team_member_id: string | null;
  occurred_at: string;
  created_at: string;
};

// ---------- Notifications (team tagging, migration 0034) ----------------
export type AppNotification = {
  id: string;
  recipient_team_member_id: string | null;
  recipient_name: string;
  actor_name: string | null;
  kind: string;
  body: string;
  entity_type: string | null;
  entity_id: string | null;
  link_path: string | null;
  meta: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export type BugReport = {
  id: string;
  reporter_name: string | null;
  reporter_email: string | null;
  page_path: string | null;
  page_label: string | null;
  user_agent: string | null;
  description: string;
  steps_to_reproduce: string | null;
  severity: BugSeverity;
  status: BugStatus;
  attachment_path: string | null;
  assigned_to: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

// ---------- Payroll/report engine (migration 0035) ----------------------

// One row per roster reconciliation pass (auto add/remove observability).
export type RosterSyncAction = "added" | "removed" | "flagged";
export type RosterSyncDetail = {
  employee_id: string | null;
  name: string;
  action: RosterSyncAction;
  reason: string;
};
export type RosterSyncRun = {
  id: string;
  ran_at: string;
  ran_by: string | null;
  source: "timecards" | "uattend" | "manual";
  added_count: number;
  removed_count: number;
  flagged_count: number;
  details: RosterSyncDetail[];
  notes: string | null;
  created_at: string;
};

// Per-employee verification row (timecard ↔ invoice ↔ payroll reconciliation).
export type VerificationDetail = {
  employee_id: string;
  name: string;
  timecard_hours: number;
  invoice_hours: number;
  payroll_hours: number;
  status: "match" | "variance" | "missing";
  delta_hours: number;
  note: string | null;
};
export type PeriodVerification = {
  id: string;
  payroll_period_id: string;
  verified_by: string | null;
  verified_at: string;
  result: "clean" | "variances";
  employee_count: number;
  variance_count: number;
  deduction_zero_ok: boolean;
  details: VerificationDetail[];
  notes: string | null;
  created_at: string;
};


// ---------------------------------------------------------------------------
// Candidates v2 — threaded notes (migration 0038)
// ---------------------------------------------------------------------------

// "applicant" = an application_intakes row, the stage BEFORE promotion to a
// candidate. Added 2026-07-20 so the one notes log covers the whole funnel
// rather than starting at the candidate stage (migration 0050).
export type NoteSubjectType =
  | "applicant"
  | "candidate"
  | "onboarding"
  | "employee";

// The four call results the recruiting team distinguishes on a phone screen.
export type CallOutcome = "reached" | "no_answer" | "left_message" | "declined";
export type NoteKind = "note" | "phone_screen";
export type FollowupStatus = "in_review" | "resolved";
export type NoteMention = { name: string; team_member_id?: string | null };

export type CandidateNote = {
  id: string;
  subject_type: NoteSubjectType;
  subject_id: string;
  author_id: string | null;
  author_name: string;
  body: string;
  mentions: NoteMention[];
  followup_required: boolean;
  followup_assignee: string | null;
  followup_status: FollowupStatus | null;
  // A phone-screen result is a NOTE that carries structure, not a separate
  // object — so it lands in the same timeline and survives promotion the same
  // way. `call_outcome` is non-null exactly when note_kind is "phone_screen"
  // (enforced by a CHECK constraint in migration 0050).
  note_kind: NoteKind;
  call_outcome: CallOutcome | null;
  next_step: string | null;
  created_at: string;
};

// Change Log (migration 0041). Append-only record of every meaningful edit to a
// candidate / onboarding / employee record. Reuses the notes subject_type shape.
// actor_* is stamped server-side; field/old_value/new_value carry per-field diffs.
export type ActivityLogEntry = {
  id: string;
  subject_type: NoteSubjectType;
  subject_id: string;
  actor_id: string | null;
  actor_name: string;
  action: string;
  summary: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  meta: Record<string, unknown>;
  created_at: string;
};
