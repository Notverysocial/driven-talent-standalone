-- Driven Talent — Workflow Builder (module 1.10)
--
-- A no-code "When [event happens], do [action]" automation builder for
-- non-technical ops staff. Workflows are stored as JSON `definition`
-- documents interpreted at runtime by src/lib/workflows.server.ts.
--
-- For time-delayed actions ("create follow-up task in 24h") we use a
-- database-backed scheduled-job table (`workflow_scheduled_jobs`) drained
-- by a serverless tick endpoint — NO Redis/BullMQ, so the Vercel build
-- stays clean and no extra infra is needed.
--
-- Additive only — no destructive changes to any existing object.

-- ---------- enums --------------------------------------------------------

-- Which domain event fires this workflow. Names are stable strings —
-- the runtime fireWorkflowEvent() helper matches on these.
create type workflow_trigger_type as enum (
  'lead_created',
  'lead_stage_changed',
  'candidate_created',
  'candidate_stage_changed',
  'application_received',
  'inbound_call_logged',
  'incident_created',
  'task_overdue'
);

create type workflow_run_status as enum (
  'pending', 'running', 'completed', 'failed', 'skipped'
);

create type workflow_scheduled_job_status as enum (
  'pending', 'running', 'completed', 'failed', 'cancelled'
);

create type workflow_task_status as enum (
  'open', 'done', 'snoozed', 'cancelled'
);

-- ---------- workflows ----------------------------------------------------
-- One row per saved automation recipe. `definition` is the canonical
-- JSON document — shape documented in src/lib/workflows.ts.

create table if not exists workflows (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  trigger_type workflow_trigger_type not null,
  enabled boolean not null default true,
  -- Full recipe (trigger filter + ordered list of actions w/ delays).
  -- Authoritative — pages render from this, the interpreter executes it.
  definition jsonb not null default '{}'::jsonb,
  -- If the workflow was created from a built-in template, remember which
  -- one so the templates gallery can flag "Already installed".
  template_id text,
  -- Free-text label so a recruiter can mark who owns this automation.
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger workflows_updated before update on workflows
  for each row execute function set_updated_at();

create index workflows_trigger_idx on workflows (trigger_type) where enabled;
create index workflows_template_idx on workflows (template_id) where template_id is not null;

alter table workflows enable row level security;
create policy "open" on workflows for all to public using (true) with check (true);

-- ---------- workflow_runs -----------------------------------------------
-- Audit log of every time a workflow fired. Each row captures the
-- triggering event payload and a per-step trace so the UI can show
-- recruiters "Workflow X ran 8 times today, last error: …".

create table if not exists workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references workflows(id) on delete cascade,
  triggered_at timestamptz not null default now(),
  completed_at timestamptz,
  status workflow_run_status not null default 'pending',
  -- Snapshot of the event that fired this run (lead row, candidate row,
  -- etc). Persisted so delayed actions retain context after the source
  -- row has changed.
  event_payload jsonb not null default '{}'::jsonb,
  -- Per-action trace: [{action_id, type, ran_at, status, detail}].
  steps_log jsonb not null default '[]'::jsonb,
  error text
);

create index workflow_runs_workflow_idx on workflow_runs (workflow_id, triggered_at desc);
create index workflow_runs_status_idx on workflow_runs (status);

alter table workflow_runs enable row level security;
create policy "open" on workflow_runs for all to public using (true) with check (true);

-- ---------- workflow_scheduled_jobs -------------------------------------
-- Queue of delayed actions. A workflow with a "create task in 24h" step
-- inserts one row here with run_at = now() + 24h. The /api/workflows/tick
-- endpoint (called by Vercel Cron or any external scheduler) selects
-- rows where run_at <= now() and executes them.
--
-- attempts / last_error give us simple retry telemetry without needing
-- a real queue system.

create table if not exists workflow_scheduled_jobs (
  id uuid primary key default gen_random_uuid(),
  workflow_run_id uuid not null references workflow_runs(id) on delete cascade,
  workflow_id uuid not null references workflows(id) on delete cascade,
  -- The single action to execute when this job runs. Shape:
  --   { id, type, params }
  action jsonb not null,
  -- When the action becomes eligible to execute.
  run_at timestamptz not null,
  status workflow_scheduled_job_status not null default 'pending',
  attempts int not null default 0,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Single-column index on run_at lets the tick endpoint do a fast
-- "WHERE status = 'pending' AND run_at <= now()" sweep.
create index workflow_scheduled_jobs_run_at_idx
  on workflow_scheduled_jobs (run_at) where status = 'pending';
create index workflow_scheduled_jobs_run_idx
  on workflow_scheduled_jobs (workflow_run_id);

alter table workflow_scheduled_jobs enable row level security;
create policy "open" on workflow_scheduled_jobs for all to public using (true) with check (true);

-- ---------- workflow_tasks ----------------------------------------------
-- Tasks created by workflow "create_task" actions. Stored in their own
-- table so the workflow builder is fully self-contained — other modules
-- can later migrate to a unified tasks table if/when one exists.

create table if not exists workflow_tasks (
  id uuid primary key default gen_random_uuid(),
  workflow_run_id uuid references workflow_runs(id) on delete set null,
  workflow_id uuid references workflows(id) on delete set null,
  title text not null,
  notes text,
  -- Optional pointer back to the entity that triggered the workflow
  -- (lead id, candidate id, incident id, etc) plus its label for the UI.
  source_kind text,
  source_id uuid,
  source_label text,
  assigned_to text,
  due_at timestamptz,
  status workflow_task_status not null default 'open',
  completed_at timestamptz,
  completed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger workflow_tasks_updated before update on workflow_tasks
  for each row execute function set_updated_at();

create index workflow_tasks_open_due_idx
  on workflow_tasks (due_at) where status = 'open';
create index workflow_tasks_assigned_idx
  on workflow_tasks (assigned_to) where status = 'open';

alter table workflow_tasks enable row level security;
create policy "open" on workflow_tasks for all to public using (true) with check (true);
