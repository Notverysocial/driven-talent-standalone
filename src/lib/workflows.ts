// Workflow Builder (module 1.10) — shared types, labels, templates.
// Matches supabase/migrations/0016_workflows.sql.

import type { BadgeTone } from "@/components/Badge";

// ---------- triggers ----------------------------------------------------

export type WorkflowTriggerType =
  | "lead_created"
  | "lead_stage_changed"
  | "candidate_created"
  | "candidate_stage_changed"
  | "application_received"
  | "inbound_call_logged"
  | "incident_created"
  | "task_overdue";

export const TRIGGERS: {
  id: WorkflowTriggerType;
  label: string;
  plain: string; // recruiter-friendly "When ..." sentence
  hasStageFilter?: boolean;
  stages?: { id: string; label: string }[];
}[] = [
  {
    id: "lead_created",
    label: "New lead created",
    plain: "When a new sales lead comes in",
  },
  {
    id: "lead_stage_changed",
    label: "Lead stage changes",
    plain: "When a lead moves to a new stage",
    hasStageFilter: true,
    stages: [
      { id: "any",         label: "any stage" },
      { id: "contacted",   label: "Contacted" },
      { id: "qualified",   label: "Qualified" },
      { id: "proposal",    label: "Proposal sent" },
      { id: "won",         label: "Won" },
      { id: "lost",        label: "Lost" },
    ],
  },
  {
    id: "candidate_created",
    label: "New candidate added",
    plain: "When a new candidate is added to the pipeline",
  },
  {
    id: "candidate_stage_changed",
    label: "Candidate stage changes",
    plain: "When a candidate moves to a new stage",
    hasStageFilter: true,
    stages: [
      { id: "any",        label: "any stage" },
      { id: "applied",    label: "Applied" },
      { id: "screening",  label: "Screening" },
      { id: "interview",  label: "Interview" },
      { id: "offer",      label: "Offer" },
      { id: "hired",      label: "Hired" },
      { id: "rejected",   label: "Rejected" },
    ],
  },
  {
    id: "application_received",
    label: "Website application received",
    plain: "When someone submits the driven-talent.com careers form",
  },
  {
    id: "inbound_call_logged",
    label: "Inbound call logged",
    plain: "When the phone rings and a call is logged",
  },
  {
    id: "incident_created",
    label: "Workplace incident reported",
    plain: "When a safety incident is reported",
  },
  {
    id: "task_overdue",
    label: "Follow-up task overdue",
    plain: "When a workflow follow-up task passes its due date",
  },
];

export function findTrigger(id: WorkflowTriggerType) {
  return TRIGGERS.find((t) => t.id === id) ?? TRIGGERS[0];
}

// ---------- actions -----------------------------------------------------

export type WorkflowActionType =
  | "assign_member"
  | "create_task"
  | "send_notification"
  | "change_status";

export const ACTIONS: {
  id: WorkflowActionType;
  label: string;
  plain: string;
}[] = [
  {
    id: "assign_member",
    label: "Assign to a team member",
    plain: "Assign this to a recruiter",
  },
  {
    id: "create_task",
    label: "Create a follow-up task",
    plain: "Create a follow-up task (with optional delay)",
  },
  {
    id: "send_notification",
    label: "Send a notification / email",
    plain: "Send an internal notification",
  },
  {
    id: "change_status",
    label: "Change the source status",
    plain: "Update the status of the triggering record",
  },
];

export function findAction(id: WorkflowActionType) {
  return ACTIONS.find((a) => a.id === id) ?? ACTIONS[0];
}

// ---------- delay presets (recruiter-friendly) --------------------------

export const DELAY_PRESETS: { id: string; label: string; minutes: number }[] = [
  { id: "now",  label: "Immediately",       minutes: 0      },
  { id: "15m",  label: "After 15 minutes",  minutes: 15     },
  { id: "1h",   label: "After 1 hour",      minutes: 60     },
  { id: "4h",   label: "After 4 hours",     minutes: 240    },
  { id: "1d",   label: "After 1 day",       minutes: 60 * 24    },
  { id: "2d",   label: "After 2 days",      minutes: 60 * 24 * 2 },
  { id: "1w",   label: "After 1 week",      minutes: 60 * 24 * 7 },
];

