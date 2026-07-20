-- ===========================================================================
-- verify-lunch-fix.sql — reproduce the CORRECTED per-day worked hours straight
-- from the raw uAttend punches, so the app's rendered number can be checked
-- against the source rather than against a unit test.
--
-- READ-ONLY. Every statement is a SELECT. Nothing here writes.
--
-- Mirrors src/lib/uattend/worked-hours.ts exactly:
--
--     worked = Σ(paycode 1 "Tot")  −  Σ(paycode 6,7 "Tot")
--
-- Run the queries IN ORDER. Q0 is not optional — it validates the two
-- assumptions the rest depend on. If Q0 comes back unexpected, stop and say
-- so; the totals below would be wrong in a way that looks plausible.
--
-- TWO HAZARDS THIS HANDLES, both of which would silently double or halve the
-- numbers if ignored:
--
--   1. TWO PAYLOAD SHAPES. Some rows carry the raw uAttend shape
--      (InTime/OutTime/Tot/PaycodeId/PunchDate); others carry a derived shape
--      (punchIn/punchOut/hours/paycodeId/date). Q0a counts each. The
--      normalizer below coalesces both.
--
--   2. TWO ROWS PER LINE ITEM. punchLineToEvents() writes an "in" row AND an
--      "out" row for every punch-report line, BOTH carrying the SAME
--      raw_payload AND the same Tot. Summing raw_payload->>'Tot' across rows
--      therefore DOUBLE COUNTS every absolute figure. This is not theoretical:
--      the first measurement of this data did exactly that and reported 2x on
--      every total. (The 5.4% ratio survived only because both sides doubled.)
--
--      The id separator is a HYPHEN in prod ("<n>-in" / "<n>-out"), though
--      punch-events.ts writes a colon, so the regex below accepts BOTH. A
--      colon-only pattern silently matches nothing and the dedupe becomes a
--      no-op that reproduces the doubled numbers.
--
--      Because that dedupe is the single most load-bearing line here, Q0b
--      checks it TWO independent ways — by id line-key and by punch_type —
--      and they must agree. If they disagree, trust neither.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- Q0a — PAYLOAD SHAPES. Expect both to be non-zero (~1428 raw / ~1457 derived).
--       "neither" must be 0; any row there is invisible to every query below.
-- ---------------------------------------------------------------------------
SELECT
  count(*) FILTER (WHERE raw_payload ? 'Tot')                            AS raw_shape,
  count(*) FILTER (WHERE raw_payload ? 'hours')                          AS derived_shape,
  count(*) FILTER (WHERE NOT (raw_payload ? 'Tot' OR raw_payload ? 'hours')) AS neither,
  count(*)                                                               AS total_rows
FROM timeclock_punches;


-- ---------------------------------------------------------------------------
-- Q0b — ROWS PER LINE ITEM. Expect mostly 2 (an in row + an out row).
--       If this returns mostly 1, the regex matched nothing — STOP, because
--       every total below will then be DOUBLE. If it returns 3+, the line key
--       is not what we think it is. Either way, do not trust the totals.
-- ---------------------------------------------------------------------------
SELECT rows_per_line, count(*) AS line_items
FROM (
  SELECT regexp_replace(uattend_punch_id, '[-:](in|out)$', '') AS line_key,
         count(*) AS rows_per_line
  FROM timeclock_punches
  WHERE uattend_punch_id IS NOT NULL
  GROUP BY 1
) x
GROUP BY 1 ORDER BY 1;


-- ---------------------------------------------------------------------------
-- Q0b2 — THE SAME DEDUPE, DONE A SECOND INDEPENDENT WAY, as a cross-check.
--        Method A strips the :in/-in suffix from uattend_punch_id.
--        Method B keeps only the *_in side of each pair via punch_type.
--        `a_lines` and `b_lines` MUST match. If they do not, the id format and
--        the punch_type column disagree and neither dedupe can be trusted.
--
--        Method B is shown for agreement only — the script uses Method A,
--        because a line that recorded an OUT but no IN exists as a lone "out"
--        row and Method B would silently drop it. `b_orphan_out` counts those.
-- ---------------------------------------------------------------------------
SELECT
  (SELECT count(DISTINCT regexp_replace(uattend_punch_id, '[-:](in|out)$', ''))
     FROM timeclock_punches WHERE uattend_punch_id IS NOT NULL)            AS a_lines,
  (SELECT count(*) FROM timeclock_punches
     WHERE punch_type IN ('in', 'lunch_in', 'break_in'))                   AS b_lines,
  (SELECT count(*) FROM timeclock_punches t
     WHERE t.punch_type IN ('out', 'lunch_out', 'break_out')
       AND NOT EXISTS (
         SELECT 1 FROM timeclock_punches s
         WHERE regexp_replace(s.uattend_punch_id, '[-:](in|out)$', '')
             = regexp_replace(t.uattend_punch_id, '[-:](in|out)$', '')
           AND s.punch_type IN ('in', 'lunch_in', 'break_in')))            AS b_orphan_out;


