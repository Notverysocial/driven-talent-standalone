-- 0035_payroll_report_engine.sql
--
-- Payroll / invoice / report ENGINE (Rocio call). Core principle: everything
-- is built from the time card; hours entered once propagate everywhere. This
-- migration adds the small amount of schema the engine needs on top of the
-- existing timecards / invoices / payroll_periods tables. All additive +
-- idempotent — existing rows untouched, safe to re-run.
--
-- Covers:
--   * Customizable per-client report template selection (#1)
--   * Roster auto add/remove observability (#3)
--   * Explicit period verification / sign-off, retained even when automated (#4)

-- ---------------------------------------------------------------------------
-- 1) Per-client report template (customizable report builder)
-- ---------------------------------------------------------------------------
-- `report_format` (migration 0001) is a fixed 3-value enum. The new builder is
-- template-driven: `report_template_key` selects a template from the code
-- catalog (src/lib/reports/templates.ts) and `report_options` carries per-client
-- overrides (granularity, included columns, label). Both nullable/default so
-- existing clients keep rendering via report_format until a template is chosen.
alter table clients
  add column if not exists report_template_key text,
  add column if not exists report_options     jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- 2) Roster sync runs (auto add/remove observability)
-- ---------------------------------------------------------------------------
-- One row per roster reconciliation pass. The active-employee list (driven by
-- time-card activity + the uAttend employee feed) is the single source of
-- truth; this records what each sync added / removed / flagged so the manual
-- delete-add that causes errors is replaced by an observable, reversible run.
create table if not exists roster_sync_runs (
  id            uuid primary key default gen_random_uuid(),
  ran_at        timestamptz not null default now(),
  ran_by        text,
  source        text not null default 'timecards'
                  check (source in ('timecards', 'uattend', 'manual')),
  added_count   int not null default 0,
  removed_count int not null default 0,
  flagged_count int not null default 0,
  -- Per-employee detail of what changed: [{ employee_id, name, action, reason }]
  details       jsonb not null default '[]'::jsonb,
  notes         text,
  created_at    timestamptz not null default now()
);

create index if not exists roster_sync_runs_ran_at_idx
  on roster_sync_runs (ran_at desc);

alter table roster_sync_runs enable row level security;
drop policy if exists "open" on roster_sync_runs;
create policy "open" on roster_sync_runs for all to public
  using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 3) Period verifications (explicit audit / verification sign-off)
-- ---------------------------------------------------------------------------
-- Rocio wants to retain the explicit verification step even once automated.
-- Each row is a sign-off snapshot for a payroll period: did time-card hours
-- match invoiced hours and payroll hours, and did the "deduction = zero"
-- check pass. `details` holds the per-employee variance rows computed at
-- verification time so the sign-off is reproducible.
create table if not exists period_verifications (
  id                 uuid primary key default gen_random_uuid(),
  payroll_period_id  uuid not null references payroll_periods(id) on delete cascade,
  verified_by        text,
  verified_at        timestamptz not null default now(),
  result             text not null default 'clean'
                       check (result in ('clean', 'variances')),
  employee_count     int not null default 0,
  variance_count     int not null default 0,
  -- The "deduction = zero" reconciliation passed (net pay deductions net out).
  deduction_zero_ok  boolean not null default true,
  details            jsonb not null default '[]'::jsonb,
  notes              text,
  created_at         timestamptz not null default now()
);

create index if not exists period_verifications_period_idx
  on period_verifications (payroll_period_id, verified_at desc);

alter table period_verifications enable row level security;
drop policy if exists "open" on period_verifications;
create policy "open" on period_verifications for all to public
  using (true) with check (true);