export function delayLabel(minutes: number): string {
  const m = DELAY_PRESETS.find((d) => d.minutes === minutes);
  if (m) return m.label;
  if (minutes === 0) return "Immediately";
  if (minutes < 60) return `After ${minutes}m`;
  const h = Math.round(minutes / 60);
  if (h < 24) return `After ${h}h`;
  const d = Math.round(minutes / (60 * 24));
  return `After ${d}d`;
}

// ---------- runs --------------------------------------------------------

export type WorkflowRunStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export const RUN_STATUS_TONE: Record<WorkflowRunStatus, BadgeTone> = {
  pending:   "amber",
  running:   "gold",
  completed: "green",
  failed:    "red",
  skipped:   "warm",
};

export const RUN_STATUS_LABEL: Record<WorkflowRunStatus, string> = {
  pending:   "Pending",
  running:   "Running",
  completed: "Completed",
  failed:    "Failed",
  skipped:   "Skipped",
};

// ---------- task statuses ----------------------------------------------

export type WorkflowTaskStatus = "open" | "done" | "snoozed" | "cancelled";

export const TASK_STATUS_TONE: Record<WorkflowTaskStatus, BadgeTone> = {
  open:      "gold",
  done:      "green",
  snoozed:   "amber",
  cancelled: "warm",
};

export const TASK_STATUS_LABEL: Record<WorkflowTaskStatus, string> = {
  open:      "Open",
  done:      "Done",
  snoozed:   "Snoozed",
  cancelled: "Cancelled",
};

// ---------- workflow definition JSON shape ------------------------------

export type WorkflowAction = {
  id: string;
  type: WorkflowActionType;
  // Free-form params keyed per action type. Examples:
  //   assign_member:     { assignee }
  //   create_task:       { title, notes, assignee }
  //   send_notification: { to, subject, body }
  //   change_status:     { to }
  params: Record<string, string | null | undefined>;
  // Minutes to delay after trigger. 0 = run immediately, > 0 = enqueue.
  delay_minutes: number;
};

export type WorkflowTriggerFilter = {
  // For *_stage_changed triggers: only fire when the new stage matches.
  // "any" or missing means "fire on every stage change".
  to_stage?: string;
};

export type WorkflowDefinition = {
  trigger: {
    type: WorkflowTriggerType;
    filter?: WorkflowTriggerFilter;
  };
  actions: WorkflowAction[];
};

// ---------- DB row types ------------------------------------------------

