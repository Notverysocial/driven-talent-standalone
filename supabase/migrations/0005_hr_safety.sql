-- Driven Talent — HR & Safety compliance schema
--
-- Adds storage for:
--   1. Sick time accrual / usage events (paired with the existing
--      employees.sick_hours_balance + timecards.sick_hours).
--   2. Leave-of-absence requests (CA CFRA / PDL / personal / military / etc).
--   3. Safety incidents — mirrors the fields in Driven Talent's Workplace
--      Injury & Incident Response SOP (DWC-1, S1 Medical Triage, witnesses).
--   4. Disciplinary / performance warnings.
--
-- All RLS policies follow the existing "open to public" convention used by
-- the other tables — auth will be tightened in a later milestone.

-- ---------- enums --------------------------------------------------------

create type sick_entry_type as enum (
  'accrual', 'usage', 'adjustment', 'payout'
);

create type loa_type as enum (
  'medical', 'cfra', 'pdl', 'personal', 'bereavement',
  'military', 'jury_duty', 'workers_comp', 'other'
);

create type loa_status as enum (
  'requested', 'approved', 'denied', 'active', 'returned', 'cancelled'
);

create type incident_type as enum (
  'injury', 'illness', 'near_miss', 'property_damage', 'vehicle', 'other'
);

create type incident_severity as enum (
  'first_aid', 'recordable', 'lost_time', 'fatality', 'unknown'
);

create type incident_status as enum (
  'reported', 'investigating', 'resolved', 'closed'
);

create type warning_level as enum (
  'verbal', 'written', 'final', 'suspension'
);

create type warning_category as enum (
  'attendance', 'performance', 'conduct', 'safety', 'policy', 'other'
);

-- ---------- sick time ----------------------------------------------------
-- One row per accrual or usage event. The employees.sick_hours_balance
-- column (added in 0001) is the running cache; this table is the audit log
-- the CA paid-sick-leave statute (Labor Code § 246) effectively requires
-- ("itemized record of available sick days").

create table sick_time_entries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  entry_date date not null default current_date,
  entry_type sick_entry_type not null,
  -- Always stored as a positive magnitude; entry_type tells you the sign.
  -- (usage / payout reduce balance, accrual / adjustment can go either way
  --  via a separate signed delta below.)
  hours numeric(6,2) not null check (hours >= 0),
  -- Signed delta applied to employees.sick_hours_balance — positive for
  -- accrual and positive adjustments, negative for usage / payout / negative
  -- adjustments. Stored as a generated column so it's always consistent
  -- with `hours` + `entry_type`.
  balance_delta numeric(6,2) generated always as (
    case entry_type
      when 'accrual'    then hours
      when 'usage'      then -hours
      when 'payout'     then -hours
      when 'adjustment' then hours
    end
  ) stored,
  notes text,
  client_id uuid references clients(id) on delete set null,
  timecard_id uuid references timecards(id) on delete set null,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger sick_time_entries_updated before update on sick_time_entries
  for each row execute function set_updated_at();
create index sick_time_entries_employee_idx on sick_time_entries (employee_id);
create index sick_time_entries_date_idx on sick_time_entries (entry_date);
create index sick_time_entries_type_idx on sick_time_entries (entry_type);

alter table sick_time_entries enable row level security;
create policy "open" on sick_time_entries for all to public using (true) with check (true);

-- ---------- leave of absence --------------------------------------------

create table leave_of_absence_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  type loa_type not null,
  status loa_status not null default 'requested',
  requested_at date not null default current_date,
  start_date date not null,
  end_date date,                     -- planned end; null for indefinite
  return_date date,                  -- actual return-to-work date
  reason text,
  protected boolean not null default false,  -- CFRA / PDL / other statute
  paid boolean not null default false,
  approved_by text,
  approved_at timestamptz,
  notes text,
  documents jsonb not null default '[]'::jsonb,  -- [{name, file_path, ...}]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loa_end_after_start check (end_date is null or end_date >= start_date)
);

create trigger loa_requests_updated before update on leave_of_absence_requests
  for each row execute function set_updated_at();
create index loa_employee_idx on leave_of_absence_requests (employee_id);
create index loa_status_idx on leave_of_absence_requests (status);
create index loa_start_idx on leave_of_absence_requests (start_date);

alter table leave_of_absence_requests enable row level security;
create policy "open" on leave_of_absence_requests for all to public using (true) with check (true);

-- ---------- safety incidents --------------------------------------------
-- Field set mirrors the Workplace Injury & Incident Response SOP (Form 01
-- — Incident Investigation Form). The compliance-flag columns
-- (s1_triage_called_at, dwc1_sent_at, etc) let the UI surface what's still
-- outstanding for each incident.

create table safety_incidents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  incident_date date not null,
  incident_time time,
  reported_at timestamptz not null default now(),
  type incident_type not null default 'injury',
  severity incident_severity not null default 'unknown',
  status incident_status not null default 'reported',
  body_part text,
  location text,                     -- client, building, area
  description text not null,
  what_happened text,
  equipment_used text,
  hazardous_conditions text,
  immediate_treatment text,
  witnesses jsonb not null default '[]'::jsonb,   -- [{name, contact}]
  s1_triage_called_at timestamptz,
  safety_manager_notified_at timestamptz,
  client_notified_at timestamptz,
  dwc1_sent_at timestamptz,
  refusal_signed_at timestamptz,
  reported_by text,
  follow_up text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger safety_incidents_updated before update on safety_incidents
  for each row execute function set_updated_at();
create index safety_incidents_employee_idx on safety_incidents (employee_id);
create index safety_incidents_client_idx on safety_incidents (client_id);
create index safety_incidents_status_idx on safety_incidents (status);
create index safety_incidents_date_idx on safety_incidents (incident_date);

alter table safety_incidents enable row level security;
create policy "open" on safety_incidents for all to public using (true) with check (true);

-- ---------- disciplinary warnings ---------------------------------------

create table disciplinary_warnings (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  issued_date date not null default current_date,
  level warning_level not null,
  category warning_category not null,
  description text not null,
  action_required text,
  employee_response text,
  issued_by text,
  witnessed_by text,
  acknowledged_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger disciplinary_warnings_updated before update on disciplinary_warnings
  for each row execute function set_updated_at();
create index disciplinary_warnings_employee_idx on disciplinary_warnings (employee_id);
create index disciplinary_warnings_issued_idx on disciplinary_warnings (issued_date);
create index disciplinary_warnings_level_idx on disciplinary_warnings (level);

alter table disciplinary_warnings enable row level security;
create policy "open" on disciplinary_warnings for all to public using (true) with check (true);
