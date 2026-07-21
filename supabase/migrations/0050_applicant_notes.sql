-- 0050_applicant_notes.sql
--
-- Leangel Gamez, ops WhatsApp 2026-07-20:
--   "we need to be able to make comments or add notes, or watch the income of
--    the call, that is really important for the team to have"
--
-- The gap: you can SCHEDULE PHONE SCREEN from the applicant detail view and
-- then have nowhere to record what happened on the call. Recruiters work
-- applicants and lose everything they learn.
--
-- ---------------------------------------------------------------------------
-- THIS DELIBERATELY DOES NOT CREATE A NOTES TABLE.
--
-- candidate_notes (0038) is already the general, polymorphic notes log — its
-- own comment says "One notes log reused across candidate, onboarding, and
-- active-employee records", it stamps author + created_at server-side, and
-- CandidateNotes.tsx is documented as "reused verbatim ... via the subjectType
-- prop". The applicant stage was simply never added to the allowed subjects.
--
-- So this migration WIDENS the existing surface rather than standing up a
-- second parallel notes implementation. Two implementations of one concept is
-- a defect this project has already been bitten by.
-- ---------------------------------------------------------------------------
--
-- Additive and idempotent — safe to re-run. No destructive statements, no data
-- rewrite, nothing dropped except the two CHECK constraints being widened
-- (widening only: every value previously allowed is still allowed).

-- 1) Allow 'applicant' as a note subject ------------------------------------
--
-- The original CHECK was declared inline, so Postgres auto-named it
-- <table>_<column>_check. Dropped by that name and re-added widened.
alter table candidate_notes
  drop constraint if exists candidate_notes_subject_type_check;
alter table candidate_notes
  add constraint candidate_notes_subject_type_check
  check (subject_type in ('applicant', 'candidate', 'onboarding', 'employee'));

-- 2) Same widening on the change log ----------------------------------------
--
-- logActivity() is fail-safe and swallows insert errors, so WITHOUT this an
-- applicant note would save while its change-log entry silently vanished —
-- the exact "looks fine, records nothing" failure mode this codebase keeps
-- getting bitten by. Widen it so applicant activity is actually recorded.
alter table activity_log
  drop constraint if exists activity_log_subject_type_check;
alter table activity_log
  add constraint activity_log_subject_type_check
  check (subject_type in ('applicant', 'candidate', 'onboarding', 'employee'));

-- 3) Phone-screen outcome, on the SAME note row ------------------------------
--
-- A phone screen result is a note that happens to carry structure, not a
-- different kind of object. Keeping it on candidate_notes means it renders in
-- the one timeline, is authored and timestamped by the same server-side path,
-- and survives promotion by the same mechanism as any other note — instead of
-- needing its own table, its own reader, and its own promotion story.
--
-- note_kind 'note'         → an ordinary comment; outcome columns stay null.
-- note_kind 'phone_screen' → call_outcome is required (enforced below).
alter table candidate_notes
  add column if not exists note_kind    text not null default 'note',
  add column if not exists call_outcome text,
  add column if not exists next_step    text;

alter table candidate_notes
  drop constraint if exists candidate_notes_note_kind_check;
alter table candidate_notes
  add constraint candidate_notes_note_kind_check
  check (note_kind in ('note', 'phone_screen'));

-- The four outcomes Leangel's team needs to distinguish: did we reach them,
-- did it ring out, did we leave a message, or did they say no.
alter table candidate_notes
  drop constraint if exists candidate_notes_call_outcome_check;
alter table candidate_notes
  add constraint candidate_notes_call_outcome_check
  check (
    call_outcome is null
    or call_outcome in ('reached', 'no_answer', 'left_message', 'declined')
  );

-- A phone_screen row without an outcome is meaningless, and an outcome on a
-- plain note is a bug. Tie the two together so neither can be written.
alter table candidate_notes
  drop constraint if exists candidate_notes_phone_screen_shape_check;
alter table candidate_notes
  add constraint candidate_notes_phone_screen_shape_check
  check (
    (note_kind = 'phone_screen' and call_outcome is not null)
    or (note_kind = 'note' and call_outcome is null)
  );

-- 4) Index for the applicant timeline ---------------------------------------
--
-- candidate_notes_subject_idx (subject_type, subject_id, created_at desc)
-- from 0038 already serves the applicant read. Nothing further needed.
--
-- NOTE ON PROMOTION: notes are NOT moved or copied when an applicant is
-- promoted. application_intakes rows survive promotion (status='promoted',
-- promoted_candidate_id set), so the candidate view reads applicant-stage
-- notes through that lineage link. Moving rows would add a second
-- partial-failure window to promoteIntakeToCandidate(), which already has one
-- — and losing notes on promotion is the one outcome worse than not shipping
-- this. See listNotesForCandidateWithApplicantHistory().
