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
