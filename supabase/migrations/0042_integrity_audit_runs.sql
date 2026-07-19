-- 0042_integrity_audit_runs.sql
--
-- Recurring data-integrity audit for the applicant pipeline (card 1322c60e).
-- Each scheduled run of /api/integrity/applicant-audit writes one snapshot row
-- here, so the team has a dated history of the backlog / drop-seam / duplicate /
-- unresolved-import numbers and can see whether things are getting better or
-- worse over time. Additive + idempotent, no destructive statements. Numbered
-- 0042 (0041 is reserved by the change-log PR).
--
-- The dashboard reads the numbers LIVE (not from this table), so nothing here is
-- required for the audit to surface — this table is purely the scheduled record.

create table if not exists integrity_audit_runs (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null default 'applicant_pipeline',
  -- Headline count of things needing attention at run time (quick trend column).
  flags        integer not null default 0,
  -- The full structured report (backlog, stuck, duplicates, unresolved, orphans).
  report       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists integrity_audit_runs_kind_created_idx
  on integrity_audit_runs (kind, created_at desc);

alter table integrity_audit_runs enable row level security;
drop policy if exists "open" on integrity_audit_runs;
create policy "open" on integrity_audit_runs for all to public
  using (true) with check (true);
