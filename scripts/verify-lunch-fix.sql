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
--      raw_payload. Summing raw_payload->>'Tot' across rows therefore DOUBLE
--      COUNTS. uattend_punch_id is "<uid>:<date>:<paycode>:in|out", so
--      stripping the trailing :in / :out yields the line identity. Q0b proves
--      the multiplicity before anything relies on it.
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
--       If this returns mostly 1, the dedupe below is a harmless no-op.
--       If it returns 3+, STOP — the line key is not what we think it is.
-- ---------------------------------------------------------------------------
SELECT rows_per_line, count(*) AS line_items
FROM (
  SELECT regexp_replace(uattend_punch_id, ':(in|out)$', '') AS line_key,
         count(*) AS rows_per_line
  FROM timeclock_punches
  WHERE uattend_punch_id IS NOT NULL
  GROUP BY 1
) x
GROUP BY 1 ORDER BY 1;


-- ---------------------------------------------------------------------------
-- Q0c — THE LOAD-BEARING INVARIANT: is "Tot" the raw In→Out span?
--       Expected (measured 2026-07-20): equal on 772/772 paycode-1 rows and
--       656/656 paycode-7 rows, max_diff 0.00.
--
--       This is the assumption the whole fix rests on. If max_diff is ever
--       materially > 0, uAttend has changed convention and worked-hours.ts
--       will flag those days via its canary — but check here first.
-- ---------------------------------------------------------------------------
WITH line AS (
  SELECT DISTINCT ON (regexp_replace(uattend_punch_id, ':(in|out)$', ''))
    coalesce((raw_payload->>'PaycodeId')::int, (raw_payload->>'paycodeId')::int, 1) AS paycode,
    coalesce((raw_payload->>'Tot')::numeric, (raw_payload->>'hours')::numeric)      AS tot,
    coalesce(raw_payload->>'InTime',  raw_payload->>'punchIn')                      AS t_in,
    coalesce(raw_payload->>'OutTime', raw_payload->>'punchOut')                     AS t_out
  FROM timeclock_punches
  WHERE uattend_punch_id IS NOT NULL
  ORDER BY regexp_replace(uattend_punch_id, ':(in|out)$', ''), id
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
-- THE NORMALIZER. Every query below builds on this: one row per punch-report
-- LINE ITEM, both payload shapes coalesced, in/out rows deduped.
-- ===========================================================================
CREATE OR REPLACE TEMP VIEW punch_line AS
SELECT DISTINCT ON (regexp_replace(p.uattend_punch_id, ':(in|out)$', ''))
  regexp_replace(p.uattend_punch_id, ':(in|out)$', '')                              AS line_key,
  p.employee_id,
  coalesce(p.raw_payload->>'UserId', p.raw_payload->>'uattendId',
           p.uattend_employee_id)                                                   AS uattend_id,
  coalesce(p.raw_payload->>'PunchDate', p.raw_payload->>'date')::date               AS work_date,
  coalesce((p.raw_payload->>'PaycodeId')::int, (p.raw_payload->>'paycodeId')::int, 1) AS paycode,
  coalesce((p.raw_payload->>'Tot')::numeric, (p.raw_payload->>'hours')::numeric, 0)  AS tot_hours,
  coalesce(p.raw_payload->>'InTime',  p.raw_payload->>'punchIn')                     AS t_in,
  coalesce(p.raw_payload->>'OutTime', p.raw_payload->>'punchOut')                    AS t_out
FROM timeclock_punches p
WHERE p.uattend_punch_id IS NOT NULL
ORDER BY regexp_replace(p.uattend_punch_id, ':(in|out)$', ''), p.id;


-- ===========================================================================
-- THE CORRECTED PER-DAY FIGURE. This single expression is the whole fix.
-- ===========================================================================
CREATE OR REPLACE TEMP VIEW worked_day AS
SELECT
  uattend_id,
  employee_id,
  work_date,
  -- Σ Regular Tot (a missing paycode counts as Regular, matching the normalizer)
  round(sum(tot_hours) FILTER (WHERE paycode = 1), 2)                       AS gross_hours,
  -- Σ punched meal + break
  round(coalesce(sum(tot_hours) FILTER (WHERE paycode IN (6,7)), 0), 2)     AS meal_hours,
  -- worked = gross − meal, never negative
  round(greatest(
    0,
    coalesce(sum(tot_hours) FILTER (WHERE paycode = 1), 0)
    - coalesce(sum(tot_hours) FILTER (WHERE paycode IN (6,7)), 0)
  ), 2)                                                                     AS worked_hours,
  min(t_in)  FILTER (WHERE paycode = 1)                                     AS first_in,
  max(t_out) FILTER (WHERE paycode = 1)                                     AS last_out,
  count(*)   FILTER (WHERE paycode = 1)                                     AS regular_lines,
  count(*)   FILTER (WHERE paycode IN (6,7))                                AS meal_lines
FROM punch_line
GROUP BY uattend_id, employee_id, work_date;


-- ---------------------------------------------------------------------------
-- Q1 — THE RECEIPT. Corrected per-day figures for the reported window.
--      `overstated_by` is what was being billed and should not have been.
--      Adjust the dates to whichever week is being checked.
-- ---------------------------------------------------------------------------
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
-- Q2 — THE FOUR NAMED ROWS, Mon 2026-06-22. Expected, from the measurement:
--        Aide Clemente    17.00 − 1.00 → 16.00
--        Alexis Garcia    17.06 − 1.06 → 16.00
--        Alondra Barajas  16.86 − 1.06 → 15.80
--        Audiel Montiel   17.04 − 1.00 → 16.04
--      If these four match, the SQL and worked-hours.ts agree on real rows.
-- ---------------------------------------------------------------------------
SELECT e.full_name, w.gross_hours, w.meal_hours, w.worked_hours
FROM worked_day w
JOIN employees e ON e.id = w.employee_id
WHERE w.work_date = DATE '2026-06-22'
  AND e.full_name IN ('Aide Clemente','Alexis Garcia','Alondra Barajas','Audiel Montiel')
ORDER BY e.full_name;


-- ---------------------------------------------------------------------------
-- Q3 — PROD-WIDE SCALE. Expected ≈ 338.1 meal hours against ≈ 6236.2 recorded,
--      i.e. 5.4% overstatement. Confirms this script reproduces the same
--      totals the independent measurement found.
-- ---------------------------------------------------------------------------
SELECT
  round(sum(gross_hours), 1)                              AS recorded_hours,
  round(sum(meal_hours), 1)                               AS lunch_billed_as_worked,
  round(sum(worked_hours), 1)                             AS corrected_hours,
  round(100.0 * sum(meal_hours) / nullif(sum(gross_hours), 0), 1) AS pct_overstated
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
WITH app_day AS (
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
