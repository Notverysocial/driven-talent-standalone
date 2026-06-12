-- Driven Talent — live data migration columns (2026-06-08)
--
-- Adds the columns required to land Antonio's live operational spreadsheet
-- (DT-LIVE-DATA-2026-06-08.xlsx) into the app without losing fields:
--
--   • employees: peo / background-check / docusign / file readiness flags,
--                manager-contact free-text, raw-status string (preserves
--                "Activo"/"Inactivo"), uncategorized JSON bucket.
--   • employee_assignments: wc_code, wc_percent, markup_percent,
--                manager_contact_name, manager_contact_email so the
--                spreadsheet's manager contact (Name - email) on each
--                employee row survives, plus the comp/bill detail visible
--                to all users (per Antonio's call).
--   • positions: 32-column open-positions sheet has fields the current
--                positions table doesn't cover — job_category, locality,
--                pay min/max, schedule_hours, end_date, deadline_to_fill,
--                manager_email, extra_cc, internal_client_manager,
--                recruiter_email, backup_recruiter, resume_required,
--                bilingual, special_skills, job_description_url,
--                resume_folder, posted_redes / posted_indeed /
--                posted_linkedin booleans, priority, company_name.
--   • do_not_return: net-new table for the "DO NOT RETURN" candidate
--                blocklist. App will reference at candidate-intake time
--                (not wired in this migration).
--   • migration_unresolved: catch-all for any row that fails to land
--                cleanly. JSON dump + source-sheet + row-number.
--
-- Additive only — no destructive changes to existing tables.

-- ---------- employees ---------------------------------------------------

alter table employees
  add column if not exists peo_status text,
  add column if not exists background_check_status text,
  add column if not exists docusign_status text,
  add column if not exists file_status text,
  add column if not exists raw_status text,
  add column if not exists manager_contact text,
  add column if not exists uncategorized jsonb not null default '{}'::jsonb;

-- ---------- employee_assignments ----------------------------------------

alter table employee_assignments
  add column if not exists wc_code text,
  add column if not exists wc_percent numeric(6,4),
  add column if not exists markup_percent numeric(6,2),
  add column if not exists manager_contact_name text,
  add column if not exists manager_contact_email text;

-- ---------- positions (Open Positions sheet) ----------------------------

alter table positions
  add column if not exists priority text,
  add column if not exists company_name text,
  add column if not exists job_category text,
  add column if not exists city text,
  add column if not exists locality text,
  add column if not exists min_pay_rate numeric(8,2),
  add column if not exists max_pay_rate numeric(8,2),
  add column if not exists schedule_hours text,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists deadline_to_fill text,
  add column if not exists hiring_manager text,
  add column if not exists manager_email text,
  add column if not exists extra_cc text,
  add column if not exists internal_client_manager text,
  add column if not exists recruiter_email text,
  add column if not exists backup_recruiter text,
  add column if not exists resume_required boolean,
  add column if not exists bilingual boolean,
  add column if not exists special_skills text,
  add column if not exists job_description_url text,
  add column if not exists resume_folder text,
  add column if not exists posted_redes boolean default false,
  add column if not exists posted_indeed boolean default false,
  add column if not exists posted_linkedin boolean default false;

-- ---------- do_not_return ----------------------------------------------

create table if not exists do_not_return (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  last_company text,
  reason text,
  severity text,
  date_logged date,
  reported_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'do_not_return_updated') then
    create trigger do_not_return_updated before update on do_not_return
      for each row execute function set_updated_at();
  end if;
end $$;

create index if not exists do_not_return_full_name_idx on do_not_return (lower(full_name));
create index if not exists do_not_return_phone_idx on do_not_return (phone) where phone is not null;

alter table do_not_return enable row level security;
drop policy if exists "open" on do_not_return;
create policy "open" on do_not_return for all to public using (true) with check (true);

-- ---------- migration_unresolved ---------------------------------------

create table if not exists migration_unresolved (
  id uuid primary key default gen_random_uuid(),
  source_sheet text not null,
  source_row int,
  reason text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table migration_unresolved enable row level security;
drop policy if exists "open" on migration_unresolved;
create policy "open" on migration_unresolved for all to public using (true) with check (true);
