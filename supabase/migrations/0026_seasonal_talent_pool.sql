-- 0026_seasonal_talent_pool.sql
-- Seasonal Talent Pool / Rehire Database (internal ClickUp 86e1vwzuq).
--
-- Adds a lifecycle layer on top of the existing `candidates` ATS so DT can
-- resurface already-vetted workers (rehires) instead of always sourcing
-- net-new every season cycle.
--
-- Coordination with the DT HR overhaul (local_0449f964): the `employees`
-- table owns active staff + the Do Not Return list view; THIS migration keeps
-- the lifecycle layer on the `candidates` table. The two are linked by
-- candidates.promoted_employee_id where a candidate became an employee.

-- ---------- lifecycle enum ----------------------------------------------

create type candidate_lifecycle_status as enum (
  'new_applicant',
  'in_process',
  'placed',
  'available_for_rehire',
  'do_not_return'
);

-- ---------- columns -----------------------------------------------------

alter table candidates
  add column if not exists lifecycle_status candidate_lifecycle_status not null default 'new_applicant',
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
update candidates
  set lifecycle_status = case status
    when 'hired'     then 'placed'
    when 'offer'     then 'in_process'
    when 'interview' then 'in_process'
    when 'screening' then 'in_process'
    when 'applied'   then 'new_applicant'
    when 'rejected'  then 'do_not_return'
    else 'new_applicant'
  end::candidate_lifecycle_status;

-- ---------- placeholder seed --------------------------------------------
-- Proves out all five tabs without importing real PII. The "DO NOT RETURN
-- EMPLOYEES" tab of the DRIVEN TALENT INFO Google Sheet is a follow-up
-- import (see ClickUp 86e1vwzuq); these rows are clearly-labelled stand-ins.
-- Guarded so re-running the migration set never double-inserts.
do $$
begin
  if not exists (select 1 from candidates where source = 'Seed · Talent Pool') then
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
