-- 0025_timeclock_punches.sql
--
-- Backing store for the uAttend integration.  Every clock-in / clock-
-- out / lunch / break event pulled from uAttend lands here.  A nightly
-- (cron, every 15min) sync pulls the last 24h from uAttend's REST API
-- and upserts on uattend_punch_id so re-pulling the same window is
-- idempotent.
--
-- Each punch carries the uAttend employee id; admins map those ids to
-- DT employees.id via integrations.config.employee_mapping (edited on
-- the /integrations → uAttend card).  An unmapped punch still gets
-- stored (employee_id NULL) so nothing is lost while the mapping is
-- being filled in.
--
-- The /timecards page aggregates these into per-week punch history
-- below each timecard.

create table if not exists timeclock_punches (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id) on delete set null,
  uattend_employee_id text,
  uattend_punch_id text unique,
  punch_type text not null check (punch_type in ('in', 'out', 'lunch_in', 'lunch_out', 'break_in', 'break_out')),
  punch_time timestamptz not null,
  device_name text,
  notes text,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_timeclock_punches_employee_id on timeclock_punches(employee_id);
create index if not exists idx_timeclock_punches_punch_time on timeclock_punches(punch_time desc);
create index if not exists idx_timeclock_punches_uattend on timeclock_punches(uattend_punch_id);

alter table timeclock_punches enable row level security;
drop policy if exists "open" on timeclock_punches;
create policy "open" on timeclock_punches for all to public using (true) with check (true);