-- ---------------------------------------------------------------------------
-- Q0c — THE LOAD-BEARING INVARIANT: is "Tot" the raw In→Out span?
--       Expected: tot_equals_span == rows_with_both for BOTH paycodes, with
--       max_diff 0.00. (Row COUNTS from the first measurement were doubled;
--       the equality and max_diff of 0.00 were not affected by that error.)
--
--       This is the assumption the whole fix rests on. If max_diff is ever
--       materially > 0, uAttend has changed convention and worked-hours.ts
--       will flag those days via its canary — but check here first.
-- ---------------------------------------------------------------------------
WITH line AS (
  SELECT DISTINCT ON (regexp_replace(uattend_punch_id, '[-:](in|out)$', ''))
    coalesce((raw_payload->>'PaycodeId')::int, (raw_payload->>'paycodeId')::int, 1) AS paycode,
    coalesce((raw_payload->>'Tot')::numeric, (raw_payload->>'hours')::numeric)      AS tot,
    coalesce(raw_payload->>'InTime',  raw_payload->>'punchIn')                      AS t_in,
    coalesce(raw_payload->>'OutTime', raw_payload->>'punchOut')                     AS t_out
  FROM timeclock_punches
  WHERE uattend_punch_id IS NOT NULL
  ORDER BY regexp_replace(uattend_punch_id, '[-:](in|out)$', ''), id
)
SELECT
  paycode,
  count(*) AS rows_with_both,
  count(*) FILTER (
    WHERE abs(tot - (
      -- span in hours, wrapping midnight
      (mod(extract(epoch FROM (t_out::time - t_in::time))::numeric + 86400, 86400) / 3600.0)
    )) <= 0.02
  ) AS tot_equals_span,
  round(max(abs(tot - (
    mod(extract(epoch FROM (t_out::time - t_in::time))::numeric + 86400, 86400) / 3600.0
  ))), 4) AS max_diff
FROM line
WHERE t_in IS NOT NULL AND t_out IS NOT NULL AND tot IS NOT NULL
GROUP BY paycode ORDER BY paycode;


-- ===========================================================================
-- From here on, every query is a SELECT that opens with the SAME CTE preamble
-- (punch_line -> worked_day). It is repeated verbatim rather than created as a
-- temp view so that NOTHING in this file is DDL: it is SELECTs only, top to
-- bottom, safe to run against production.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- Q1 — THE RECEIPT. Corrected per-day figures for the reported window.
--      `overstated_by` is what was being billed and should not have been.
--      Adjust the dates to whichever week is being checked.
-- ---------------------------------------------------------------------------
WITH punch_line AS (
  -- One row per punch-report LINE ITEM: both payload shapes coalesced, and the
  -- in/out row pair collapsed. The regex accepts BOTH separators — prod uses
  -- "<n>-in", punch-events.ts writes "<n>:in". A colon-only pattern matches
  -- nothing, the dedupe becomes a no-op, and every total below DOUBLES.
  SELECT DISTINCT ON (regexp_replace(p.uattend_punch_id, '[-:](in|out)$', ''))
    p.employee_id,
    coalesce(p.raw_payload->>'UserId', p.raw_payload->>'uattendId',
             p.uattend_employee_id)                                                 AS uattend_id,
    coalesce(p.raw_payload->>'PunchDate', p.raw_payload->>'date')::date             AS work_date,
    coalesce((p.raw_payload->>'PaycodeId')::int, (p.raw_payload->>'paycodeId')::int, 1) AS paycode,
    coalesce((p.raw_payload->>'Tot')::numeric, (p.raw_payload->>'hours')::numeric, 0)   AS tot_hours,
    coalesce(p.raw_payload->>'InTime',  p.raw_payload->>'punchIn')                  AS t_in,
    coalesce(p.raw_payload->>'OutTime', p.raw_payload->>'punchOut')                 AS t_out
  FROM timeclock_punches p
  WHERE p.uattend_punch_id IS NOT NULL
  ORDER BY regexp_replace(p.uattend_punch_id, '[-:](in|out)$', ''), p.id
),
worked_day AS (
  -- THE CORRECTED PER-DAY FIGURE. This expression is the whole fix:
  --     worked = SUM(paycode 1 Tot) - SUM(paycode 6,7 Tot)
  SELECT
    uattend_id,
    employee_id,
    work_date,
    round(coalesce(sum(tot_hours) FILTER (WHERE paycode = 1), 0), 2)      AS gross_hours,
    round(coalesce(sum(tot_hours) FILTER (WHERE paycode IN (6,7)), 0), 2) AS meal_hours,
    round(greatest(0,
      coalesce(sum(tot_hours) FILTER (WHERE paycode = 1), 0)
      - coalesce(sum(tot_hours) FILTER (WHERE paycode IN (6,7)), 0)), 2)  AS worked_hours,
    min(t_in)  FILTER (WHERE paycode = 1)                                 AS first_in,
    max(t_out) FILTER (WHERE paycode = 1)                                 AS last_out,
    count(*)   FILTER (WHERE paycode = 1)                                 AS regular_lines,
    count(*)   FILTER (WHERE paycode IN (6,7))                            AS meal_lines
  FROM punch_line
  GROUP BY uattend_id, employee_id, work_date
)
SELECT
  e.full_name,
  w.work_date,
  to_char(w.work_date, 'Dy')     AS dow,
  w.first_in, w.last_out,
  w.regular_lines, w.meal_lines,
  w.gross_hours   AS old_shown,   -- what the app displayed (lunch included)
  w.meal_hours,
  w.worked_hours  AS corrected,   -- what it must display now
  round(w.gross_hours - w.worked_hours, 2) AS overstated_by
