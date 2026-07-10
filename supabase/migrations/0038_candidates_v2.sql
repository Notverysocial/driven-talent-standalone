-- 0038_candidates_v2.sql
--
-- Candidates Section v2 + dashboard change-set (Estefany 2026-07-06 / Leangel
-- 2026-07-08). Additive + idempotent — existing rows untouched, safe to re-run.
-- Numbered 0038 (next after 0037_terminations_tracker on main; the runbook's
-- placeholder "0021" number was already taken by 0021_client_contacts_seed).
--
-- REUSE, do not duplicate: the candidates table already carries
--   source, notes, applied_at, city, photo_url, skills[], preferred_shift,
--   recruiter (owner), lifecycle_status, do_not_return_reason, language_pref.
-- This migration only adds the fields that are genuinely missing, plus the
-- five-stage recruitment pipeline sub-fields and a threaded candidate_notes
-- table reused across candidate / onboarding / employee records.
--
-- NO destructive statements (no drop / no alter type ... drop). Rolling back is
-- a separate, Antonio-only drop migration — never part of the forward build.

-- ---------------------------------------------------------------------------
-- 1) Candidate profile — missing personal / job-fit / flag / claim fields
-- ---------------------------------------------------------------------------
-- primary_language is the PERSON's spoken language (English/Spanish/Bilingual/
-- Other) and is distinct from language_pref (en/es document language, 0033).
-- position is the normalized, manually-editable role so variants like
-- "Forklift" / "Forklift Operator" / "Operador de Montacargas" collapse to one;
-- applied_for is left as the raw intake string. shift preference REUSES the
-- existing preferred_shift column; recruiter (owner) REUSES the existing
-- recruiter column.
alter table candidates
  add column if not exists primary_language text,
  add column if not exists state           text,
  add column if not exists position        text,
  add column if not exists client_company  text,
  add column if not exists pay_rate        text,
  add column if not exists job_fit_score   smallint
    check (job_fit_score is null or job_fit_score between 1 and 5),
  add column if not exists transferred_to  text,
  add column if not exists red_flag        boolean not null default false,
  add column if not exists red_flag_reason text,
  add column if not exists do_not_send     boolean not null default false,
  -- Applicant-Tracking claim (Change 1). claimed_by is the recruiter free-text
  -- name / email (mirrors the existing free-text recruiter column pattern).
  add column if not exists claimed_by      text,
  add column if not exists claimed_at      timestamptz;

-- ---------------------------------------------------------------------------
-- 2) Five-stage recruitment pipeline sub-fields (retire the parallel Excel)
-- ---------------------------------------------------------------------------
-- Stage 1 — Prescreening call
alter table candidates
  add column if not exists call_answered           boolean,
  add column if not exists voicemail_or_text_sent  boolean,
  add column if not exists last_contact_date       date;

-- Stage 2 — Video interview (date/time is personal to the candidate; it must
-- never conflict with or depend on other candidates' schedules)
alter table candidates
  add column if not exists interview_scheduled     boolean,
  add column if not exists interview_at            timestamptz;

-- Stage 3 — Interview evaluation
alter table candidates
  add column if not exists showed_up               boolean,
  add column if not exists no_show_reason          text,
  add column if not exists interview_notes         text,
  add column if not exists strong_candidate        text
    check (strong_candidate is null or strong_candidate in ('yes','no','maybe')),
  add column if not exists other_positions_fit     text,
  add column if not exists resume_on_file          boolean;

-- Stage 4 — Sent to client
alter table candidates
  add column if not exists updated_profile_ready   boolean,
  add column if not exists sent_to_client          boolean,
  add column if not exists sent_at                 date;

-- Stage 5 — Client decision
alter table candidates
  add column if not exists client_response         text
    check (client_response is null or client_response in ('accepted','rejected','pending')),
  add column if not exists client_response_date    date;

create index if not exists candidates_claimed_by_idx
  on candidates (claimed_by) where claimed_by is not null;
create index if not exists candidates_red_flag_idx
  on candidates (red_flag) where red_flag = true;

-- ---------------------------------------------------------------------------
-- 3) Applicant Tracking claim columns on application_intakes (Change 1)
-- ---------------------------------------------------------------------------
-- The intake card's "Claim for me" writes claimed_by + claimed_at; on promote
-- the claiming recruiter is carried onto the created candidate's recruiter.
alter table application_intakes
  add column if not exists claimed_by  text,
  add column if not exists claimed_at  timestamptz;

create index if not exists application_intakes_claimed_by_idx
  on application_intakes (claimed_by) where claimed_by is not null;

-- ---------------------------------------------------------------------------
-- 4) Threaded / authored / @mention / follow-up notes (reused surface)
-- ---------------------------------------------------------------------------
-- One notes log reused across candidate, onboarding, and active-employee
-- records. Author + created_at are ALWAYS stamped server-side (never manual).
-- mentions is a jsonb array of {name, team_member_id?}. followup_required=true
-- reveals an assignee + a status of in_review / resolved. Rendered newest-first.
-- (Coexists with wellness_notes from 0034, which is the employee-only,
-- append-only wellness/incident timeline; this table is the general notes log.)
create table if not exists candidate_notes (
  id                uuid primary key default gen_random_uuid(),
  subject_type      text not null default 'candidate'
                      check (subject_type in ('candidate','onboarding','employee')),
  subject_id        uuid not null,
  -- author_id is a soft reference (profiles.id or team_members.id); NOT a FK so
  -- the AUTH_ENABLED-off synthetic owner (nil uuid, no real row) can still author.
  author_id         uuid,
  author_name       text not null,
  body              text not null,
  mentions          jsonb not null default '[]'::jsonb,
  followup_required boolean not null default false,
  followup_assignee text,
  followup_status   text
                      check (followup_status is null or followup_status in ('in_review','resolved')),
  created_at        timestamptz not null default now()
);

create index if not exists candidate_notes_subject_idx
  on candidate_notes (subject_type, subject_id, created_at desc);

alter table candidate_notes enable row level security;
drop policy if exists "open" on candidate_notes;
create policy "open" on candidate_notes for all to public
  using (true) with check (true);
