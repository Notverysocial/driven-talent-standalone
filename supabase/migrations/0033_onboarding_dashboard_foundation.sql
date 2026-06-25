-- 0033_onboarding_dashboard_foundation.sql
--
-- Foundational onboarding-tracker features from the 2026-06-24 Estefany
-- meeting backlog (DT "Website + App Build" list). All additive + idempotent
-- — existing rows untouched, safe to re-run.
--
-- NOTE on numbering: this branch is cut from `main` (which ends at 0031). The
-- parallel `feat/integrations-completion` branch owns `0032_message_channel_phone`.
-- This migration is deliberately numbered 0033 to avoid a filename collision
-- when both branches land on main.
--
-- Covers:
--   * Client config — workers-comp code/class + DT account manager ("who's the
--     charge")                                              [task 86e20w8qy]
--   * Per-client × position workers-comp code mapping       [task 86e20w8tq]
--   * Language preference (EN/ES → doc language) on the
--     employee + candidate (applicant) record              [task 86e20w8yz]
--   * PEOPLEASE forms tracker (W-2 / I-9 / general info)
--     with per-employee completion status                  [task 86e20w8v9]

-- ---------------------------------------------------------------------------
-- 1) Client config: workers-comp + account manager (task 86e20w8qy)
-- ---------------------------------------------------------------------------
-- The client's *default* workers-comp code/class (the one PEOPLEASE assigns to
-- the account) plus the DT person responsible for the account. Per-position
-- overrides live in client_workers_comp_codes (below).
alter table clients
  add column if not exists workers_comp_code  text,
  add column if not exists workers_comp_class text,
  add column if not exists account_manager    text,
  add column if not exists workers_comp_notes text;

-- ---------------------------------------------------------------------------
-- 2) Workers-comp code mapping per client + position (task 86e20w8tq)
-- ---------------------------------------------------------------------------
-- One row per (client, position). The WC code/class an employee inherits is
-- looked up by their assignment's client + position, falling back to the
-- client default above when no position-specific row exists.
create table if not exists client_workers_comp_codes (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  position    text not null,
  wc_code     text not null,
  wc_class    text,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (client_id, position)
);

create index if not exists client_wc_codes_client_idx
  on client_workers_comp_codes (client_id);

create trigger client_wc_codes_updated before update on client_workers_comp_codes
  for each row execute function set_updated_at();

alter table client_workers_comp_codes enable row level security;
drop policy if exists "open" on client_workers_comp_codes;
create policy "open" on client_workers_comp_codes for all to public
  using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 3) Language preference EN/ES (task 86e20w8yz)
-- ---------------------------------------------------------------------------
-- Drives the language of onboarding docs / welcome letter. Defaults to 'en'
-- so existing rows render identically. The app already ships EN/ES UI i18n;
-- this is the *person's* document-language preference, stored on the record.
alter table employees
  add column if not exists language_pref text not null default 'en'
    check (language_pref in ('en', 'es'));

alter table candidates
  add column if not exists language_pref text not null default 'en'
    check (language_pref in ('en', 'es'));

-- ---------------------------------------------------------------------------
-- 4) PEOPLEASE forms tracker (task 86e20w8v9)
-- ---------------------------------------------------------------------------
-- Mirrors the PEOPLEASE new-hire forms view (W-2/W-4, I-9, general info, direct
-- deposit, etc.) with a per-employee completion status. Distinct from the
-- onboarding checklist (operator workflow steps) and onboarding_documents
-- (free-text uploaded files): this is the fixed PEO forms packet, tracked
-- form-by-form. `form_key` matches the PEOPLEASE_FORMS template in
-- src/lib/peoplease-forms.ts; rows are materialized on demand (self-heal).
create table if not exists employee_peoplease_forms (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references employees(id) on delete cascade,
  form_key     text not null,
  label        text not null,
  status       text not null default 'pending'
                 check (status in ('pending', 'in_progress', 'complete', 'na')),
  completed_on date,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (employee_id, form_key)
);

create index if not exists emp_peoplease_forms_emp_idx
  on employee_peoplease_forms (employee_id);

create trigger emp_peoplease_forms_updated before update on employee_peoplease_forms
  for each row execute function set_updated_at();

alter table employee_peoplease_forms enable row level security;
drop policy if exists "open" on employee_peoplease_forms;
create policy "open" on employee_peoplease_forms for all to public
  using (true) with check (true);
