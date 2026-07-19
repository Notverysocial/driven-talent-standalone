-- 0046_duplicate_detection.sql
--
-- Duplicate-candidate DETECTION and PREVENTION (no merging, no deletes).
--
-- Live problem this addresses: two candidate records exist for one human —
-- "crescencio nieto perez" and "Crescencio nieto perez" — sharing an email that
-- differs only in case (Marciaycris02@ vs marciaycris02@) and a phone that
-- differs only in formatting ((909) 685-3385 vs 9096853385). Because text
-- equality in Postgres is case-sensitive, the Calendly interview write-back
-- matched exactly ONE of the twins and silently wrote to it, leaving the other
-- blank — a split-brain nobody could see. Scope today: 3 duplicate-email groups
-- across 6 candidate records (seed rows excluded).
--
-- STRICTLY ADDITIVE AND REVERSIBLE. This migration does NOT merge, dedupe,
-- delete, or rewrite a single existing value. It only adds derived columns used
-- for comparison. The human-entered `email` / `phone` are untouched, so nothing
-- a recruiter sees changes.
--
-- Why GENERATED columns rather than app-side normalization on write:
--   * They cover EXISTING rows immediately, not just newly created ones.
--   * They cannot drift — Postgres maintains them on every insert and update,
--     so no code path can forget to normalize.
--   * They give an exact, indexable equality match, so lookups never need LIKE
--     (an `ilike` on email would be unsafe: `_` is a LIKE wildcard and is common
--     in real addresses, so it would over-match onto the wrong person).
--
-- Reverse with: alter table ... drop column email_normalized, phone_normalized;

-- --------------------------------------------------------------------------
-- candidates
-- --------------------------------------------------------------------------
-- email_normalized: lowercased + trimmed, NULL when blank.
-- phone_normalized: digits only, last 10 (so +1 country-coded and bare 10-digit
--   US numbers converge), NULL when blank.
alter table candidates
  add column if not exists email_normalized text
    generated always as (nullif(lower(btrim(coalesce(email, ''))), '')) stored,
  add column if not exists phone_normalized text
    generated always as (
      nullif(right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 10), '')
    ) stored;

create index if not exists candidates_email_normalized_idx
  on candidates (email_normalized) where email_normalized is not null;
create index if not exists candidates_phone_normalized_idx
  on candidates (phone_normalized) where phone_normalized is not null;

-- --------------------------------------------------------------------------
-- application_intakes — same normalization so an inbound application can be
-- recognized as the same person as an existing candidate going forward.
-- --------------------------------------------------------------------------
alter table application_intakes
  add column if not exists email_normalized text
    generated always as (nullif(lower(btrim(coalesce(email, ''))), '')) stored,
  add column if not exists phone_normalized text
    generated always as (
      nullif(right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 10), '')
    ) stored;

create index if not exists application_intakes_email_normalized_idx
  on application_intakes (email_normalized) where email_normalized is not null;

-- --------------------------------------------------------------------------
-- Report what is already in there. Informational only — this migration
-- deliberately does NOT act on these groups. Merging or deleting duplicate
-- records is an Antonio-only decision.
-- --------------------------------------------------------------------------
do $$
declare
  grp_count int;
  rec_count int;
begin
  select count(*), coalesce(sum(n), 0) into grp_count, rec_count
  from (
    select email_normalized, count(*) as n
    from candidates
    where email_normalized is not null
      and coalesce(is_seed, false) = false
    group by email_normalized
    having count(*) > 1
  ) g;

  raise notice
    'MIGRATION 0046: duplicate-email groups found: % (across % candidate records). NOT merged — detection only.',
    grp_count, rec_count;
end $$;
