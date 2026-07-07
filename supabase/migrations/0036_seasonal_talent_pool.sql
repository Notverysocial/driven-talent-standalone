-- 0036_seasonal_talent_pool.sql
-- Seasonal Talent Pool / Rehire Database (internal ClickUp 86e1vwzuq).
--
-- RECONCILED TO DEPLOYED REALITY (2026-07-06). The DT HR overhaul shipped this
-- exact DB layer to prod out-of-band BEFORE this branch merged: the `candidates`
-- table already has all of these columns (lifecycle_status, placement_history,
-- last_placement_end, skills, preferred_location, preferred_shift,
-- do_not_return_reason) plus promoted_employee_id, AND the five-value lifecycle
-- enum already exists in prod under the name `lifecycle_status` (NOT
-- `candidate_lifecycle_status`, which is what an earlier draft of this file
-- created). This migration is therefore rewritten to be a clean, guarded NO-OP
-- against the live schema:
--   * references the EXISTING `lifecycle_status` enum; never CREATEs an enum.
--   * every column add is `IF NOT EXISTS` -> skipped on prod (all present).
--   * every index is `IF NOT EXISTS`.
--   * the status->lifecycle backfill is cast to ::lifecycle_status (the live
--     enum) and guarded so it only runs on an un-categorized table, so it can
--     never clobber the categorizations the HR overhaul already wrote to prod.
--   * the placeholder demo seed is guarded to only fire on an EMPTY candidates
--     table (a fresh dev DB), so it can never inject fake rows into the client's
--     populated prod.
-- Applying this to the live prod DB does nothing and errors nothing. Applying it
-- to a fresh/empty DB provisions the columns/indexes and demo seed as before.
--
-- The `employees` table owns active staff + the Do Not Return list view; this
-- lifecycle layer lives on the `candidates` table, linked by
-- candidates.promoted_employee_id where a candidate became an employee.

-- ---------- lifecycle enum ----------------------------------------------
-- The enum already exists in prod as `lifecycle_status`. We do NOT create it
-- (and do NOT create `candidate_lifecycle_status`). On a fresh DB where the
-- HR-overhaul schema has not been applied, create the enum under the same
-- live name so the column add below can reference it. Guarded: no-op if present.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'lifecycle_status') then
    create type lifecycle_status as enum (
      'new_applicant',
      'in_process',
      'placed',
      'available_for_rehire',
      'do_not_return'
    );
  end if;
end $$;

-- ---------- columns -----------------------------------------------------
-- All present in prod -> every add is skipped. The enum column references the
-- live `lifecycle_status` type.
alter table candidates
  add column if not exists lifecycle_status lifecycle_status not null default 'new_applicant',
  -- per-placement log: array of {client_id, client_name, role, season,
  -- start_date, end_date, reason_for_end}
  add column if not exists placement_history jsonb not null default '[]'::jsonb,
  -- derived from the most recent placement_history end_date; powers the
  -- "available since" sort on the Available For Rehire tab.
  add column if not exists last_placement_end timestamptz,
  add column if not exists skills text[] not null default '{}',
  add column if not exists preferred_location text,
  add column if not exists preferred_shift text,
  -- only meaningful when lifecycle_status = 'do_not_return'
  add column if not exists do_not_return_reason text;

create index if not exists candidates_lifecycle_idx
  on candidates (lifecycle_status);
create index if not exists candidates_last_placement_end_idx
  on candidates (last_placement_end desc nulls last);
create index if not exists candidates_skills_gin
  on candidates using gin (skills);

-- ---------- backfill from the existing ATS status -----------------------
-- Documented mapping. `rejected` maps to do_not_return because, in a
-- rehire-pool framing, a rejected candidate is one DT decided not to move
-- forward with; this keeps them out of the active rehire funnel. Recruiters
-- can retag any that were merely rejected-for-one-role.
--
-- Guarded so it ONLY runs when the lifecycle column is entirely un-categorized
-- (every row still at the 'new_applicant' default). On live prod the HR overhaul
-- already categorized candidates, so non-default rows exist and this is skipped
-- -- it can never overwrite prod categorizations. Cast is ::lifecycle_status
-- (the live enum), not the never-created ::candidate_lifecycle_status.
do $$
begin
  if not exists (select 1 from candidates where lifecycle_status <> 'new_applicant') then
    update candidates
      set lifecycle_status = case status
        when 'hired'     then 'placed'
        when 'offer'     then 'in_process'
        when 'interview' then 'in_process'
        when 'screening' then 'in_process'
        when 'applied'   then 'new_applicant'
        when 'rejected'  then 'do_not_return'
        else 'new_applicant'
      end::lifecycle_status
      where lifecycle_status = 'new_applicant';
  end if;
