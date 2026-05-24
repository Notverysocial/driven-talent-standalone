-- Driven Talent — Sales Pipeline / CRM (Wave 1, module 1.9)
--
-- Tracks BUSINESS leads — prospective staffing CLIENTS (companies that
-- might hire Driven Talent to staff their workforce). This is DISTINCT
-- from the recruiting ATS (`candidates`, `application_intakes`,
-- `inbound_calls`) which tracks job seekers.
--
-- Adds:
--   1. sales_leads          — prospective client companies with pipeline
--                             stage, deal value, owner, next-action date.
--   2. sales_lead_activities — chronological log of touches (calls, emails,
--                              notes, stage changes, owner changes) per lead.
--
-- Strictly additive — no drops, no alters to existing tables/types. RLS
-- follows the established "open" convention from migrations 0003-0006.

-- ---------- enums --------------------------------------------------------

create type sales_lead_stage as enum (
  'new',
  'contacted',
  'qualified',
  'proposal',
  'won',
  'lost'
);

create type sales_lead_source as enum (
  'referral',
  'cold_outreach',
  'inbound_web',
  'event',
  'existing_client',
  'partner',
  'other'
);

create type sales_lead_activity_type as enum (
  'note',
  'call',
  'email',
  'meeting',
  'stage_changed',
  'owner_changed',
  'task'
);

-- ---------- sales_leads --------------------------------------------------

create table sales_leads (
  id uuid primary key default gen_random_uuid(),
  -- Prospective client company.
  company_name text not null,
  industry text,
  website text,
  city text,
  -- Primary contact at the company.
  contact_name text,
  contact_title text,
  contact_email text,
  contact_phone text,
  -- Pipeline position + provenance.
  stage sales_lead_stage not null default 'new',
  source sales_lead_source not null default 'other',
  source_detail text,                          -- free-form: who referred, which event, etc.
  -- Deal sizing (estimated, until proposal stage).
  estimated_value numeric(12,2),               -- annual/total contract value, in USD
  estimated_headcount int,                     -- # of placements the deal could cover
  probability int check (probability is null or (probability >= 0 and probability <= 100)),
  -- Ownership + next action.
  owner text,                                  -- DT team member name (auth not wired yet)
  next_action text,                            -- one-line "what's the next move"
  next_action_due date,
  -- Outcome tracking.
  won_at date,
  lost_at date,
  lost_reason text,
  -- If the lead is already an active client (e.g. expansion deal).
  client_id uuid references clients(id) on delete set null,
  -- General notes panel.
  notes text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger sales_leads_updated before update on sales_leads
  for each row execute function set_updated_at();

create index sales_leads_stage_idx on sales_leads (stage);
create index sales_leads_owner_idx on sales_leads (owner) where owner is not null;
create index sales_leads_next_action_idx on sales_leads (next_action_due) where next_action_due is not null;
create index sales_leads_created_idx on sales_leads (created_at desc);
create index sales_leads_company_idx on sales_leads (lower(company_name));

alter table sales_leads enable row level security;
create policy "open" on sales_leads for all to public using (true) with check (true);

-- ---------- sales_lead_activities ---------------------------------------
-- Chronological log of every touch on a lead — call notes, email summaries,
-- stage changes, owner reassignments, meeting recaps, follow-up tasks.

create table sales_lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references sales_leads(id) on delete cascade,
  activity_type sales_lead_activity_type not null,
  -- Human-readable summary line ("Stage changed from new → contacted",
  -- "Discovery call with Jane Doe", "Sent proposal v2").
  summary text not null,
  -- Optional free-form body / call notes / email gist.
  body text,
  -- Who performed the action.
  actor text,
  -- Structured payload — e.g. for stage_changed: { "from": "new", "to": "contacted" }.
  meta jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index sales_lead_activities_lead_idx
  on sales_lead_activities (lead_id);
create index sales_lead_activities_occurred_idx
  on sales_lead_activities (occurred_at desc);
create index sales_lead_activities_type_idx
  on sales_lead_activities (activity_type);

alter table sales_lead_activities enable row level security;
create policy "open" on sales_lead_activities
  for all to public using (true) with check (true);
