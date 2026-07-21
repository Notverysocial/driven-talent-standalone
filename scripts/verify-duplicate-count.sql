-- ===========================================================================
-- verify-duplicate-count.sql — settle whether the "sixteen matches" we told
-- Driven Talent on 2026-07-19 is the number the app actually shows today.
--
-- READ-ONLY. Every statement is a SELECT. No DDL, no writes.
--
-- WHY THIS IS NEEDED. The duplicate count is computed at READ TIME (there is
-- no table storing matches), by groupDuplicateCandidates() in
-- src/lib/duplicates.ts. That function does NOT simply count phone groups:
--
--     1. group by normalized EMAIL   → every group of 2+ is reported
--     2. group by normalized PHONE   → but ONLY over records not already
--                                      claimed by an email group
--
-- So the dashboard figure is  (email groups) + (phone groups of unclaimed
-- records)  — which is NOT the same as a standalone phone-group count. If the
-- "16" came from an ad-hoc phone-only query, the two can legitimately differ
-- without anything being broken. Q3 below reports both so they can be compared.
--
-- The normalization here mirrors the GENERATED columns from migration 0046
-- exactly (and the TS in duplicates.ts):
--     email → nullif(lower(btrim(email)), '')
--     phone → nullif(right(regexp_replace(phone,'[^0-9]','','g'), 10), '')
-- Seed rows (migration 0044) are excluded, matching the app.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- Q1 — Are the generated columns actually present and populated?
--      If email_normalized / phone_normalized are missing, migration 0046 was
--      never applied and the banner silently shows nothing for everyone.
-- ---------------------------------------------------------------------------
SELECT
  count(*)                                    AS candidates_excl_seed,
  count(email_normalized)                     AS with_email,
  count(phone_normalized)                     AS with_phone,
  count(*) FILTER (
    WHERE email_normalized IS NULL AND phone_normalized IS NULL
  )                                           AS unmatchable_no_contact
FROM candidates
WHERE is_seed IS DISTINCT FROM TRUE;


-- ---------------------------------------------------------------------------
-- Q2 — Do the generated columns agree with the app's normalization?
--      Both sides should be identical; a mismatch means the read-time lookup
--      builds a value that can never equal the stored one, and every banner
--      disappears without any error. `mismatches` MUST be 0.
-- ---------------------------------------------------------------------------
SELECT
  count(*) FILTER (
    WHERE email_normalized IS DISTINCT FROM nullif(lower(btrim(coalesce(email, ''))), '')
       OR phone_normalized IS DISTINCT FROM
          nullif(right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 10), '')
  ) AS mismatches,
  count(*) AS rows_checked
FROM candidates
WHERE is_seed IS DISTINCT FROM TRUE;


-- ---------------------------------------------------------------------------
-- Q3 — THE COMPARISON. Three numbers side by side:
--
--   app_groups / app_records  = what the Dashboard "Duplicate people" card
--                               shows (email groups + phone groups of records
--                               not already claimed by email). THIS is the
--                               number to compare against what we told them.
--   phone_only_groups         = a standalone phone-group count, ignoring the
--                               email pass. Most likely where "16" came from.
--   email_only_groups         = the standalone email count (expected 3).
-- ---------------------------------------------------------------------------
WITH real AS (
  SELECT id, email_normalized AS e, phone_normalized AS p
  FROM candidates
  WHERE is_seed IS DISTINCT FROM TRUE
),
email_groups AS (
  SELECT e AS key, array_agg(id) AS ids
  FROM real WHERE e IS NOT NULL
  GROUP BY e HAVING count(*) > 1
),
claimed AS (
  SELECT unnest(ids) AS id FROM email_groups
),
phone_groups_unclaimed AS (           -- what the app actually counts
  SELECT p AS key, array_agg(id) AS ids
  FROM real
  WHERE p IS NOT NULL AND id NOT IN (SELECT id FROM claimed)
  GROUP BY p HAVING count(*) > 1
),
phone_groups_standalone AS (          -- the ad-hoc "16"-style count
  SELECT p AS key, count(*) AS n
  FROM real WHERE p IS NOT NULL
  GROUP BY p HAVING count(*) > 1
)
SELECT
  (SELECT count(*) FROM email_groups)
    + (SELECT count(*) FROM phone_groups_unclaimed)          AS app_groups,
  (SELECT coalesce(sum(cardinality(ids)), 0) FROM email_groups)
    + (SELECT coalesce(sum(cardinality(ids)), 0) FROM phone_groups_unclaimed)
                                                             AS app_records,
  (SELECT count(*) FROM email_groups)                        AS email_only_groups,
  (SELECT count(*) FROM phone_groups_standalone)             AS phone_only_groups,
  (SELECT count(*) FROM phone_groups_standalone)
    - (SELECT count(*) FROM phone_groups_unclaimed)          AS phone_groups_absorbed_by_email;


-- ---------------------------------------------------------------------------
-- Q4 — The actual groups, so the count can be eyeballed rather than trusted.
--      `matched_on` is the signal the candidate banner will name.
-- ---------------------------------------------------------------------------
WITH real AS (
  SELECT id, full_name, email, phone,
         email_normalized AS e, phone_normalized AS p
  FROM candidates WHERE is_seed IS DISTINCT FROM TRUE
),
email_groups AS (
  SELECT e AS key, array_agg(id) AS ids FROM real
  WHERE e IS NOT NULL GROUP BY e HAVING count(*) > 1
),
claimed AS (SELECT unnest(ids) AS id FROM email_groups)
SELECT 'email' AS matched_on, r.e AS key, r.full_name, r.email, r.phone
FROM real r WHERE r.e IN (SELECT key FROM email_groups)
UNION ALL
SELECT 'phone', r.p, r.full_name, r.email, r.phone
FROM real r
WHERE r.p IS NOT NULL
  AND r.id NOT IN (SELECT id FROM claimed)
  AND r.p IN (
    SELECT p FROM real
    WHERE p IS NOT NULL AND id NOT IN (SELECT id FROM claimed)
    GROUP BY p HAVING count(*) > 1
  )
ORDER BY matched_on, key, full_name;


-- ---------------------------------------------------------------------------
-- Q5 — Records that CANNOT be matched at all: no email and no usable phone.
--      These will never show a banner. Not a bug — there is nothing to match
--      on — but it is the honest ceiling on what detection can find, and worth
--      knowing before quoting any coverage figure to the client.
-- ---------------------------------------------------------------------------
SELECT count(*) AS unmatchable_records,
       count(*) FILTER (WHERE btrim(coalesce(phone, '')) <> '') AS has_a_phone_but_no_digits
FROM candidates
WHERE is_seed IS DISTINCT FROM TRUE
  AND email_normalized IS NULL
  AND phone_normalized IS NULL;
