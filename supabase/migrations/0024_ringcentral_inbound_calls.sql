-- 0024_ringcentral_inbound_calls.sql
--
-- Enriches inbound_calls with RingCentral-specific columns so the
-- RingCentral integration can upsert call-log records keyed by the
-- session id and store duration / recording / voicemail metadata.
--
-- All columns are nullable / defaulted so existing CSV-imported rows
-- continue to load cleanly. The unique index on ringcentral_id is what
-- powers the provider client's upsert(onConflict='ringcentral_id').

alter table inbound_calls
  add column if not exists ringcentral_id text unique,
  add column if not exists call_duration_seconds int,
  add column if not exists recording_url text,
  add column if not exists voicemail_transcription text,
  add column if not exists call_direction text default 'inbound',
  add column if not exists call_status text;

create index if not exists idx_inbound_calls_ringcentral_id
  on inbound_calls(ringcentral_id);