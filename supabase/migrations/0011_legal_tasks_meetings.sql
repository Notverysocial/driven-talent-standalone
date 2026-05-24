-- Driven Talent — Module 1.5: Legal Documents · Tasks · Meetings · Contacts (extended)
--
-- Three connected internal-ops surfaces:
--   1. legal_documents       — Legal docs / notices repository (handbook, COIs,
--                              W-9s, NDAs, posters, client agreements, etc).
--   2. tasks + task_reminders — Task tracker. Tasks are assignable to team
--                              members and due-date driven; per-task reminders
--                              fire as the due date approaches.
--   3. meetings + meeting_attendees + meeting_action_items
--                            — Meetings repository (datetime, attendees, notes,
--                              and action items that promote into tasks).
--   4. contacts (extends 0002_messaging.sql)
--                            — Adds Rolodex-style fields (title, role, address,
--                              tags, owner, etc) to the existing contacts table
--                              so it can stand alone as a CRM surface alongside
--                              the messaging features.
--
-- Additive only. RLS uses the existing "open to public" convention from
-- migrations 0003-0006; auth tightens in a later milestone.

-- ---------- enums --------------------------------------------------------

create type legal_document_category as enum (
  'handbook',          -- Employee handbook, code of conduct
  'policy',            -- Standalone policies, SOPs in legal form
  'agreement',         -- Client agreements, MSA, SOW
  'nda',               -- NDAs, confidentiality
  'insurance',         -- COI, liability, workers comp
  'tax',               -- W-9, 1099, EIN docs
  'license',           -- Business licenses, permits
  'poster',            -- Required labor-law posters (CA / federal)
  'incorporation',     -- Articles, operating agreements
  'compliance',        -- Audits, inspections, certifications
  'notice',            -- DOL / EEOC / Cal-OSHA notices received
  'other'
);

create type legal_document_status as enum (
  'active', 'expiring_soon', 'expired', 'superseded', 'archived'
);

create type task_status as enum (
  'todo', 'in_progress', 'blocked', 'done', 'cancelled'
);

create type task_priority as enum (
  'low', 'normal', 'high', 'urgent'
);

create type task_reminder_channel as enum (
  'in_app', 'email', 'sms'
);

create type meeting_status as enum (
  'scheduled', 'in_progress', 'completed', 'cancelled', 'rescheduled'
);

create type meeting_attendee_status as enum (
  'invited', 'accepted', 'declined', 'tentative', 'attended', 'no_show'
);

create type contact_role as enum (
  'client_primary',    -- Decision-maker at a client
  'client_billing',    -- AP contact at a client
  'client_ops',        -- Day-to-day operations contact
  'vendor',            -- Suppliers, service providers
  'partner',           -- Referral partners, recruiters, channel
  'candidate_lead',    -- Inbound candidate not yet in pipeline
  'employee',          -- Internal team
  'legal',             -- Outside counsel
  'accountant',        -- Bookkeeper, CPA
  'insurance',         -- Insurance broker, carrier rep
  'government',        -- EDD, IRS, Cal-OSHA contact
  'other'
);

-- ---------- legal_documents ----------------------------------------------

create table legal_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category legal_document_category not null default 'other',
  status legal_document_status not null default 'active',
  description text,

  -- File reference. Storage path inside Supabase Storage when a binary lives
  -- there; external_url for SaaS-hosted docs (Google Drive, DocuSign, etc).
  file_path text,
  external_url text,
  file_mime text,
  file_size_bytes bigint,

  document_number text,       -- Policy number, license number, COI #
  issuer text,                 -- "State of California", "Hartford", "Driven Talent"
  jurisdiction text,           -- "CA", "Federal", "Riverside County"

  effective_date date,
  expiry_date date,            -- null = doesn't expire
  reminder_days_before int default 30,  -- Days ahead of expiry to warn

  -- Optional links to other rows.
  client_id uuid references clients(id) on delete set null,
  employee_id uuid references employees(id) on delete set null,

  tags text[] not null default '{}',
  notes text,

  uploaded_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint legal_documents_expiry_after_effective
    check (expiry_date is null or effective_date is null or expiry_date >= effective_date)
);

