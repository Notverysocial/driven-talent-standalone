-- 0027_attendance_sick_day_status.sql
--
-- Attendance is being redesigned to track EXCEPTIONS only. The new exception
-- dropdown offers: Late, Missed Work, No Show, Excused, Sick Day.
--
-- The existing `attendance_status` enum (0000_init.sql) already covers
-- late / missed (relabelled "Missed Work" in the UI) / no_show / excused.
-- The only missing value is `sick_day`, added here additively. `present` is
-- retained for historical rows but is no longer logged going forward.
--
-- ALTER TYPE ... ADD VALUE is additive and safe; IF NOT EXISTS makes it
-- idempotent. No data backfill required.

alter type attendance_status add value if not exists 'sick_day';