FROM worked_day w
LEFT JOIN employees e ON e.id = w.employee_id
WHERE w.work_date BETWEEN DATE '2026-06-21' AND DATE '2026-06-27'
ORDER BY e.full_name, w.work_date;


-- ---------------------------------------------------------------------------
-- Q2 — THE HARD TARGET: Antonio's own record, plus corroborators. Expected:
--
--        Alexander Gonzalez  2026-06-26   8.47 − 0.52 → 7.95   <-- the report
--        Adrian Moreno       2026-06-26   8.43 − 0.52 → 7.91
--        Aide Clemente       2026-06-26   8.50 − 0.50 → 8.00
--        Maria Alfaro        2026-06-27   8.43 − 0.50 → 7.93
--
--      If these match, the SQL and worked-hours.ts agree on real rows, and
--      the e2e/logic suite is pinned to the same four.
--
--      Note 2026-06-26 is a FRIDAY. Antonio reported it as "Mon" — see Q2b.
-- ---------------------------------------------------------------------------
WITH punch_line AS (
  -- One row per punch-report LINE ITEM: both payload shapes coalesced, and the
  -- in/out row pair collapsed. The regex accepts BOTH separators — prod uses
  -- "<n>-in", punch-events.ts writes "<n>:in". A colon-only pattern matches
  -- nothing, the dedupe becomes a no-op, and every total below DOUBLES.
  SELECT DISTINCT ON (regexp_replace(p.uattend_punch_id, '[-:](in|out)$', ''))
    p.employee_id,
    coalesce(p.raw_payload->>'UserId', p.raw_payload->>'uattendId',
             p.uattend_employee_id)                                                 AS uattend_id,
    coalesce(p.raw_payload->>'PunchDate', p.raw_payload->>'date')::date             AS work_date,
    coalesce((p.raw_payload->>'PaycodeId')::int, (p.raw_payload->>'paycodeId')::int, 1) AS paycode,
    coalesce((p.raw_payload->>'Tot')::numeric, (p.raw_payload->>'hours')::numeric, 0)   AS tot_hours,
    coalesce(p.raw_payload->>'InTime',  p.raw_payload->>'punchIn')                  AS t_in,
    coalesce(p.raw_payload->>'OutTime', p.raw_payload->>'punchOut')                 AS t_out
  FROM timeclock_punches p
  WHERE p.uattend_punch_id IS NOT NULL
  ORDER BY regexp_replace(p.uattend_punch_id, '[-:](in|out)$', ''), p.id
),
worked_day AS (
  -- THE CORRECTED PER-DAY FIGURE. This expression is the whole fix:
  --     worked = SUM(paycode 1 Tot) - SUM(paycode 6,7 Tot)
  SELECT
    uattend_id,
    employee_id,
    work_date,
    round(coalesce(sum(tot_hours) FILTER (WHERE paycode = 1), 0), 2)      AS gross_hours,
    round(coalesce(sum(tot_hours) FILTER (WHERE paycode IN (6,7)), 0), 2) AS meal_hours,
    round(greatest(0,
      coalesce(sum(tot_hours) FILTER (WHERE paycode = 1), 0)
      - coalesce(sum(tot_hours) FILTER (WHERE paycode IN (6,7)), 0)), 2)  AS worked_hours,
    min(t_in)  FILTER (WHERE paycode = 1)                                 AS first_in,
    max(t_out) FILTER (WHERE paycode = 1)                                 AS last_out,
    count(*)   FILTER (WHERE paycode = 1)                                 AS regular_lines,
    count(*)   FILTER (WHERE paycode IN (6,7))                            AS meal_lines
  FROM punch_line
  GROUP BY uattend_id, employee_id, work_date
)
SELECT
  e.full_name,
  w.work_date,
  to_char(w.work_date, 'Dy')  AS real_dow,
  w.gross_hours               AS old_shown,
  w.meal_hours,
  w.worked_hours              AS corrected,
  w.regular_lines, w.meal_lines
