-- Driven Talent — initial schema
--
-- Honors the existing UI: multi-client roster, weighted candidate scoring,
-- rich attendance (5 statuses), 15-step onboarding split into checklist + documents,
-- weekly timecards with regular/OT/holiday, invoices auto-generated from approved
-- timecards.

create extension if not exists "pgcrypto";

-- ---------- enums --------------------------------------------------------

create type employee_status as enum ('active', 'onboarding', 'inactive');
create type score_band as enum ('green', 'yellow', 'red');
create type attendance_status as enum ('present', 'late', 'missed', 'no_show', 'excused');
create type candidate_status as enum ('new', 'screening', 'interview', 'placed', 'inactive');
create type timecard_status as enum ('draft', 'submitted', 'approved', 'rejected');
create type invoice_status as enum ('draft', 'sent', 'paid', 'overdue', 'void');
create type onboarding_category as enum ('Documentation', 'Compliance', 'Training', 'Equipment', 'Review');

-- ---------- helpers ------------------------------------------------------

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------- clients ------------------------------------------------------

create table clients (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  city text,
  industry text,
  address text,
  contact_name text,
  contact_email text,
  terms text default 'Net 30',
  service_fee_pct numeric(5,2) default 8.00,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger clients_updated before update on clients
  for each row execute function set_updated_at();

-- ---------- employees ----------------------------------------------------

create table employees (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,                  -- "e-001" from seed; lets us re-seed deterministically
  full_name text not null,
  phone text,
  email text,
  city text,
  hire_date date,
  status employee_status not null default 'onboarding',
  score int not null default 0,           -- 0–100; 0 = onboarding (no score yet)
  band score_band,
  rank int,                               -- queue rank: 1 = front of line
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger employees_updated before update on employees
  for each row execute function set_updated_at();
create index employees_status_idx on employees (status);
create index employees_rank_idx on employees (rank);

-- ---------- employee_assignments (multi-client) -------------------------

create table employee_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  client_id uuid not null references clients(id) on delete restrict,
  position text not null,
  department text not null,
  shift text not null,
  start_date date,
  hourly_rate numeric(8,2) not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger employee_assignments_updated before update on employee_assignments
  for each row execute function set_updated_at();
create index employee_assignments_employee_idx on employee_assignments (employee_id);
create index employee_assignments_client_idx on employee_assignments (client_id);

-- ---------- candidates (with weighted-scoring criteria as JSONB) --------

create table candidates (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  city text,
  applied_for text,                       -- e.g. "Senior Caregiver · Healthcare"
  source text,                            -- e.g. "Referral · Priya Anand"
  applied_at date default current_date,
  experience_years numeric(4,1),
  certifications text[] default '{}',
  status candidate_status not null default 'new',
  resume_path text,                       -- storage path in 'resumes' bucket
  notes text,                             -- "Roxanna's Notes"
  -- 6 evaluation criteria from the existing UI: experience/skills/soft/reliability/culture/flex.
  -- Stored as JSONB array of {key,label,sub,weight,value,note}; recomputed weighted score
  -- lives in `score` (server-action computed) so we don't denormalize twice.
  criteria jsonb not null default '[]'::jsonb,
  score numeric(5,2),                     -- weighted average, 0–100
  promoted_employee_id uuid references employees(id) on delete set null,
  client_id uuid references clients(id) on delete set null,  -- target client (optional)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger candidates_updated before update on candidates
  for each row execute function set_updated_at();
create index candidates_status_idx on candidates (status);
create index candidates_client_idx on candidates (client_id);

-- ---------- attendance --------------------------------------------------

create table attendance_entries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  client_id uuid not null references clients(id) on delete restrict,
  date date not null,
  status attendance_status not null,
  check_in time,
  check_out time,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, client_id, date)
);
create trigger attendance_entries_updated before update on attendance_entries
  for each row execute function set_updated_at();
create index attendance_entries_date_idx on attendance_entries (date);
create index attendance_entries_employee_idx on attendance_entries (employee_id);

-- ---------- onboarding ---------------------------------------------------

create table onboarding_checklist_items (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  key text not null,                      -- "i9", "w4", etc. — stable identifier per item
  label text not null,
  detail text,
  category onboarding_category not null,
  done boolean not null default false,
  done_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, key)
);
create trigger onboarding_checklist_updated before update on onboarding_checklist_items
  for each row execute function set_updated_at();
create index onboarding_checklist_employee_idx on onboarding_checklist_items (employee_id);

create table onboarding_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  name text not null,
  received boolean not null default false,
  received_on date,
  file_path text,                         -- optional: scanned doc storage path
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, name)
);
create trigger onboarding_documents_updated before update on onboarding_documents
  for each row execute function set_updated_at();
create index onboarding_documents_employee_idx on onboarding_documents (employee_id);

