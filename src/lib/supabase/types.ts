// Hand-written types matching supabase/migrations/0000_init.sql.
// When the schema stabilizes, regenerate via `supabase gen types typescript`.

export type EmployeeStatus = "active" | "onboarding" | "inactive";
export type ScoreBand = "green" | "yellow" | "red";
export type AttendanceStatus = "present" | "late" | "missed" | "no_show" | "excused";
export type CandidateStatus = "new" | "screening" | "interview" | "placed" | "inactive";
export type TimecardStatus = "draft" | "submitted" | "approved" | "rejected";
export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "void";
export type OnboardingCategory =
  | "Documentation"
  | "Compliance"
  | "Training"
  | "Equipment"
  | "Review";

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
  done: boolean;
  done_on: string | null;
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

export type Timecard = {
  id: string;
  employee_id: string;
  client_id: string;
  week_start: string;
  days: TimecardDays;
  reg_hours: number;
  ot_hours: number;
  holiday_hours: number;
  total_hours: number;
  hourly_rate: number;
  status: TimecardStatus;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
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
  sort_order: number;
  timecard_id: string | null;
  created_at: string;
};