FROM worked_day w
JOIN employees e ON e.id = w.employee_id
WHERE (e.full_name, w.work_date) IN (
        ('Alexander Gonzalez', DATE '2026-06-26'),
        ('Adrian Moreno',      DATE '2026-06-26'),
        ('Aide Clemente',      DATE '2026-06-26'),
        ('Maria Alfaro',       DATE '2026-06-27')
      )
ORDER BY e.full_name;


-- ---------------------------------------------------------------------------
-- Q2b — "Mon" vs Friday. THE ONE OPEN QUESTION, settled with data not theory.
--
--      Antonio reported the 8.47 as being on a Monday. The record is
--      2026-06-26, a FRIDAY. That is a four-day gap, which the Sun-vs-Mon
--      week-start bug does NOT explain (it is worth one day, and in fact this
--      date rendered as "Fri" under the old scheme too).
--
--      So either he spoke loosely, or values are stored under the wrong day
--      key — a third bug. This finds where 8.47 actually sits in the JSON.
--
--      EXPECTED: day_key = 'fri', and key_implies_date = 2026-06-26 matching
--      the punch date. If day_key comes back 'mon', or key_implies_date does
--      not match, STOP — there is a real key/date misalignment to fix and the
--      positional DAYS change alone will not correct it.
-- ---------------------------------------------------------------------------
SELECT
  e.full_name,
  t.week_start,
  to_char(t.week_start, 'Dy')                                   AS week_start_dow,
  t.status,
  d.key                                                         AS day_key,
  (t.week_start + array_position(
      ARRAY['sun','mon','tue','wed','thu','fri','sat'], d.key) - 1) AS key_implies_date,
  round((d.value->>'regular')::numeric, 2)                      AS stored_regular,
  d.value->>'in'   AS stored_in,
  d.value->>'out'  AS stored_out
FROM timecards t
JOIN employees e ON e.id = t.employee_id
CROSS JOIN LATERAL jsonb_each(t.days) AS d(key, value)
WHERE e.full_name = 'Alexander Gonzalez'
  AND (d.value->>'regular')::numeric BETWEEN 8.46 AND 8.48
ORDER BY t.week_start, array_position(ARRAY['sun','mon','tue','wed','thu','fri','sat'], d.key);


