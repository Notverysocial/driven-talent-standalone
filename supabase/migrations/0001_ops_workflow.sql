-- Driven Talent — ops workflow extensions
--
-- Adds the schema needed to incorporate the DT ops team's full workflow
-- (Recruitment ATS, HR/Onboarding from Estefany's spec, Payroll/SOP).

-- ---------- Recruitment: candidate_status enum migration --------------
-- Old values: new, screening, interview, placed, inactive
-- New values: applied, screening, interview, offer, hired, rejected
-- Postgres can't drop enum values cleanly, so we replace the type wholesale.

create type candidate_status_v2 as enum (
  'applied', 'screening', 'interview', 'offer', 'hired', 'rejected'
);

alter table candidates alter column status drop default;

alter table candidates
  alter column status type candidate_status_v2 using (
    case status::text
      when 'new' then 'applied'
      when 'placed' then 'hired'
      when 'inactive' then 'rejected'
      else status::text
    end::candidate_status_v2
  );

alter table candidates alter column status set default 'applied';

drop type candidate_status;
alter type candidate_status_v2 rename to candidate_status;

-- Recruiter on candidates (free text — not modeled as users yet)
alter table candidates add column if not exists recruiter text;

-- ---------- HR/Onboarding: status enum + per-item notes ---------------

create type onboarding_status as enum (
  'not_started', 'in_progress', 'done', 'na'
);

-- Replace boolean `done` with a 4-value status. Backfill from the existing
-- column, then drop it. Add per-item notes column.
alter table onboarding_checklist_items
  add column if not exists status onboarding_status not null default 'not_started',
  add column if not exists notes text;

update onboarding_checklist_items
  set status = case when done then 'done'::onboarding_status else 'not_started'::onboarding_status end;

alter table onboarding_checklist_items drop column if exists done;

-- General onboarding info on the employee record. The "company" lives on
-- the assignment (employee_assignments.client_id), not duplicated here.
alter table employees
  add column if not exists recruiter text,
  add column if not exists onboarding_in_charge text;

-- Welcome letter draft (one most-recent draft per employee). Stored so the
-- operator's edits persist between sessions.
create table if not exists welcome_letter_drafts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade unique,
  body text not null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'welcome_letter_drafts_updated') then
    create trigger welcome_letter_drafts_updated before update on welcome_letter_drafts
      for each row execute function set_updated_at();
  end if;
end $$;
alter table welcome_letter_drafts enable row level security;
drop policy if exists "open" on welcome_letter_drafts;
create policy "open" on welcome_letter_drafts for all to public using (true) with check (true);

-- ---------- Payroll: periods + sick + flags ---------------------------

create type payroll_period_status as enum (
  'open', 'audited', 'submitted', 'approved', 'closed'
);

create table if not exists payroll_periods (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null,
  status payroll_period_status not null default 'open',
  approved_by text,
  approved_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (start_date, end_date)
);
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'payroll_periods_updated') then
    create trigger payroll_periods_updated before update on payroll_periods
      for each row execute function set_updated_at();
  end if;
end $$;
alter table payroll_periods enable row level security;
drop policy if exists "open" on payroll_periods;
create policy "open" on payroll_periods for all to public using (true) with check (true);

-- Sick + discrepancy flags on timecards. The total_hours generated column
-- references reg_hours/ot_hours/holiday_hours, so we must drop & recompute
-- to include sick.
alter table timecards
  add column if not exists sick_hours numeric(6,2) not null default 0,
  add column if not exists flags jsonb not null default '{}'::jsonb,
  add column if not exists payroll_period_id uuid references payroll_periods(id) on delete set null;

alter table timecards drop column if exists total_hours;
alter table timecards
  add column total_hours numeric(7,2)
    generated always as (reg_hours + ot_hours + holiday_hours + sick_hours) stored;

-- Sick balance per employee
alter table employees
  add column if not exists sick_hours_balance numeric(6,2) not null default 0;

-- ---------- Invoice extensions ----------------------------------------
-- bill_to_client_name lets operators bill a parent entity that differs
-- from the client_id record (FabFitFun ↔ FFF Brands LLC, etc).
-- employee_cost on line items enables margin %.

alter table invoices
  add column if not exists bill_to_client_name text,
  add column if not exists payroll_period_id uuid references payroll_periods(id) on delete set null;

alter table invoice_line_items
  add column if not exists employee_cost numeric(12,2);

-- Per-client report preference: FabFitFun = Hours Spent Report; ISC =
-- Timecard Report. Used by the payroll export endpoint.
alter table clients
  add column if not exists report_format text check (report_format in ('hours_spent', 'timecard', 'standard')) default 'standard';

-- ---------- Refresh invoices_with_overdue view to pick up new columns -
-- `create or replace view` won't work here: invoices now has new columns,
-- so i.* changes shape and Postgres refuses to rebind the existing column
-- names. Drop and recreate.

drop view if exists invoices_with_overdue cascade;
create view invoices_with_overdue as
  select
    i.*,
    case
      when i.status = 'sent' and i.due_at < current_date then true
      else false
    end as is_overdue
  from invoices i;
