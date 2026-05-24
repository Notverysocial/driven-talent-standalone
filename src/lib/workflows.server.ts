import "server-only";
import { createClient } from "./supabase/server";
import {
  type Workflow,
  type WorkflowAction,
  type WorkflowDefinition,
  type WorkflowRun,
  type WorkflowRunStep,
  type WorkflowTask,
  type WorkflowTriggerType,
} from "./workflows";

// ---------- CRUD --------------------------------------------------------

export async function listWorkflows(): Promise<Workflow[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("workflows")
    .select("*")
    .order("enabled", { ascending: false })
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Workflow[];
}

export async function getWorkflow(id: string): Promise<Workflow | null> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("workflows")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Workflow | null) ?? null;
}

export async function listRunsForWorkflow(
  workflowId: string,
  limit = 25,
): Promise<WorkflowRun[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("workflow_runs")
    .select("*")
    .eq("workflow_id", workflowId)
    .order("triggered_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as WorkflowRun[];
}

export async function listAllRecentRuns(limit = 40): Promise<WorkflowRun[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("workflow_runs")
    .select("*")
    .order("triggered_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as WorkflowRun[];
}

export async function listOpenWorkflowTasks(): Promise<WorkflowTask[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("workflow_tasks")
    .select("*")
    .eq("status", "open")
    .order("due_at", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as WorkflowTask[];
}

// ---------- run counts (for the list dashboard) ------------------------

export async function countRunsByWorkflow(): Promise<
  Map<string, { total: number; failed: number }>
> {
  const sb = await createClient();
  const { data } = await sb
    .from("workflow_runs")
    .select("workflow_id, status")
    .limit(1000);
  const m = new Map<string, { total: number; failed: number }>();
  for (const r of (data ?? []) as { workflow_id: string; status: string }[]) {
    const bucket = m.get(r.workflow_id) ?? { total: 0, failed: 0 };
    bucket.total += 1;
    if (r.status === "failed") bucket.failed += 1;
    m.set(r.workflow_id, bucket);
  }
  return m;
}

// ---------- interpreter -------------------------------------------------
//
// fireWorkflowEvent is the entry point. Other modules (sales pipeline,
// recruiting, safety) call it when their domain events occur. It finds
// every enabled workflow whose trigger_type matches, applies the trigger
// filter, and either runs the actions inline or schedules them.
//
// Synchronous (delay_minutes = 0) → executed immediately.
// Delayed (delay_minutes > 0)     → row in workflow_scheduled_jobs.

export type FireEventOptions = {
  // Source entity that fired this event — recorded on workflow_tasks rows
  // and on the run's event_payload for context in the UI.
  source?: {
    kind: string;             // 'lead' | 'candidate' | 'incident' | …
    id?: string;              // uuid of the source row, if any
    label?: string;           // display name, e.g. "Acme Corp" / "Maria Rivera"
    to_stage?: string;        // for *_stage_changed triggers, the new stage
  };
  payload?: Record<string, unknown>;
};

export async function fireWorkflowEvent(
  triggerType: WorkflowTriggerType,
  opts: FireEventOptions = {},
): Promise<{ fired: number }> {
  const sb = await createClient();

  const { data: workflows, error } = await sb
    .from("workflows")
    .select("*")
    .eq("trigger_type", triggerType)
    .eq("enabled", true);
  if (error) throw new Error(error.message);
  const candidates = (workflows ?? []) as Workflow[];

  let fired = 0;

  for (const wf of candidates) {
    const stageFilter = wf.definition?.trigger?.filter?.to_stage;
    if (
      stageFilter &&
      stageFilter !== "any" &&
      opts.source?.to_stage &&
      opts.source.to_stage !== stageFilter
    ) {
      continue;
    }

    const eventPayload = {
      ...(opts.payload ?? {}),
      _source: opts.source ?? null,
    };

    const { data: run, error: runErr } = await sb
      .from("workflow_runs")
      .insert({
        workflow_id: wf.id,
        status: "running",
        event_payload: eventPayload,
      })
      .select("*")
      .single();
    if (runErr || !run) continue;

    await executeWorkflow(wf, run as WorkflowRun, opts);
    fired += 1;
  }

  return { fired };
}

async function executeWorkflow(
  wf: Workflow,
  run: WorkflowRun,
  opts: FireEventOptions,
): Promise<void> {
  const sb = await createClient();
  const steps: WorkflowRunStep[] = [];
  let failed = false;

  for (const action of wf.definition.actions ?? []) {
    if (action.delay_minutes > 0) {
      const runAt = new Date(Date.now() + action.delay_minutes * 60_000).toISOString();
      const { error } = await sb.from("workflow_scheduled_jobs").insert({
        workflow_run_id: run.id,
        workflow_id: wf.id,
        action,
        run_at: runAt,
      });
      steps.push({
        action_id: action.id,
        type: action.type,
        ran_at: new Date().toISOString(),
        status: error ? "failed" : "scheduled",
        detail: error
          ? `enqueue failed: ${error.message}`
          : `scheduled for ${runAt}`,
      });
      if (error) failed = true;
    } else {
      const step = await runActionImmediate(wf, run, action, opts);
      steps.push(step);
      if (step.status === "failed") failed = true;
    }
  }

  // Any delayed steps mean the run stays in 'running' until those drain;
  // pure immediate runs go straight to completed/failed here.
  const hasPending = steps.some((s) => s.status === "scheduled");
  const finalStatus = failed
    ? "failed"
    : hasPending
      ? "running"
      : "completed";

  await sb
    .from("workflow_runs")
    .update({
      status: finalStatus,
      steps_log: steps,
      completed_at: hasPending ? null : new Date().toISOString(),
    })
    .eq("id", run.id);
}

async function runActionImmediate(
  wf: Workflow,
  run: WorkflowRun,
  action: WorkflowAction,
  opts: FireEventOptions,
): Promise<WorkflowRunStep> {
  const sb = await createClient();
  const ranAt = new Date().toISOString();
  try {
    switch (action.type) {
      case "create_task": {
        const dueAt = action.delay_minutes
          ? new Date(Date.now() + action.delay_minutes * 60_000).toISOString()
          : null;
        const { error } = await sb.from("workflow_tasks").insert({
          workflow_run_id: run.id,
          workflow_id: wf.id,
          title: action.params.title || "Follow up",
          notes: action.params.notes ?? null,
          assigned_to: action.params.assignee ?? null,
          due_at: dueAt,
          source_kind: opts.source?.kind ?? null,
          source_id: opts.source?.id ?? null,
          source_label: opts.source?.label ?? null,
        });
        if (error) throw new Error(error.message);
        return {
          action_id: action.id,
          type: action.type,
          ran_at: ranAt,
          status: "ok",
          detail: `task created${action.params.assignee ? ` for ${action.params.assignee}` : ""}`,
        };
      }

      case "assign_member":
        return {
          action_id: action.id,
          type: action.type,
          ran_at: ranAt,
          status: "ok",
          detail: `assigned to ${action.params.assignee ?? "unspecified"}`,
        };

      case "send_notification":
        // Production wiring would post to email/slack here. For now the
        // run log is the audit trail.
        return {
          action_id: action.id,
          type: action.type,
          ran_at: ranAt,
          status: "ok",
          detail: `notified ${action.params.to ?? "team"} — ${action.params.subject ?? ""}`.trim(),
        };

      case "change_status":
        return {
          action_id: action.id,
          type: action.type,
          ran_at: ranAt,
          status: "ok",
          detail: `status → ${action.params.to ?? "—"} (recorded; downstream module applies)`,
        };
    }
  } catch (err) {
    return {
      action_id: action.id,
      type: action.type,
      ran_at: ranAt,
      status: "failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------- scheduled-job drain ----------------------------------------
//
// Drains pending jobs whose run_at has elapsed. Designed to be called
// from /api/workflows/tick by Vercel Cron (or any external scheduler) on
// a 1-min cadence. Synchronous + small, so it can run inside Vercel's
// serverless time budget.

export async function processScheduledJobs(
  options: { limit?: number; now?: Date } = {},
): Promise<{ processed: number; failed: number }> {
  const sb = await createClient();
  const limit = options.limit ?? 25;
  const now = (options.now ?? new Date()).toISOString();

  const { data: jobs, error } = await sb
    .from("workflow_scheduled_jobs")
    .select("*")
    .eq("status", "pending")
    .lte("run_at", now)
    .order("run_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);

  let processed = 0;
  let failed = 0;

  for (const job of (jobs ?? []) as {
    id: string;
    workflow_id: string;
    workflow_run_id: string;
    action: WorkflowAction;
    attempts: number;
  }[]) {
    const claim = await sb
      .from("workflow_scheduled_jobs")
      .update({ status: "running", attempts: job.attempts + 1 })
      .eq("id", job.id)
      .eq("status", "pending");
    if (claim.error) continue;

    const wf = await getWorkflow(job.workflow_id);
    const { data: runRow } = await sb
      .from("workflow_runs")
      .select("*")
      .eq("id", job.workflow_run_id)
      .maybeSingle();
    if (!wf || !runRow) {
      await sb
        .from("workflow_scheduled_jobs")
        .update({ status: "cancelled", last_error: "missing workflow or run" })
        .eq("id", job.id);
      continue;
    }

    const run = runRow as WorkflowRun;
    const source = (run.event_payload?._source as FireEventOptions["source"]) ?? undefined;
    const step = await runActionImmediate(wf, run, job.action, { source });

    // Append step to run log.
    const newSteps = [...(run.steps_log ?? []), step];
    const stillPending = await pendingJobsRemaining(job.workflow_run_id, job.id);
    const completed = !stillPending && step.status !== "failed";
    await sb
      .from("workflow_runs")
      .update({
        steps_log: newSteps,
        status: step.status === "failed"
          ? "failed"
          : completed
            ? "completed"
            : "running",
        completed_at: completed ? new Date().toISOString() : run.completed_at,
      })
      .eq("id", run.id);

    if (step.status === "failed") {
      failed += 1;
      await sb
        .from("workflow_scheduled_jobs")
        .update({
          status: "failed",
          last_error: step.detail ?? "unknown",
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    } else {
      processed += 1;
      await sb
        .from("workflow_scheduled_jobs")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", job.id);
    }
  }

  return { processed, failed };
}

async function pendingJobsRemaining(runId: string, excludeJobId: string): Promise<boolean> {
  const sb = await createClient();
  const { data } = await sb
    .from("workflow_scheduled_jobs")
    .select("id")
    .eq("workflow_run_id", runId)
    .eq("status", "pending")
    .neq("id", excludeJobId)
    .limit(1);
  return (data ?? []).length > 0;
}

// ---------- validation -------------------------------------------------

export function normaliseDefinition(raw: unknown): WorkflowDefinition {
  const def = (raw ?? {}) as Partial<WorkflowDefinition>;
  return {
    trigger: {
      type: (def.trigger?.type ?? "lead_created") as WorkflowTriggerType,
      filter: def.trigger?.filter,
    },
    actions: Array.isArray(def.actions) ? def.actions : [],
  };
}