-- ---------------------------------------------------------------------------
-- Q3 — PROD-WIDE SCALE. Expected, on DEDUPLICATED data:
--        recorded_hours          ≈ 3118.1
--        lunch_billed_as_worked  ≈  169.1
--        pct_overstated          =    5.4
--        employee_days           =  377,  with_lunch = 328
--        avg_lunch ≈ 0.515, min 0.50, max 1.00  (NOT a fixed 30 minutes)
--
--      If recorded_hours comes back ≈ 6236 and lunch ≈ 338, the dedupe did not
--      take — go back to Q0b. Those doubled figures are what an un-deduped
--      first pass produces, and they look entirely plausible.
-- ---------------------------------------------------------------------------
WITH punch_line AS (
  -- One row per punch-report LINE ITEM: both payload shapes coalesced, and the
  -- in/out row pair collapsed. The regex accepts BOTH separators — prod uses
  -- "<n>-in", punch-events.ts writes "<n>:in". A colon-only pattern matches
  -- nothing, the dedupe becomes a no-op, and every total below DOUBLES.
  SELECT DISTINCT ON (regexp_replace(p.uattend_punch_id, '[-:](in|out)$', ''))
    p.employee_id,
    coalesce(p.raw_payload->>'UserId', p.raw_payload->>'uattendId',
             p.uattend_employee_id)                                                 AS uattend_id,
    coalesce(p.raw_payload->>'PunchDate', p.raw_payload->>'date')::date             AS work_date,
    coalesce((p.raw_payload->>'PaycodeId')::int, (p.raw_payload->>'paycodeId')::int, 1) AS paycode,
    coalesce((p.raw_payload->>'Tot')::numeric, (p.raw_payload->>'hours')::numeric, 0)   AS tot_hours,
    coalesce(p.raw_payload->>'InTime',  p.raw_payload->>'punchIn')                  AS t_in,
    coalesce(p.raw_payload->>'OutTime', p.raw_payload->>'punchOut')                 AS t_out
  FROM timeclock_punches p
  WHERE p.uattend_punch_id IS NOT NULL
  ORDER BY regexp_replace(p.uattend_punch_id, '[-:](in|out)$', ''), p.id
),
worked_day AS (
  -- THE CORRECTED PER-DAY FIGURE. This expression is the whole fix:
  --     worked = SUM(paycode 1 Tot) - SUM(paycode 6,7 Tot)
  SELECT
    uattend_id,
    employee_id,
    work_date,
    round(coalesce(sum(tot_hours) FILTER (WHERE paycode = 1), 0), 2)      AS gross_hours,
    round(coalesce(sum(tot_hours) FILTER (WHERE paycode IN (6,7)), 0), 2) AS meal_hours,
    round(greatest(0,
      coalesce(sum(tot_hours) FILTER (WHERE paycode = 1), 0)
      - coalesce(sum(tot_hours) FILTER (WHERE paycode IN (6,7)), 0)), 2)  AS worked_hours,
    min(t_in)  FILTER (WHERE paycode = 1)                                 AS first_in,
    max(t_out) FILTER (WHERE paycode = 1)                                 AS last_out,
    count(*)   FILTER (WHERE paycode = 1)                                 AS regular_lines,
    count(*)   FILTER (WHERE paycode IN (6,7))                            AS meal_lines
  FROM punch_line
  GROUP BY uattend_id, employee_id, work_date
)
SELECT
  round(sum(gross_hours), 1)                              AS recorded_hours,
  round(sum(meal_hours), 1)                               AS lunch_billed_as_worked,
  round(sum(worked_hours), 1)                             AS corrected_hours,
  round(100.0 * sum(meal_hours) / nullif(sum(gross_hours), 0), 1) AS pct_overstated,
  count(*)                                                AS employee_days,
  count(*) FILTER (WHERE meal_lines > 0)                  AS with_lunch,
  round(avg(meal_hours) FILTER (WHERE meal_lines > 0), 3) AS avg_lunch,
  min(meal_hours) FILTER (WHERE meal_lines > 0)           AS min_lunch,
  max(meal_hours) FILTER (WHERE meal_lines > 0)           AS max_lunch
FROM worked_day;


