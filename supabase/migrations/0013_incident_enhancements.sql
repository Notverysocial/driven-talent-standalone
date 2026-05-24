-- Driven Talent — Safety / Incident enhancements (Wave 1, module 1.7)
--
-- Adds:
--   1. incident_case_events — per-case history/activity log (timestamped
--      audit trail for status changes, compliance flags, emails sent, notes,
--      exports, etc).
--   2. Two additive columns on safety_incidents that capture state for the
--      "Open a Peoplease claim by email" handoff so the UI can render
--      whether/when a claim has been dispatched without rummaging through
--      the event log.
--
-- Strictly additive — no drops, no alters to existing tables/types beyond
-- two `add column if not exists`. RLS follows the established "open"
-- convention from migrations 0003-0006 (auth is tightened in a later
-- milestone).

-- ---------- enum --------------------------------------------------------

create type incident_event_type as enum (
  'created',
  'status_changed',
  'compliance_flag',
  'note',
  'peoplease_email_drafted',
  'peoplease_email_sent',
  'export_pdf',
  'export_excel',
  'notification_sent'
);

-- ---------- case history / activity log ---------------------------------

create table incident_case_events (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references safety_incidents(id) on delete cascade,
  event_type incident_event_type not null,
  -- Human-readable summary line ("Status changed from reported → investigating",
  -- "DWC-1 marked sent", "Peoplease claim email drafted to adjuster@…").
  summary text not null,
  -- Optional free-form note from the actor.
  note text,
  -- Who performed the action — text name, not an FK, because the auth/user
  -- model isn't fully wired yet (matches the `reported_by` convention on
  -- safety_incidents itself).
  actor text,
  -- Arbitrary structured payload — e.g. for a status_changed event:
  -- { "from": "reported", "to": "investigating" }. For a peoplease email:
  -- { "to": "...", "subject": "...", "body": "..." }.
  meta jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index incident_case_events_incident_idx
  on incident_case_events (incident_id);
create index incident_case_events_occurred_idx
  on incident_case_events (occurred_at desc);
create index incident_case_events_type_idx
  on incident_case_events (event_type);

alter table incident_case_events enable row level security;
create policy "open" on incident_case_events
  for all to public using (true) with check (true);

-- ---------- safety_incidents: peoplease claim state ---------------------

-- When the Peoplease claim hand-off email was last drafted/dispatched.
alter table safety_incidents
  add column if not exists peoplease_claim_drafted_at timestamptz;

alter table safety_incidents
  add column if not exists peoplease_claim_email text;