create trigger legal_documents_updated before update on legal_documents
  for each row execute function set_updated_at();

create index legal_documents_category_idx on legal_documents (category);
create index legal_documents_status_idx on legal_documents (status);
create index legal_documents_expiry_idx on legal_documents (expiry_date) where expiry_date is not null;
create index legal_documents_client_idx on legal_documents (client_id) where client_id is not null;
create index legal_documents_employee_idx on legal_documents (employee_id) where employee_id is not null;

alter table legal_documents enable row level security;
create policy "open" on legal_documents for all to public using (true) with check (true);

-- ---------- tasks --------------------------------------------------------
-- Assignable, time-dependent task tracker. Reminders surface as the due date
-- approaches (see task_reminders below).

create table tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,

  status task_status not null default 'todo',
  priority task_priority not null default 'normal',

  -- Assignee — free-text now (team-member name), employee_id when matched.
  -- The two columns let the UI accept either and prefer the FK when set.
  assignee_name text,
  assignee_employee_id uuid references employees(id) on delete set null,

  -- Time dependence — every task MUST have a due_at; this is the column the
  -- reminder system keys on. start_at is optional (for tasks the user wants
  -- to block out time for).
  due_at timestamptz not null,
  start_at timestamptz,
  completed_at timestamptz,

  -- Free-text owner of the task ("who created / requested it").
  created_by text,

  -- Optional cross-links to other rows so a task can come "from" something.
  client_id uuid references clients(id) on delete set null,
  employee_id uuid references employees(id) on delete set null,
  legal_document_id uuid references legal_documents(id) on delete set null,
  meeting_id uuid,  -- FK added below after meetings table exists

  tags text[] not null default '{}',
  notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger tasks_updated before update on tasks
  for each row execute function set_updated_at();

create index tasks_status_idx on tasks (status);
create index tasks_due_idx on tasks (due_at);
create index tasks_assignee_emp_idx on tasks (assignee_employee_id) where assignee_employee_id is not null;
create index tasks_assignee_name_idx on tasks (assignee_name) where assignee_name is not null;
create index tasks_client_idx on tasks (client_id) where client_id is not null;
create index tasks_priority_idx on tasks (priority);

alter table tasks enable row level security;
create policy "open" on tasks for all to public using (true) with check (true);

-- ---------- task_reminders ----------------------------------------------
-- Per-task scheduled reminders. The UI / a future cron worker reads
-- `fire_at <= now() and fired_at is null` to surface notifications. Default
-- reminders (1 day before, day-of) are seeded by the action handlers, but
-- users can add custom ones.

create table task_reminders (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  fire_at timestamptz not null,
  channel task_reminder_channel not null default 'in_app',
  fired_at timestamptz,            -- null until delivered
  acknowledged_at timestamptz,     -- user dismissed / saw the reminder
  notes text,
  created_at timestamptz not null default now()
);

create index task_reminders_task_idx on task_reminders (task_id);
create index task_reminders_fire_idx on task_reminders (fire_at) where fired_at is null;

alter table task_reminders enable row level security;
create policy "open" on task_reminders for all to public using (true) with check (true);

-- ---------- meetings -----------------------------------------------------

create table meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status meeting_status not null default 'scheduled',

  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,

  location text,                 -- physical location
  link_url text,                 -- zoom / meet / teams

  -- Notes / agenda / minutes. agenda is written ahead; notes after.
  agenda text,
  notes text,

  -- Optional cross-links.
  client_id uuid references clients(id) on delete set null,
  organizer_name text,
  organizer_employee_id uuid references employees(id) on delete set null,

  tags text[] not null default '{}',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint meetings_ends_after_starts
    check (ends_at is null or ends_at >= starts_at)
);