-- ---------------------------------------------------------------------------
-- Q4 — APP vs PUNCHES, per day. THE ACTUAL VERIFICATION.
--      Compares the number stored on the timecard (which is what the UI
--      renders) against the corrected figure derived from raw punches.
--
--      Run BEFORE the fix  → expect diff ≈ the meal on most days.
--      Run AFTER a re-pull → expect diff = 0.00 on every row.
--
--      NOTE the day-key arithmetic: after the fix `week_start` is the SUNDAY
--      and DAYS is ['sun'..'sat'], so index = work_date − week_start.
--      Against rows written BEFORE the fix (Monday week_start, Monday-keyed
--      days) this join is deliberately wrong — which is itself the signal
--      that those rows still need re-pulling.
-- ---------------------------------------------------------------------------
WITH punch_line AS (
  -- One row per punch-report LINE ITEM: both payload shapes coalesced, and the
  -- in/out row pair collapsed. The regex accepts BOTH separators — prod uses
  -- "<n>-in", punch-events.ts writes "<n>:in". A colon-only pattern matches
  -- nothing, the dedupe becomes a no-op, and every total below DOUBLES.
  SELECT DISTINCT ON (regexp_replace(p.uattend_punch_id, '[-:](in|out)$', ''))
    p.employee_id,
    coalesce(p.raw_payload->>'UserId', p.raw_payload->>'uattendId',
             p.uattend_employee_id)                                                 AS uattend_id,
    coalesce(p.raw_payload->>'PunchDate', p.raw_payload->>'date')::date             AS work_date,
    coalesce((p.raw_payload->>'PaycodeId')::int, (p.raw_payload->>'paycodeId')::int, 1) AS paycode,
    coalesce((p.raw_payload->>'Tot')::numeric, (p.raw_payload->>'hours')::numeric, 0)   AS tot_hours,
    coalesce(p.raw_payload->>'InTime',  p.raw_payload->>'punchIn')                  AS t_in,
    coalesce(p.raw_payload->>'OutTime', p.raw_payload->>'punchOut')                 AS t_out
  FROM timeclock_punches p
  WHERE p.uattend_punch_id IS NOT NULL
  ORDER BY regexp_replace(p.uattend_punch_id, '[-:](in|out)$', ''), p.id
),
worked_day AS (
  -- THE CORRECTED PER-DAY FIGURE. This expression is the whole fix:
  --     worked = SUM(paycode 1 Tot) - SUM(paycode 6,7 Tot)
  SELECT
    uattend_id,
    employee_id,
    work_date,
    round(coalesce(sum(tot_hours) FILTER (WHERE paycode = 1), 0), 2)      AS gross_hours,
    round(coalesce(sum(tot_hours) FILTER (WHERE paycode IN (6,7)), 0), 2) AS meal_hours,
    round(greatest(0,
      coalesce(sum(tot_hours) FILTER (WHERE paycode = 1), 0)
      - coalesce(sum(tot_hours) FILTER (WHERE paycode IN (6,7)), 0)), 2)  AS worked_hours,
    min(t_in)  FILTER (WHERE paycode = 1)                                 AS first_in,
    max(t_out) FILTER (WHERE paycode = 1)                                 AS last_out,
    count(*)   FILTER (WHERE paycode = 1)                                 AS regular_lines,
    count(*)   FILTER (WHERE paycode IN (6,7))                            AS meal_lines
  FROM punch_line
  GROUP BY uattend_id, employee_id, work_date
),
app_day AS (
  -- Expand each timecard's `days` JSON back into one row per calendar date,
  -- using the POSITIONAL day array. Index = work_date − week_start.
  SELECT
    t.employee_id,
    t.week_start,
    t.status,
    (ARRAY['sun','mon','tue','wed','thu','fri','sat'])[i + 1]      AS day_key,
    (t.week_start + i)                                             AS work_date,
    round((t.days -> (ARRAY['sun','mon','tue','wed','thu','fri','sat'])[i + 1]
           ->> 'regular')::numeric, 2)                             AS app_regular
  FROM timecards t
  CROSS JOIN generate_series(0, 6) AS i
)
SELECT
  e.full_name,
  a.work_date,
  a.status,
  a.app_regular          AS app_shows,
  w.worked_hours         AS punches_say,
  round(coalesce(a.app_regular, 0) - coalesce(w.worked_hours, 0), 2) AS diff
FROM app_day a
JOIN employees e ON e.id = a.employee_id
LEFT JOIN worked_day w
  ON w.employee_id = a.employee_id AND w.work_date = a.work_date
WHERE coalesce(a.app_regular, 0) <> 0 OR w.worked_hours IS NOT NULL
ORDER BY abs(coalesce(a.app_regular, 0) - coalesce(w.worked_hours, 0)) DESC NULLS LAST
LIMIT 100;


-- ---------------------------------------------------------------------------
-- Q5 — THE 137 APPROVED TIMECARDS, quantified.
--      These are staged on inflated hours AND on a Monday week boundary. No
--      invoice has been finalized, so this is what would have gone out.
--      Read-only: deciding what to do with them is Antonio's call.
-- ---------------------------------------------------------------------------
SELECT
  t.week_start,
  to_char(t.week_start, 'Dy')                    AS week_start_dow,
  t.status,
  count(*)                                       AS timecards,
  round(sum(t.reg_hours + t.ot_hours), 2)        AS hours_as_approved,
  round(sum(t.reg_hours * t.hourly_rate
          + t.ot_hours * t.hourly_rate * 1.5), 2) AS billable_as_approved
FROM timecards t
WHERE t.status = 'approved'
GROUP BY t.week_start, t.status
ORDER BY t.week_start;
