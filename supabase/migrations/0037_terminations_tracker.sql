-- 0037_terminations_tracker.sql
-- Config-driven terminations / offboarding tracker (Estefany request, DT).
--
-- HARD REQUIREMENT: the team can add / remove / rename / reorder steps and
-- fields themselves from the UI, no developer or deploy. So the section + field
-- DEFINITIONS are editable DATA (termination_sections / termination_fields),
-- and each per-employee record stores its answers in a jsonb `values` map keyed
-- by the field's STABLE `field_key` — renaming a field's label never orphans
-- its stored values.
--
-- Additive + idempotent (guarded enum, IF NOT EXISTS, guarded seed). Numbered
-- 0037: main ends at 0035, the unmerged seasonal branch owns 0036.
--
-- Seeds Estefany's exact 5-area structure so it works day one.

-- ---------- field type enum (guarded) -----------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'termination_field_type') then
    create type termination_field_type as enum ('text', 'date', 'yes_no', 'dropdown', 'number');
  end if;
end $$;

-- ---------- editable section definitions --------------------------------
create table if not exists termination_sections (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  sort_order int  not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- editable field definitions ----------------------------------
-- `field_key` is a stable slug (immutable identity); `label` is what the team
-- renames. `options` holds the choice list for dropdown fields.
create table if not exists termination_fields (
  id         uuid primary key default gen_random_uuid(),
  section_id uuid not null references termination_sections(id) on delete cascade,
  field_key  text not null unique,
  label      text not null,
  field_type termination_field_type not null default 'text',
  options    jsonb not null default '[]'::jsonb,
  required   boolean not null default false,
  sort_order int  not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists termination_fields_section_idx
  on termination_fields (section_id, sort_order);

-- ---------- per-employee termination records ----------------------------
-- `employee_id` is an OPTIONAL link (PEO employees may not exist in the app's
-- employees table); `employee_name` is the display source of truth. `values`
-- is { field_key: text } — everything stored as text (yes_no as 'yes'/'no',
-- dates ISO, dropdown as the chosen option). `created_by` is a name/email, NOT
-- an FK (the synthetic Owner used when auth is off has a nil-uuid id).
create table if not exists termination_records (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid references employees(id) on delete set null,
  employee_name text,
  values        jsonb not null default '{}'::jsonb,
  archived      boolean not null default false,
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists termination_records_employee_idx
  on termination_records (employee_id);
create index if not exists termination_records_archived_idx
  on termination_records (archived, created_at desc);

-- ---------- updated_at triggers (idempotent) ----------------------------
drop trigger if exists termination_sections_updated on termination_sections;
create trigger termination_sections_updated before update on termination_sections
  for each row execute function set_updated_at();
drop trigger if exists termination_fields_updated on termination_fields;
create trigger termination_fields_updated before update on termination_fields
  for each row execute function set_updated_at();
drop trigger if exists termination_records_updated on termination_records;
create trigger termination_records_updated before update on termination_records
  for each row execute function set_updated_at();

-- ---------- RLS (app-layer RBAC is the gate; open policy = app convention) --
alter table termination_sections enable row level security;
alter table termination_fields   enable row level security;
alter table termination_records  enable row level security;
drop policy if exists "open" on termination_sections;
create policy "open" on termination_sections for all to public using (true) with check (true);
drop policy if exists "open" on termination_fields;
create policy "open" on termination_fields for all to public using (true) with check (true);
drop policy if exists "open" on termination_records;
create policy "open" on termination_records for all to public using (true) with check (true);

-- ---------- SEED: Estefany's 5-area structure (guarded) -----------------
do $$
declare
  s_intake uuid; s_emp uuid; s_pay uuid; s_doc uuid; s_status uuid;
begin
  if not exists (select 1 from termination_sections) then
    insert into termination_sections (title, sort_order) values ('Intake', 0)                returning id into s_intake;
    insert into termination_sections (title, sort_order) values ('Employee Information', 1)  returning id into s_emp;
    insert into termination_sections (title, sort_order) values ('Payment Workflow', 2)      returning id into s_pay;
    insert into termination_sections (title, sort_order) values ('Document Workflow', 3)     returning id into s_doc;
    insert into termination_sections (title, sort_order) values ('Overall Status', 4)        returning id into s_status;

    insert into termination_fields (section_id, field_key, label, field_type, options, sort_order) values
      (s_intake, 'termination_taken_by', 'Termination taken by', 'dropdown', '["Leangel","Rocio","Estefany"]'::jsonb, 0),

      (s_emp, 'peo_id',            'PEO ID',                    'text',     '[]'::jsonb, 0),
      (s_emp, 'company',           'Company',                   'text',     '[]'::jsonb, 1),
      (s_emp, 'employee_name',     'Employee Name',             'text',     '[]'::jsonb, 2),
      (s_emp, 'phone',             'Phone',                     'text',     '[]'::jsonb, 3),
      (s_emp, 'email',             'Email',                     'text',     '[]'::jsonb, 4),
      (s_emp, 'termination_date',  'Termination Date',          'date',     '[]'::jsonb, 5),
      (s_emp, 'termination_reason','Termination Reason',        'text',     '[]'::jsonb, 6),
      (s_emp, 'rehire_or_dnt',     'Apply to rehire or DNT',    'dropdown', '["Rehire","DNT"]'::jsonb, 7),

      (s_pay, 'payment_type',      'Payment Type',              'dropdown', '["DD","Check"]'::jsonb, 0),
      (s_pay, 'payment_received',  'Payment Received',          'yes_no',   '[]'::jsonb, 1),

      (s_doc, 'internal_term_email_sent', 'Internal Termination Email sent', 'yes_no', '[]'::jsonb, 0),
      (s_doc, 'termination_acknowledged', 'Termination acknowledged (sign)', 'yes_no', '[]'::jsonb, 1),
      (s_doc, 'peoplease_status_term',    'Peoplease Status (term)',         'text',   '[]'::jsonb, 2),

      (s_status, 'overall_progress',        'Overall Progress',          'dropdown', '["Not Started","In Progress","Complete"]'::jsonb, 0),
      (s_status, 'files_moved_inactive',    'Files Moved to Inactive',   'yes_no',   '[]'::jsonb, 1),
      (s_status, 'docs_in_inactive_folder', 'Docs in Inactive Folder',   'yes_no',   '[]'::jsonb, 2);
  end if;
end $$;
