-- 0040_candidate_screening_status.sql
--
-- Candidate-level "Screening" status (Estefany request, CRM card c2ad6f4f).
-- A recruiter-set flag on the CANDIDATE record — distinct from:
--   * candidates.status        — the recruitment PIPELINE stage
--                                (applied/screening/interview/offer/hired/rejected)
--   * candidates.lifecycle_status — the post-placement lifecycle enum
--                                (new_applicant/in_process/placed/…/do_not_return)
--   * open-positions status    — the POSITION-level open/on_hold/filled/cancelled
--
-- Purpose: mark a strong candidate who has cleared screening as
-- "approved" (ready to send to a client) or put them "on_hold" (approved and
-- ready-to-send anytime, but no matching opening right now) so they are never
-- lost between requisitions. NULL = not yet reviewed.
--
-- Plain text column (app-enforced values, mirroring the existing free-text
-- `status`/`recruiter` pattern) — deliberately NOT a Postgres enum, so future
-- values need no `alter type … add value` (which cannot run in a txn block).
--
-- Additive + idempotent. No destructive statements. Safe to re-run.

alter table candidates
  add column if not exists screening_status text
    check (screening_status is null or screening_status in ('approved', 'on_hold'));

-- Partial index — the ATS filters/counts the small set of reviewed candidates,
-- so only index the non-null rows.
create index if not exists idx_candidates_screening_status
  on candidates (screening_status)
  where screening_status is not null;

comment on column candidates.screening_status is
  'Recruiter screening outcome (Estefany c2ad6f4f): approved | on_hold | null. '
  'Candidate-level, distinct from pipeline status / lifecycle_status / position status.';
