-- Integrations: shared infrastructure row for each third-party
-- provider (RingCentral, Indeed, uAttend, PandaDoc, Calendly).
-- Each provider's TypeScript client reads/writes this row via the
-- helpers in src/lib/integrations/db.ts.
--
-- Tokens are stored in this table directly (no separate vault) — the
-- table is RLS-locked to owner/admin and `access_token` /
-- `refresh_token` are only read server-side by the integration
-- runtime. The cron + webhook + manual-sync routes use the service
-- role client to bypass RLS during their work.

create table if not exists integrations (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique,
  display_name text not null,
  status text not null default 'disconnected' check (status in ('disconnected', 'connected', 'error', 'syncing', 'expired')),
  account_email text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  webhook_secret text,
  last_sync_at timestamptz,
  next_sync_at timestamptz,
  last_sync_count int default 0,
  last_error text,
  config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_integrations_status on integrations(status);
create index if not exists idx_integrations_next_sync_at on integrations(next_sync_at) where next_sync_at is not null;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'integrations_updated') then
    create trigger integrations_updated before update on integrations
      for each row execute function set_updated_at();
  end if;
end $$;

alter table integrations enable row level security;
drop policy if exists "owners_admins_only" on integrations;
create policy "owners_admins_only" on integrations for all to public
  using (exists (select 1 from profiles where id = auth.uid() and role in ('owner', 'admin')))
  with check (exists (select 1 from profiles where id = auth.uid() and role in ('owner', 'admin')));

-- Seed the 5 providers. Subsequent re-runs no-op via ON CONFLICT.
insert into integrations (provider, display_name) values
  ('ringcentral', 'RingCentral'),
  ('indeed', 'Indeed'),
  ('uattend', 'uAttend'),
  ('pandadoc', 'PandaDoc'),
  ('calendly', 'Calendly')
on conflict (provider) do nothing;
