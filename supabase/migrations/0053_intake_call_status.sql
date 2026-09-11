-- 0053_intake_call_status.sql
--
-- CALL / SCREENING STATUS per applicant, set inline on the /applications card.
-- Requested options (labels exactly as the recruiters use them):
--   Pendiente · Llamado · Calificado · No Califica ·
--   no responde, llamar de nuevo · WORKING NOW · NO INTERESADO · DNR
--
-- WHY A NEW COLUMN rather than extending an existing status:
--   * application_intakes.status (enum, 0004) is the WORKFLOW stage —
--     new / reviewed / promoted / rejected / spam. The list page groups its
--     sections on it and promotion sets it. Folding call outcomes into it
--     would break that grouping and the promotion path.
--   * candidates.screening_status (0040: approved / on_hold) lives on
--     CANDIDATES, not applicants, and is already in real use.
--   So applicants had no call-status field to extend.
--
-- Stored as stable lowercase ids; the display labels live in
-- src/lib/intake-call-status.ts. Every existing applicant starts at
-- 'pendiente'. Who changed it and when is recorded in activity_log.
--
-- Additive and idempotent — safe to re-run. No data rewrite beyond the default.

alter table application_intakes
  add column if not exists call_status text not null default 'pendiente';

alter table application_intakes
  drop constraint if exists application_intakes_call_status_check;
alter table application_intakes
  add constraint application_intakes_call_status_check
  check (call_status in (
    'pendiente', 'llamado', 'calificado', 'no_califica',
    'no_responde', 'working_now', 'no_interesado', 'dnr'
  ));

create index if not exists idx_application_intakes_call_status
  on application_intakes (call_status);

comment on column application_intakes.call_status is
  'Recruiter call/screening status (0053). Labels in src/lib/intake-call-status.ts.';
