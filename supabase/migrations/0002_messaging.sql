-- Driven Talent — messaging / CRM tables
-- Run in Supabase SQL Editor or via supabase db push

-- ---------- enums --------------------------------------------------------

create type contact_type as enum ('employer', 'job_seeker', 'other');
create type conversation_status as enum ('open', 'assigned', 'resolved', 'archived');
create type message_channel as enum ('web_chat', 'sms', 'email');
create type message_sender_type as enum ('visitor', 'agent', 'bot');

-- ---------- contacts -----------------------------------------------------

create table contacts (
  id uuid primary key default gen_random_uuid(),
  full_name text,
  email text,
  phone text,
  company text,
  type contact_type not null default 'other',
  source text,
  notes text,
  candidate_id uuid references candidates(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger contacts_updated before update on contacts
  for each row execute function set_updated_at();

create index contacts_type_idx on contacts (type);
create index contacts_candidate_idx on contacts (candidate_id) where candidate_id is not null;
create index contacts_client_idx on contacts (client_id) where client_id is not null;

-- ---------- conversations ------------------------------------------------

create table conversations (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  subject text,
  status conversation_status not null default 'open',
  assigned_to text,
  channel message_channel not null default 'web_chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger conversations_updated before update on conversations
  for each row execute function set_updated_at();

create index conversations_status_idx on conversations (status);
create index conversations_contact_idx on conversations (contact_id);

-- ---------- messages -----------------------------------------------------

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_type message_sender_type not null default 'visitor',
  sender_name text,
  body text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index messages_conversation_idx on messages (conversation_id, created_at);

-- ---------- RLS ----------------------------------------------------------

alter table contacts enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;

create policy "open" on contacts      for all to public using (true) with check (true);
create policy "open" on conversations for all to public using (true) with check (true);
create policy "open" on messages      for all to public using (true) with check (true);

-- ---------- Realtime -----------------------------------------------------

alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table conversations;
