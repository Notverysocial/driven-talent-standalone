// Hand-written types matching supabase/migrations/0000_init.sql + 0001_ops_workflow.sql.

export type EmployeeStatus = "active" | "onboarding" | "inactive";
export type ScoreBand = "green" | "yellow" | "red";
export type AttendanceStatus = "present" | "late" | "missed" | "no_show" | "excused";
// Updated by 0001 — old values were new/screening/interview/placed/inactive.
export type CandidateStatus = "applied" | "screening" | "interview" | "offer" | "hired" | "rejected";
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
  branch: string | null;
  active: boolean;
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

export type CalendarEventKind = "birthday" | "holiday" | "social_post" | "custom";

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

export type ExpenseCategory =
  | "rent"
  | "utilities"
  | "software"
  | "marketing"
  | "insurance"
  | "supplies"
  | "travel"
  | "meals"
  | "professional_services"
  | "payroll"
  | "taxes"
  | "equipment"
  | "other";

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
  category: ExpenseCategory;
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