create trigger meetings_updated before update on meetings
  for each row execute function set_updated_at();

create index meetings_starts_idx on meetings (starts_at);
create index meetings_status_idx on meetings (status);
create index meetings_client_idx on meetings (client_id) where client_id is not null;

alter table meetings enable row level security;
create policy "open" on meetings for all to public using (true) with check (true);

-- now that meetings exists, add the deferred FK on tasks.meeting_id
alter table tasks
  add constraint tasks_meeting_fk
  foreign key (meeting_id) references meetings(id) on delete set null;

create index tasks_meeting_idx on tasks (meeting_id) where meeting_id is not null;

-- ---------- meeting_attendees -------------------------------------------

create table meeting_attendees (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,

  -- Either a free-text attendee or a row from contacts / employees.
  attendee_name text,
  attendee_email text,
  contact_id uuid references contacts(id) on delete set null,
  employee_id uuid references employees(id) on delete set null,

  status meeting_attendee_status not null default 'invited',
  is_organizer boolean not null default false,

  created_at timestamptz not null default now(),

  constraint meeting_attendees_has_identity
    check (
      attendee_name is not null
      or contact_id is not null
      or employee_id is not null
    )
);

create index meeting_attendees_meeting_idx on meeting_attendees (meeting_id);
create index meeting_attendees_contact_idx on meeting_attendees (contact_id) where contact_id is not null;
create index meeting_attendees_employee_idx on meeting_attendees (employee_id) where employee_id is not null;

alter table meeting_attendees enable row level security;
create policy "open" on meeting_attendees for all to public using (true) with check (true);

-- ---------- meeting_action_items ----------------------------------------
-- Action items captured during a meeting. Each can promote into a task by
-- setting task_id; the UI link travels both directions.

create table meeting_action_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  description text not null,
  owner_name text,
  owner_employee_id uuid references employees(id) on delete set null,
  due_date date,
  done boolean not null default false,
  task_id uuid references tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger meeting_action_items_updated before update on meeting_action_items
  for each row execute function set_updated_at();

create index meeting_action_items_meeting_idx on meeting_action_items (meeting_id);
create index meeting_action_items_owner_idx on meeting_action_items (owner_employee_id) where owner_employee_id is not null;

alter table meeting_action_items enable row level security;
create policy "open" on meeting_action_items for all to public using (true) with check (true);

-- ---------- contacts: extend the existing table -------------------------
-- The contacts table from 0002_messaging.sql has (full_name, email, phone,
-- company, type, source, notes, candidate_id, client_id). Extend it with
-- Rolodex fields so the standalone Contacts repository can do its job.
-- All columns are additive + nullable; existing rows are untouched.

alter table contacts add column if not exists title text;
alter table contacts add column if not exists role contact_role;
alter table contacts add column if not exists mobile_phone text;
alter table contacts add column if not exists work_phone text;
alter table contacts add column if not exists secondary_email text;
alter table contacts add column if not exists website text;
alter table contacts add column if not exists linkedin_url text;
alter table contacts add column if not exists address_line1 text;
alter table contacts add column if not exists address_line2 text;
alter table contacts add column if not exists city text;
alter table contacts add column if not exists state text;
alter table contacts add column if not exists postal_code text;
alter table contacts add column if not exists country text;
alter table contacts add column if not exists birthday date;
alter table contacts add column if not exists tags text[] not null default '{}';
alter table contacts add column if not exists owner text;       -- internal owner ("Rocio")
alter table contacts add column if not exists favorite boolean not null default false;
alter table contacts add column if not exists last_contacted_at timestamptz;
alter table contacts add column if not exists employee_id uuid references employees(id) on delete set null;

create index if not exists contacts_role_idx on contacts (role) where role is not null;
create index if not exists contacts_owner_idx on contacts (owner) where owner is not null;
create index if not exists contacts_favorite_idx on contacts (favorite) where favorite = true;
create index if not exists contacts_employee_idx on contacts (employee_id) where employee_id is not null;
