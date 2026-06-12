-- Driven Talent — client_contacts table (2026-06-09)
--
-- Adds a client-side org-chart table for contacts at each client (FFF, ISC, etc.).
-- Populated initially from the "Contact records" sheet of
-- DT-LIVE-DATA-2026-06-08.xlsx — the FFF & ISC manager/supervisor/director
-- directory the warehouse team uses to route comms.
--
-- Companion seed migration: 0021_client_contacts_seed.sql.
--
-- Additive only — no destructive changes.

create table if not exists client_contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  full_name text not null,
  first_name text,
  last_name text,
  department text,
  position text,
  phone text,                 -- 10-digit, digits-only
  email text,
  shift text,                 -- AM / PM / etc.
  role_type text,             -- Manager / Supervisor / Director / Coordinator / HR / Lead / Executive / Inventory / Mechanic / Sr. Manager / Associate Manager
  notes text,                 -- any leftover unstructured detail
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_client_contacts_client_id on client_contacts(client_id);
create unique index if not exists idx_client_contacts_email on client_contacts(lower(email)) where email is not null;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'client_contacts_updated') then
    create trigger client_contacts_updated before update on client_contacts
      for each row execute function set_updated_at();
  end if;
end $$;

alter table client_contacts enable row level security;
drop policy if exists "open" on client_contacts;
create policy "open" on client_contacts for all to public using (true) with check (true);

