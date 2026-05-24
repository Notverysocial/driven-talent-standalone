-- Driven Talent — Job Postings module
--
-- Tracks individual job posts published to external job boards
-- (Indeed, Facebook, LinkedIn, Instagram) for each open position.
-- One internal `positions` row (from migration 0004) can have many
-- `job_postings` rows — one per platform the recruiter ran the ad on.
--
-- Distinct from `positions` (the internal vacancy/req) and from
-- `application_intakes` (the inbound submissions). This table is the
-- outbound side: where did we advertise, how many applications did
-- that posting bring in, is the posting still live?
--
-- Additive only — no destructive changes to existing tables.

-- ---------- enums -------------------------------------------------------

create type job_posting_platform as enum (
  'indeed', 'facebook', 'linkedin', 'instagram'
);

create type job_posting_status as enum (
  'open', 'closed'
);

-- ---------- job_postings ------------------------------------------------

create table if not exists job_postings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete set null,
  position_id uuid references positions(id) on delete set null,
  role_title text not null,                       -- denormalized: ad copy can differ from the internal req title
  platform job_posting_platform not null,
  posting_title text,                             -- headline shown on the platform (often differs from role_title)
  posting_url text,                               -- link to the live ad
  status job_posting_status not null default 'open',
  posted_at date not null default current_date,
  closed_at date,
  application_count int not null default 0,      -- applications attributed to this posting
  notes text,                                     -- recruiter notes (creative variants, A/B test, budget, etc.)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger job_postings_updated before update on job_postings
  for each row execute function set_updated_at();

create index job_postings_platform_idx on job_postings (platform);
create index job_postings_status_idx on job_postings (status);
create index job_postings_position_idx on job_postings (position_id) where position_id is not null;
create index job_postings_client_idx on job_postings (client_id) where client_id is not null;
create index job_postings_posted_idx on job_postings (posted_at desc);

alter table job_postings enable row level security;
create policy "open" on job_postings for all to public using (true) with check (true);
