-- 0041_activity_log.sql
--
-- Change Log (card 503b6bdf) — a single, append-only record of every meaningful
-- edit made to a candidate (and, reusably, to onboarding / employee records) so
-- the team can see exactly who changed what and when. Additive + idempotent —
-- safe to re-run, no destructive statements. Numbered 0041 (next after
-- 0040_candidate_screening_status).
--
-- Mirrors the candidate_notes (0038) shape: polymorphic subject_type/subject_id
-- so one table serves candidate, onboarding, and employee timelines. actor_id is
-- a SOFT reference (no FK) so the AUTH_ENABLED-off synthetic owner (nil uuid) can
-- still author entries. Entries are ALWAYS stamped server-side, never manual.

create table if not exists activity_log (
  id           uuid primary key default gen_random_uuid(),
  subject_type text not null default 'candidate'
                 check (subject_type in ('candidate','onboarding','employee')),
  subject_id   uuid not null,
  -- Soft reference to profiles.id / team_members.id — NOT a FK (nil uuid allowed).
  actor_id     uuid,
  actor_name   text not null,
  -- Machine-readable verb (e.g. 'status_changed','profile_updated','flag_set').
  action       text not null,
  -- Human-readable one-line summary rendered in the timeline.
  summary      text not null,
  -- Optional field-level detail for edits (old -> new on a single field).
  field        text,
  old_value    text,
  new_value    text,
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists activity_log_subject_idx
  on activity_log (subject_type, subject_id, created_at desc);

alter table activity_log enable row level security;
drop policy if exists "open" on activity_log;
create policy "open" on activity_log for all to public
  using (true) with check (true);
