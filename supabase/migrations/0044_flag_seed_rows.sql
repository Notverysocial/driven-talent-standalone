-- 0044_flag_seed_rows.sql
--
-- Runbook Phase B (gap 2): demo/QA seed rows are sitting in the client's
-- production data and inflating the headline unreviewed-backlog number (the two
-- oldest "56 days" intakes, Derek Olsen and James Whitfield, are @example.com
-- seed rows from a 2026-05-24 seeding run — the real oldest wait is ~37 days).
--
-- We EXCLUDE, we do NOT delete. Hard deletes are an Antonio-only stop-point.
-- This adds a reversible `is_seed` flag to both application_intakes and
-- candidates and sets it for @example.com rows. @example.com is RFC-2606
-- reserved and can never be a real applicant address, so keying on it is safe
-- and self-inventorying (it catches the exact seed set today AND any future
-- test row, rather than hardcoding IDs that could drift).
--
-- Reversible: `update ... set is_seed = false` (or drop the column) fully
-- restores the prior state — nothing is destroyed. Additive + idempotent.

alter table application_intakes
  add column if not exists is_seed boolean not null default false;
alter table candidates
  add column if not exists is_seed boolean not null default false;

-- Flag the seed rows. Idempotent — safe to re-run.
update application_intakes
  set is_seed = true
  where email ilike '%@example.com%' and is_seed = false;
update candidates
  set is_seed = true
  where email ilike '%@example.com%' and is_seed = false;

-- Partial indexes so the "real rows only" reads stay cheap as data grows.
create index if not exists application_intakes_not_seed_idx
  on application_intakes (created_at) where is_seed = false;
create index if not exists candidates_not_seed_idx
  on candidates (created_at) where is_seed = false;
