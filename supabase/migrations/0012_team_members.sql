-- Driven Talent — Internal team admin + employee separations
--
-- Adds storage for:
--   1. team_members — internal DT staff/admin directory (roles, contact info,
--      active/inactive). Separate from `employees` (which is the field
--      workforce placed at clients).
--   2. employee_separations — termination / do-not-return ledger so the
--      Terminated view has full context (date, reason, eligibility, who
--      processed). Keyed off existing employees.id.
--
-- Additionally, additively extends the existing `employee_status` enum
-- with two new values so the same `employees.status` column can express
-- 'terminated' and 'do_not_return'. ALTER TYPE … ADD VALUE is additive —
-- no existing rows are altered and the column type is unchanged.
--
-- All RLS policies follow the existing "open to public" convention used
-- by migrations 0003-0006 — auth will be tightened in a later milestone.

-- ---------- enums --------------------------------------------------------

-- Additive: append two new employee_status values used by the Terminated
-- / Do-Not-Return view. IF NOT EXISTS keeps re-runs idempotent.
alter type employee_status add value if not exists 'terminated';
alter type employee_status add value if not exists 'do_not_return';

create type team_member_role as enum (
  'founder',
  'admin',
  'recruiter',
  'safety_manager',
  'onboarding_coordinator',
  'payroll',
  'finance',
  'sales',
  'staff'
);

create type team_member_status as enum ('active', 'inactive');

create type separation_reason as enum (
  'voluntary',          -- employee resigned
  'job_abandonment',    -- no show / no call
  'performance',        -- termination for performance
  'conduct',            -- termination for conduct / policy
  'attendance',         -- termination for attendance pattern
  'reduction_in_force', -- layoff / RIF
  'end_of_assignment',  -- client ended assignment, no other placement
  'mutual',             -- mutual parting
  'other'
);

create type separation_eligibility as enum (
  'eligible',           -- rehire OK
  'conditional',        -- rehire OK for specific clients / roles only
  'do_not_return'       -- DNR — never place again
);

-- ---------- team_members -------------------------------------------------
-- Internal DT staff: founder, recruiters, safety manager, coordinators,
-- payroll/finance, etc. This is the source-of-truth for the Admin →
-- Team Members page and (in a later milestone) for the `recruiter` /
-- `onboarding_in_charge` text fields on the employees table.

create table team_members (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  role team_member_role not null default 'staff',
  status team_member_status not null default 'active',
  title text,                                  -- free-text job title (e.g. "Lead Recruiter")
  initials text,                               -- 2-3 char avatar fallback ("RV", "EM")
  start_date date,
  end_date date,                               -- set when status flips to inactive
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_members_email_unique unique (email)
);

create trigger team_members_updated before update on team_members
  for each row execute function set_updated_at();
create index team_members_status_idx on team_members (status);
create index team_members_role_idx on team_members (role);
create index team_members_name_idx on team_members (full_name);

alter table team_members enable row level security;
create policy "open" on team_members for all to public using (true) with check (true);

-- ---------- employee_separations -----------------------------------------
-- Append-only-ish ledger for terminations / DNR decisions. One row per
-- separation event; a rehired employee that later separates again gets
-- a second row. The employees.status column is the authoritative
-- current-state field; this table is the audit log + context.

create table employee_separations (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  separation_date date not null default current_date,
  reason separation_reason not null,
  eligibility separation_eligibility not null default 'eligible',
  client_id uuid references clients(id) on delete set null,
  last_position text,
  detail text,                                 -- narrative description
  do_not_return_note text,                     -- shown prominently when eligibility = 'do_not_return'
  processed_by text,                           -- DT staff who processed (free text for now)
  final_check_issued boolean not null default false,
  final_check_date date,
  equipment_returned boolean not null default false,
  exit_interview_done boolean not null default false,
  rehire_allowed_clients uuid[] default '{}',  -- for eligibility='conditional'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger employee_separations_updated before update on employee_separations
  for each row execute function set_updated_at();
create index employee_separations_employee_idx on employee_separations (employee_id);
create index employee_separations_date_idx on employee_separations (separation_date);
create index employee_separations_eligibility_idx on employee_separations (eligibility);
create index employee_separations_reason_idx on employee_separations (reason);

alter table employee_separations enable row level security;
create policy "open" on employee_separations for all to public using (true) with check (true);

-- ---------- e-signature requests ----------------------------------------
-- Provider-agnostic record of every e-signature request kicked off from
-- the onboarding flow. The provider column lets us run multiple e-sign
-- backends side-by-side during the PandaDocs → Documenso migration and
-- keep history when the active provider changes again later.

create type esign_provider as enum (
  'documenso',          -- open-source, current default
  'docuseal',           -- open-source alternative
  'dropbox_sign',       -- formerly HelloSign
  'pandadocs',          -- legacy — kept so historical rows still resolve
  'manual'              -- printed + scanned, no platform
);

create type esign_status as enum (
  'draft',
  'sent',
  'viewed',
  'signed',
  'declined',
  'expired',
  'cancelled'
);

create table esignature_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  document_kind text not null,                 -- 'welcome_letter' | 'agreement_expectations' | custom
  document_title text not null,
  provider esign_provider not null default 'documenso',
  provider_request_id text,                    -- external id from the e-sign platform
  signing_url text,                            -- URL the recipient signs at
  status esign_status not null default 'draft',
  recipient_email text,
  recipient_name text,
  sent_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,
  declined_at timestamptz,
  signed_pdf_path text,                        -- storage path once complete
  checklist_item_key text,                     -- onboarding_checklist_items.key to flip on completion
  webhook_payload jsonb,                       -- last raw webhook for debugging
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger esignature_requests_updated before update on esignature_requests
  for each row execute function set_updated_at();
create index esignature_requests_employee_idx on esignature_requests (employee_id);
create index esignature_requests_status_idx on esignature_requests (status);
create index esignature_requests_provider_idx on esignature_requests (provider);
create index esignature_requests_kind_idx on esignature_requests (document_kind);

alter table esignature_requests enable row level security;
create policy "open" on esignature_requests for all to public using (true) with check (true);
