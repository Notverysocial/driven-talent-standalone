// Legal Docs · Tasks · Meetings · Contacts — client-safe labels, helpers, constants.
// Server-side queries live in legal-tasks.server.ts.

import type {
  ContactRole,
  ContactType,
  LegalDocumentCategory,
  LegalDocumentStatus,
  MeetingAttendeeStatus,
  MeetingStatus,
  TaskPriority,
  TaskReminderChannel,
  TaskStatus,
} from "./supabase/types";

// ---------- Legal Documents ----------------------------------------------

export const LEGAL_CATEGORY_LABEL: Record<LegalDocumentCategory, string> = {
  handbook: "Handbook",
  policy: "Policy",
  agreement: "Agreement",
  nda: "NDA",
  insurance: "Insurance",
  tax: "Tax / W-9",
  license: "License",
  poster: "Labor Poster",
  incorporation: "Incorporation",
  compliance: "Compliance",
  notice: "Notice",
  other: "Other",
};

export const LEGAL_CATEGORY_TONE: Record<
  LegalDocumentCategory,
  "warm" | "gold" | "green" | "amber" | "red" | "dark"
> = {
  handbook: "gold",
  policy: "warm",
  agreement: "dark",
  nda: "dark",
  insurance: "amber",
  tax: "warm",
  license: "amber",
  poster: "green",
  incorporation: "gold",
  compliance: "amber",
  notice: "red",
  other: "warm",
};

export const LEGAL_STATUS_LABEL: Record<LegalDocumentStatus, string> = {
  active: "Active",
  expiring_soon: "Expiring Soon",
  expired: "Expired",
  superseded: "Superseded",
  archived: "Archived",
};

export const LEGAL_STATUS_TONE: Record<
  LegalDocumentStatus,
  "warm" | "gold" | "green" | "amber" | "red" | "dark"
> = {
  active: "green",
  expiring_soon: "amber",
  expired: "red",
  superseded: "warm",
  archived: "dark",
};

/**
 * Derive a UI status from raw date columns. Persisted `status` always wins,
 * but a freshly inserted "active" row should flip to "expiring_soon" once it
 * crosses the per-document warning window.
 */
export function deriveLegalStatus(
  persisted: LegalDocumentStatus,
  expiryDate: string | null,
  reminderDays: number | null,
  todayIso: string,
): LegalDocumentStatus {
  if (persisted !== "active") return persisted;
  if (!expiryDate) return "active";
  const today = new Date(todayIso + "T00:00:00").getTime();
  const expiry = new Date(expiryDate + "T00:00:00").getTime();
  if (expiry < today) return "expired";
  const window = (reminderDays ?? 30) * 86_400_000;
  if (expiry - today <= window) return "expiring_soon";
  return "active";
}

// ---------- Tasks --------------------------------------------------------

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

export const TASK_STATUS_TONE: Record<
  TaskStatus,
  "warm" | "gold" | "green" | "amber" | "red" | "dark"
> = {
  todo: "warm",
  in_progress: "gold",
  blocked: "red",
  done: "green",
  cancelled: "dark",
};

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const TASK_PRIORITY_TONE: Record<
  TaskPriority,
  "warm" | "gold" | "amber" | "red"
> = {
  low: "warm",
  normal: "gold",
  high: "amber",
  urgent: "red",
};

export const TASK_REMINDER_CHANNEL_LABEL: Record<
  TaskReminderChannel,
  string
> = {
  in_app: "In-app",
  email: "Email",
  sms: "SMS",
};

export function isTaskOpen(status: TaskStatus): boolean {
  return status === "todo" || status === "in_progress" || status === "blocked";
}

/**
 * Days until a due date, signed (negative = overdue). Operates on the
 * absolute date so timezone wobble doesn't flip the sign.
 */
export function daysUntil(dueIso: string, nowMs: number = Date.now()): number {
  const due = new Date(dueIso).getTime();
  return Math.ceil((due - nowMs) / 86_400_000);
}

export function dueLabel(dueIso: string, status: TaskStatus): string {
  if (status === "done" || status === "cancelled") return "—";
  const d = daysUntil(dueIso);
  if (d < 0) return `${Math.abs(d)}d overdue`;
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d <= 7) return `In ${d}d`;
  return new Date(dueIso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function dueTone(
  dueIso: string,
  status: TaskStatus,
): "warm" | "gold" | "amber" | "red" | "green" | "dark" {
  if (status === "done") return "green";
  if (status === "cancelled") return "dark";
  const d = daysUntil(dueIso);
  if (d < 0) return "red";
  if (d <= 1) return "amber";
  if (d <= 3) return "gold";
  return "warm";
}

/**
 * Default reminder schedule for a new task. Returns timestamps relative to
 * the due date: 3 days before, 1 day before, and morning-of (9am local).
 * Callers filter out reminders already in the past.
 */
export function defaultReminderTimes(dueIso: string): Date[] {
  const due = new Date(dueIso);
  const threeDaysBefore = new Date(due);
  threeDaysBefore.setDate(due.getDate() - 3);
  threeDaysBefore.setHours(9, 0, 0, 0);

  const oneDayBefore = new Date(due);
  oneDayBefore.setDate(due.getDate() - 1);
  oneDayBefore.setHours(9, 0, 0, 0);

  const morningOf = new Date(due);
  morningOf.setHours(9, 0, 0, 0);

  return [threeDaysBefore, oneDayBefore, morningOf];
}

// ---------- Meetings -----------------------------------------------------

export const MEETING_STATUS_LABEL: Record<MeetingStatus, string> = {
  scheduled: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
};

export const MEETING_STATUS_TONE: Record<
  MeetingStatus,
  "warm" | "gold" | "green" | "amber" | "red" | "dark"
> = {
  scheduled: "gold",
  in_progress: "amber",
  completed: "green",
  cancelled: "red",
  rescheduled: "warm",
};

export const ATTENDEE_STATUS_LABEL: Record<MeetingAttendeeStatus, string> = {
  invited: "Invited",
  accepted: "Accepted",
  declined: "Declined",
  tentative: "Tentative",
  attended: "Attended",
  no_show: "No-show",
};

// ---------- Contacts -----------------------------------------------------

export const CONTACT_TYPE_LABEL: Record<ContactType, string> = {
  employer: "Employer",
  job_seeker: "Job Seeker",
  other: "Other",
};

export const CONTACT_ROLE_LABEL: Record<ContactRole, string> = {
  client_primary: "Client · Primary",
  client_billing: "Client · Billing",
  client_ops: "Client · Operations",
  vendor: "Vendor",
  partner: "Partner",
  candidate_lead: "Candidate Lead",
  employee: "Employee",
  legal: "Legal Counsel",
  accountant: "Accountant",
  insurance: "Insurance",
  government: "Government",
  other: "Other",
};

export const CONTACT_ROLE_TONE: Record<
  ContactRole,
  "warm" | "gold" | "green" | "amber" | "red" | "dark"
> = {
  client_primary: "gold",
  client_billing: "warm",
  client_ops: "warm",
  vendor: "amber",
  partner: "green",
  candidate_lead: "gold",
  employee: "dark",
  legal: "red",
  accountant: "amber",
  insurance: "amber",
  government: "dark",
  other: "warm",
};

// ---------- formatting helpers ------------------------------------------

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const date = /T/.test(d) ? new Date(d) : new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function fmtDateTime(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Build the value for a datetime-local input from a Date (default: now).
 * Browsers want "YYYY-MM-DDTHH:MM" in local time.
 */
export function datetimeLocalValue(d: Date = new Date()): string {
  const offset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}
