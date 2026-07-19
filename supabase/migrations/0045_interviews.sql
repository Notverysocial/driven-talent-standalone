-- 0045_interviews.sql
--
-- Runbook Phase C (gap 3): multi-round interview history. The interview model
-- held exactly ONE interview per candidate as flat columns on `candidates`
-- (migration 0038), so phone screen -> panel -> final could not be represented.
--
-- STRICTLY ADDITIVE AND REVERSIBLE.
--   * Creates a new one-to-many `interviews` table.
--   * Backfills the existing single interview per candidate as round 1.
--   * Does NOT drop, alter, or stop writing the `candidates` interview columns.
--     They remain the readable fallback and the Calendly write-back (Phase A,
--     live since 2026-07-19) keeps writing them untouched. Dropping them is a
--     separate, later decision after the new read path is verified live.
-- Reverse with: drop table interviews;  (nothing else is modified)
--
-- Idempotent: `if not exists` + a `not exists` guard on the backfill, so a
-- re-run inserts nothing and cannot duplicate rounds.
--
-- SAFETY: the DO block at the bottom ABORTS the whole migration if the backfill
-- did not carry every source candidate across, and specifically asserts that
-- Rodolfo Dimas's interview notes survived byte-for-byte. A migration that
-- loses his notes fails loudly instead of reporting success.

create table if not exists interviews (
  id                  uuid primary key default gen_random_uuid(),
  candidate_id        uuid not null references candidates(id) on delete cascade,
  round               integer not null default 1,
  scheduled_at        timestamptz,
  showed_up           boolean,
  no_show_reason      text,
  notes               text,
  outcome             text,
  strong_candidate    text
                        check (strong_candidate is null or strong_candidate in ('yes','no','maybe')),
  other_positions_fit text,
  created_by          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists interviews_candidate_round_idx
  on interviews (candidate_id, round);

alter table interviews enable row level security;
drop policy if exists "open" on interviews;
create policy "open" on interviews for all to public
  using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Backfill: one round-1 row per candidate that has ANY interview data today.
-- `outcome` is intentionally left NULL — there is no source column for it and
-- this migration does not invent data. (candidates.client_response is the
-- CLIENT's decision, not the interview outcome, so it is deliberately not used.)
-- ---------------------------------------------------------------------------
insert into interviews (
  candidate_id, round, scheduled_at, showed_up, no_show_reason,
  notes, strong_candidate, other_positions_fit, created_by
)
select
  c.id, 1, c.interview_at, c.showed_up, c.no_show_reason,
  c.interview_notes, c.strong_candidate, c.other_positions_fit, 'migration-0045'
from candidates c
where (
      c.interview_scheduled is not null
   or c.interview_at is not null
   or c.showed_up is not null
   or nullif(btrim(coalesce(c.no_show_reason, '')), '') is not null
   or nullif(btrim(coalesce(c.interview_notes, '')), '') is not null
   or c.strong_candidate is not null
   or nullif(btrim(coalesce(c.other_positions_fit, '')), '') is not null
)
and not exists (
  select 1 from interviews i where i.candidate_id = c.id and i.round = 1
);

-- ---------------------------------------------------------------------------
-- Self-verification. Aborts the transaction if anything was lost.
-- ---------------------------------------------------------------------------
do $$
declare
  src_count int;
  dst_count int;
  rod_id    uuid := '596bfd7c-c5a8-4f71-b633-314a153f2346'; -- Rodolfo Dimas
  rod_src   text;
  rod_dst   text;
  rod_name  text;
begin
  select count(*) into src_count
  from candidates c
  where (
        c.interview_scheduled is not null
     or c.interview_at is not null
     or c.showed_up is not null
     or nullif(btrim(coalesce(c.no_show_reason, '')), '') is not null
     or nullif(btrim(coalesce(c.interview_notes, '')), '') is not null
     or c.strong_candidate is not null
     or nullif(btrim(coalesce(c.other_positions_fit, '')), '') is not null
  );

  select count(distinct candidate_id) into dst_count
  from interviews where round = 1;

  if dst_count < src_count then
    raise exception
      'MIGRATION 0045 ABORTED: interview backfill incomplete — % candidates have interview data but only % have a round-1 row.',
      src_count, dst_count;
  end if;

  -- Named receipt: Rodolfo Dimas's notes must survive byte-for-byte.
  select c.interview_notes, c.full_name into rod_src, rod_name
  from candidates c where c.id = rod_id;

  if rod_src is not null and btrim(rod_src) <> '' then
    select i.notes into rod_dst
    from interviews i where i.candidate_id = rod_id and i.round = 1;

    if rod_dst is distinct from rod_src then
      raise exception
        'MIGRATION 0045 ABORTED: interview notes for % (%) did not survive the backfill. source=[%] migrated=[%]',
        coalesce(rod_name, 'Rodolfo Dimas'), rod_id, rod_src, rod_dst;
    end if;

    raise notice 'MIGRATION 0045: verified interview notes preserved for % (%)', rod_name, rod_id;
  else
    raise notice 'MIGRATION 0045: candidate % has no interview notes in this database; named check skipped.', rod_id;
  end if;

  raise notice 'MIGRATION 0045: backfilled round-1 interviews for % candidate(s).', dst_count;
end $$;
