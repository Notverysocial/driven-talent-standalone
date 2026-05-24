-- Driven Talent — In-app Bug Report queue
--
-- Closed-loop reporting for the internal ops app: any team member can file
-- a bug from the floating "Report a bug" affordance in the app shell.
-- Reports land in the /bug-reports admin queue (severity-sorted) where
-- they progress through new → in_progress → resolved (with wont_fix /
-- duplicate as terminal states for triage hygiene).
--
-- Additive only — new enums + new table. No changes to existing objects.
-- RLS "open" policy consistent with migrations 0003–0006.

-- ---------- enums --------------------------------------------------------

create type bug_severity as enum (
  'low', 'medium', 'high', 'critical'
);

create type bug_status as enum (
  'new', 'in_progress', 'resolved', 'wont_fix', 'duplicate'
);

-- ---------- bug_reports --------------------------------------------------

create table bug_reports (
  id uuid primary key default gen_random_uuid(),
  -- Free-text — the report form is open to anyone on the team and we do
  -- not yet have an app-wide auth identity to bind to. The dev side uses
  -- this to follow up if context is missing.
  reporter_name text,
  reporter_email text,
  -- Pathname captured from the client at report time (e.g. "/payroll").
  -- Helps dev reproduce without asking "where were you?".
  page_path text,
  -- Optional human-readable hint (e.g. "Payroll · period W22-2026").
  page_label text,
  -- Light browser context — populated client-side, useful for repros.
  user_agent text,
  description text not null,
  steps_to_reproduce text,
  severity bug_severity not null default 'medium',
  status bug_status not null default 'new',
  -- Optional attachment reference. We do not provision storage in this
  -- migration; this column is a forward-compatible pointer (path or URL)
  -- so a later wave can wire up the Supabase Storage bucket without a
  -- schema change.
  attachment_path text,
  -- Dev-side triage fields.
  assigned_to text,
  resolution_notes text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger bug_reports_updated before update on bug_reports
  for each row execute function set_updated_at();

create index bug_reports_status_idx on bug_reports (status);
create index bug_reports_severity_idx on bug_reports (severity);
create index bug_reports_created_idx on bug_reports (created_at desc);

alter table bug_reports enable row level security;
create policy "open" on bug_reports for all to public using (true) with check (true);