end $$;

-- ---------- placeholder seed --------------------------------------------
-- Proves out all five tabs without importing real PII. Guarded to only fire on
-- an EMPTY candidates table (a fresh dev DB) so it can NEVER inject fake rows
-- into the client's populated prod. The real "DO NOT RETURN EMPLOYEES" import
-- is tracked separately (ClickUp 86e1vwzuq).
do $$
begin
  if not exists (select 1 from candidates) then
    insert into candidates
      (full_name, city, applied_for, source, status, lifecycle_status,
       skills, preferred_location, preferred_shift, last_placement_end,
       placement_history, do_not_return_reason)
    values
      ('Sample Rehire One', 'Phoenix', 'Warehouse Associate', 'Seed · Talent Pool',
       'hired', 'available_for_rehire',
       array['forklift','picking','packing'], 'Phoenix', '1st shift',
       now() - interval '45 days',
       '[{"client_name":"Demo Distribution Co","role":"Warehouse Associate","season":"Summer 2025","start_date":"2025-05-01","end_date":"2025-08-15","reason_for_end":"Seasonal end"}]'::jsonb,
       null),
      ('Sample Rehire Two', 'Mesa', 'Forklift Operator', 'Seed · Talent Pool',
       'hired', 'available_for_rehire',
       array['forklift','inventory','shipping'], 'Mesa', '2nd shift',
       now() - interval '62 days',
       '[{"client_name":"Demo Logistics LLC","role":"Forklift Operator","season":"Spring 2025","start_date":"2025-02-01","end_date":"2025-06-10","reason_for_end":"Contract complete"}]'::jsonb,
       null),
      ('Sample Rehire Three', 'Phoenix', 'Picker Packer', 'Seed · Talent Pool',
       'hired', 'available_for_rehire',
       array['picking','packing','scanning'], 'Phoenix', '1st shift',
       now() - interval '18 days',
       '[{"client_name":"Demo Fulfillment Inc","role":"Picker Packer","season":"Winter 2025","start_date":"2024-11-01","end_date":"2025-05-28","reason_for_end":"Seasonal end"}]'::jsonb,
       null),
      ('Sample Placed One', 'Tempe', 'Machine Operator', 'Seed · Talent Pool',
       'hired', 'placed',
       array['machine-operation','qa'], 'Tempe', '1st shift',
       null, '[]'::jsonb, null),
      ('Sample In Process One', 'Phoenix', 'Assembler', 'Seed · Talent Pool',
       'interview', 'in_process',
       array['assembly','soldering'], 'Phoenix', 'flexible',
       null, '[]'::jsonb, null),
      ('Sample New Applicant One', 'Glendale', 'General Labor', 'Seed · Talent Pool',
       'applied', 'new_applicant',
       array['general-labor'], 'Glendale', 'any',
       null, '[]'::jsonb, null),
      ('Sample DNR One', 'Phoenix', 'Warehouse Associate', 'Seed · Talent Pool',
       'rejected', 'do_not_return',
       array['picking'], 'Phoenix', '1st shift',
       now() - interval '120 days',
       '[{"client_name":"Demo Distribution Co","role":"Warehouse Associate","season":"Summer 2024","start_date":"2024-05-01","end_date":"2024-07-01","reason_for_end":"Attendance"}]'::jsonb,
       'Repeated no-call no-show (placeholder seed record)'),
      ('Sample DNR Two', 'Mesa', 'Forklift Operator', 'Seed · Talent Pool',
       'rejected', 'do_not_return',
       array['forklift'], 'Mesa', '2nd shift',
       now() - interval '200 days',
       '[]'::jsonb,
       'Safety violation (placeholder seed record)');
  end if;
end $$;