-- ---------- timecards ---------------------------------------------------
-- One row per (employee, client, week_start). Hours stored as JSONB so we can
-- carry the existing UI's per-day shape (regular/overtime/holiday + in/out)
-- without 21 columns. Rollup totals are computed in the server action and
-- mirrored into the columns below for fast list queries.

create table timecards (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete restrict,
  client_id uuid not null references clients(id) on delete restrict,
  week_start date not null,               -- Monday of the week (date_trunc('week', ...))
  -- jsonb keyed by mon..sun, each { regular, overtime, holiday, in, out, locked }
  days jsonb not null default '{}'::jsonb,
  reg_hours numeric(6,2) not null default 0,
  ot_hours numeric(6,2) not null default 0,
  holiday_hours numeric(6,2) not null default 0,
  total_hours numeric(6,2) generated always as (reg_hours + ot_hours + holiday_hours) stored,
  hourly_rate numeric(8,2) not null,      -- snapshot of assignment rate at submit time
  status timecard_status not null default 'draft',
  submitted_at timestamptz,
  approved_by text,                       -- free-text since we have no auth yet
  approved_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, client_id, week_start)
);
create trigger timecards_updated before update on timecards
  for each row execute function set_updated_at();
create index timecards_status_idx on timecards (status);
create index timecards_week_idx on timecards (week_start);
create index timecards_employee_idx on timecards (employee_id);

-- ---------- invoices ----------------------------------------------------

create table invoices (
  id uuid primary key default gen_random_uuid(),
  number text unique not null,            -- "DT-2026-0417"
  client_id uuid not null references clients(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  issued_at date not null default current_date,
  due_at date not null,
  terms text default 'Net 30',
  subtotal numeric(12,2) not null default 0,
  fee_pct numeric(5,2) not null default 8.00,
  fee numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  status invoice_status not null default 'draft',
  sent_at timestamptz,
  paid_at timestamptz,
  pdf_path text,                          -- storage path once rendered
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger invoices_updated before update on invoices
  for each row execute function set_updated_at();
create index invoices_status_idx on invoices (status);
create index invoices_client_idx on invoices (client_id);

create table invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  department text,                        -- groups lines on the rendered invoice
  employee_name text not null,
  role text,
  hours numeric(6,2) not null default 0,
  ot_hours numeric(6,2) not null default 0,
  rate numeric(8,2) not null,
  amount numeric(12,2) not null,
  sort_order int not null default 0,
  timecard_id uuid references timecards(id) on delete set null,
  created_at timestamptz not null default now()
);
create index invoice_line_items_invoice_idx on invoice_line_items (invoice_id);

-- View: invoices with computed overdue flag (status=sent and past due).
-- The base column stays as written; the view is what the UI/dashboard reads
-- when it needs the "overdue" rollup without a daily cron.
create view invoices_with_overdue as
  select
    i.*,
    case
      when i.status = 'sent' and i.due_at < current_date then true
      else false
    end as is_overdue
  from invoices i;

-- ---------- RLS ---------------------------------------------------------
-- No-auth mode: open access via anon key. Each table gets a single permissive
-- policy. To switch to authenticated-only later, change `to public` → `to authenticated`
-- and add ownership predicates as needed.

alter table clients enable row level security;
alter table employees enable row level security;
alter table employee_assignments enable row level security;
alter table candidates enable row level security;
alter table attendance_entries enable row level security;
alter table onboarding_checklist_items enable row level security;
alter table onboarding_documents enable row level security;
alter table timecards enable row level security;
alter table invoices enable row level security;
alter table invoice_line_items enable row level security;

create policy "open" on clients                     for all to public using (true) with check (true);
create policy "open" on employees                   for all to public using (true) with check (true);
create policy "open" on employee_assignments        for all to public using (true) with check (true);
create policy "open" on candidates                  for all to public using (true) with check (true);
create policy "open" on attendance_entries          for all to public using (true) with check (true);
create policy "open" on onboarding_checklist_items  for all to public using (true) with check (true);
create policy "open" on onboarding_documents        for all to public using (true) with check (true);
create policy "open" on timecards                   for all to public using (true) with check (true);
create policy "open" on invoices                    for all to public using (true) with check (true);
create policy "open" on invoice_line_items          for all to public using (true) with check (true);

-- ---------- storage buckets ---------------------------------------------
-- Created via supabase/config.toml; storage policies live below so the anon
-- client can read its own signed URLs and upload via server actions.

insert into storage.buckets (id, name, public) values ('resumes', 'resumes', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('invoice_pdfs', 'invoice_pdfs', false)
  on conflict (id) do nothing;

create policy "resumes open" on storage.objects for all to public
  using (bucket_id = 'resumes') with check (bucket_id = 'resumes');
create policy "invoice_pdfs open" on storage.objects for all to public
  using (bucket_id = 'invoice_pdfs') with check (bucket_id = 'invoice_pdfs');