export type Workflow = {
  id: string;
  name: string;
  description: string | null;
  trigger_type: WorkflowTriggerType;
  enabled: boolean;
  definition: WorkflowDefinition;
  template_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkflowRun = {
  id: string;
  workflow_id: string;
  triggered_at: string;
  completed_at: string | null;
  status: WorkflowRunStatus;
  event_payload: Record<string, unknown>;
  steps_log: WorkflowRunStep[];
  error: string | null;
};

export type WorkflowRunStep = {
  action_id: string;
  type: WorkflowActionType;
  ran_at: string;
  status: "ok" | "scheduled" | "failed";
  detail?: string;
};

export type WorkflowTask = {
  id: string;
  workflow_run_id: string | null;
  workflow_id: string | null;
  title: string;
  notes: string | null;
  source_kind: string | null;
  source_id: string | null;
  source_label: string | null;
  assigned_to: string | null;
  due_at: string | null;
  status: WorkflowTaskStatus;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
};

// ---------- prebuilt templates -----------------------------------------
// One-click recipes. The first one is the anchor described in the build
// plan: new lead → auto-assign + 24h follow-up task.

export type WorkflowTemplate = {
  id: string;
  name: string;
  description: string;
  category: "Sales" | "Recruiting" | "Safety";
  recommended: boolean;
  definition: WorkflowDefinition;
};

export const TEMPLATES: WorkflowTemplate[] = [
  {
    id: "tpl_lead_24h_followup",
    name: "New lead → assign + 24-hour follow-up",
    description:
      "Auto-assigns the lead to the on-duty recruiter and books a follow-up task for tomorrow so no inbound ever goes cold.",
    category: "Sales",
    recommended: true,
    definition: {
      trigger: { type: "lead_created" },
      actions: [
        {
          id: "a1",
          type: "assign_member",
          params: { assignee: "Roxanna V." },
          delay_minutes: 0,
        },
        {
          id: "a2",
          type: "create_task",
          params: {
            title: "Follow up with new lead",
            notes: "Call/email to introduce DT and qualify the opportunity.",
            assignee: "Roxanna V.",
          },
          delay_minutes: 60 * 24,
        },
      ],
    },
  },
  {
    id: "tpl_application_welcome",
    name: "New application → welcome + 2-day screen reminder",
    description:
      "Notifies recruiting on a fresh website application and queues a screening reminder if it sits two days untouched.",
    category: "Recruiting",
    recommended: true,
    definition: {
      trigger: { type: "application_received" },
      actions: [
        {
          id: "a1",
          type: "send_notification",
          params: {
            to: "Estefany",
            subject: "New website application",
            body: "Review the new candidate and move them to screening.",
          },
          delay_minutes: 0,
        },
        {
          id: "a2",
          type: "create_task",
          params: {
            title: "Screen the new applicant",
            assignee: "Estefany",
          },
          delay_minutes: 60 * 24 * 2,
        },
      ],
    },
  },
  {
    id: "tpl_candidate_to_interview",
    name: "Candidate moves to Interview → prep checklist",
    description:
      "Creates an interview-prep task the moment a candidate hits the Interview stage.",
    category: "Recruiting",
    recommended: false,
    definition: {
      trigger: {
        type: "candidate_stage_changed",
        filter: { to_stage: "interview" },
      },
      actions: [
        {
          id: "a1",
          type: "create_task",
          params: {
            title: "Schedule + prep interview",
            notes: "Confirm time, send calendar invite, share role brief.",
          },
          delay_minutes: 0,
        },
      ],
    },
  },
  {
    id: "tpl_incident_safety_alert",
    name: "Incident reported → notify Safety Manager",
    description:
      "Pings Rocio immediately when a safety incident is logged and queues a 24-hour DWC-1 reminder.",
    category: "Safety",
    recommended: true,
    definition: {
      trigger: { type: "incident_created" },
      actions: [
        {
          id: "a1",
          type: "send_notification",
          params: {
            to: "Rocio Aponza",
            subject: "Workplace incident reported",
            body: "Review the report and call S1 Medical Triage if not already done.",
          },
          delay_minutes: 0,
        },
        {
          id: "a2",
          type: "create_task",
          params: {
            title: "Deliver DWC-1 within 1 working day",
            notes: "Per Labor Code § 5401 — see incident detail for context.",
            assignee: "Rocio Aponza",
          },
          delay_minutes: 60 * 24,
        },
      ],
    },
  },
];

export function templateById(id: string | null): WorkflowTemplate | null {
  if (!id) return null;
  return TEMPLATES.find((t) => t.id === id) ?? null;
}

// ---------- formatting helpers -----------------------------------------

export function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function fmtRelativeShort(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const abs = Math.abs(diff);
  const future = diff < 0;
  const min = Math.round(abs / 60_000);
  if (min < 1) return future ? "in a moment" : "just now";
  if (min < 60) return future ? `in ${min}m` : `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return future ? `in ${hr}h` : `${hr}h ago`;
  const d = Math.round(hr / 24);
  return future ? `in ${d}d` : `${d}d ago`;
}

// ---------- plain-English action summary -------------------------------
// Used by the workflow list to render the "When X, do Y" recipe sentence.

export function summariseAction(a: WorkflowAction): string {
  const delay = a.delay_minutes > 0 ? ` ${delayLabel(a.delay_minutes).toLowerCase()}` : "";
  switch (a.type) {
    case "assign_member":
      return `Assign to ${a.params.assignee ?? "a team member"}${delay}`;
    case "create_task":
      return `Create task "${a.params.title ?? "Follow up"}"${delay}`;
    case "send_notification":
      return `Notify ${a.params.to ?? "the team"}${delay}`;
    case "change_status":
      return `Change status to "${a.params.to ?? "—"}"${delay}`;
  }
}

export function summariseTrigger(def: WorkflowDefinition): string {
  const t = findTrigger(def.trigger.type);
  const stage = def.trigger.filter?.to_stage;
  if (t.hasStageFilter && stage && stage !== "any") {
    const label = t.stages?.find((s) => s.id === stage)?.label ?? stage;
    return `${t.plain} → ${label}`;
  }
  return t.plain;
}
