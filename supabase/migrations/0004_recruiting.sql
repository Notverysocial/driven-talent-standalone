-- Driven Talent — recruiting module extensions
--
-- Adds three additive tables for the Recruiting module:
--   1. inbound_calls      — log of incoming candidate phone calls
--   2. positions          — open / filled job vacancies (vacancy tracker)
--   3. application_intakes — raw payloads from the driven-talent.com careers form
--
-- Also extends the existing message_channel enum so that website job
-- applications can flow into the existing inbox conversations stream.
--
-- Additive only — no destructive changes to existing tables.

-- ---------- enum extension ----------------------------------------------
-- Adds 'application' as a new conversation channel for inbound applications
-- from the careers form on driven-talent.com.
alter type message_channel add value if not exists 'application';

-- ---------- inbound_calls -----------------------------------------------

create type inbound_call_status as enum (
  'new', 'contacted', 'left_voicemail', 'converted', 'dropped'
);

create table if not exists inbound_calls (
  id uuid primary key default gen_random_uuid(),
  caller_name text not null,
  caller_phone text,
  caller_email text,
  position_of_interest text,
  called_at timestamptz not null default now(),
  taken_by text,                              -- which recruiter picked up
  notes text,
  follow_up_status inbound_call_status not null default 'new',
  follow_up_due date,
  converted_candidate_id uuid references candidates(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger inbound_calls_updated before update on inbound_calls
  for each row execute function set_updated_at();

create index inbound_calls_status_idx on inbound_calls (follow_up_status);
create index inbound_calls_called_at_idx on inbound_calls (called_at desc);

alter table inbound_calls enable row level security;
create policy "open" on inbound_calls for all to public using (true) with check (true);

-- ---------- positions (open job vacancies) ------------------------------

create type position_status as enum (
  'open', 'on_hold', 'filled', 'cancelled'
);

create table if not exists positions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete set null,
  role_title text not null,
  department text,
  shift text,                                 -- e.g. "1st shift M-F 6a-2:30p"
  pay_rate numeric(8,2),                      -- bill rate / hourly target
  pay_rate_unit text default 'hourly',        -- 'hourly' | 'salary' | 'piece'
  headcount int not null default 1,           -- number of openings on this req
  filled_count int not null default 0,
  requirements text,                          -- free-form: certs, experience
  recruiting_notes text,                      -- recruiter-only working notes
  status position_status not null default 'open',
  opened_at date not null default current_date,
  needed_by date,                             -- client deadline if any
  filled_at date,
  recruiter text,                             -- DT recruiter owning the req
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger positions_updated before update on positions
  for each row execute function set_updated_at();

create index positions_status_idx on positions (status);
create index positions_client_idx on positions (client_id) where client_id is not null;
create index positions_opened_idx on positions (opened_at desc);

alter table positions enable row level security;
create policy "open" on positions for all to public using (true) with check (true);

-- Link table: which employees ended up filling which positions
-- (a single req can have headcount > 1, so this is many-to-one)
create table if not exists position_placements (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references positions(id) on delete cascade,
  employee_id uuid references employees(id) on delete set null,
  candidate_id uuid references candidates(id) on delete set null,
  placed_at date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

create index position_placements_position_idx on position_placements (position_id);

alter table position_placements enable row level security;
create policy "open" on position_placements for all to public using (true) with check (true);

-- ---------- application_intakes -----------------------------------------
-- Raw payloads from the driven-talent.com careers form. Each intake
-- creates a paired `conversations` row (channel='application') so it
-- shows up in the Inbox, and `intake_payload` holds the full unmapped
-- form body for review before promotion to a candidate.
--
-- NOTE: the exact field set on driven-talent.com is not yet inventoried.
-- We capture an opinionated set of typed columns + the raw JSON payload,
-- so any future field can be re-mapped without losing data.

create type application_intake_status as enum (
  'new', 'reviewed', 'promoted', 'rejected', 'spam'
);

create table if not exists application_intakes (
  id uuid primary key default gen_random_uuid(),
  -- typed best-effort mapping (see /api/intake/application route handler)
  full_name text,
  email text,
  phone text,
  city text,
  position_of_interest text,
  experience_years numeric(4,1),
  resume_url text,                                -- if the form hosted the file
  cover_letter text,
  -- provenance + raw
  source text default 'driven-talent.com',        -- which form / page
  user_agent text,
  ip_hash text,                                   -- hashed IP for dedupe (no raw PII IP)
  intake_payload jsonb not null default '{}'::jsonb,
  -- workflow
  status application_intake_status not null default 'new',
  conversation_id uuid references conversations(id) on delete set null,
  promoted_candidate_id uuid references candidates(id) on delete set null,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger application_intakes_updated before update on application_intakes
  for each row execute function set_updated_at();

create index application_intakes_status_idx on application_intakes (status);
create index application_intakes_created_idx on application_intakes (created_at desc);
create index application_intakes_email_idx on application_intakes (lower(email)) where email is not null;

alter table application_intakes enable row level security;
create policy "open" on application_intakes for all to public using (true) with check (true);

alter publication supabase_realtime add table application_intakes;
