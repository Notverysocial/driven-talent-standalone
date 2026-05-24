-- Driven Talent — Wave 3.1 RBAC
--
-- Adds authentication-tier role information layered on top of Supabase Auth.
--
-- Design decision (see Wave 3.1 report):
--   * `team_member_role` (migration 0012) is a *job function* enum
--     (founder/admin/recruiter/safety_manager/onboarding_coordinator/
--      payroll/finance/sales/staff). It's already populated and represents
--     organisational structure, not authorisation.
--   * Authorisation needs a separate 3-tier model: owner / admin / user.
--     Collapsing the 9 functional roles into 3 tiers would lose
--     information and force awkward enum reuse. Two orthogonal enums
--     stay clean: an auth user's job function and their permission tier
--     can evolve independently.
--
-- New objects:
--   1. `app_role` enum — the 3-tier authorisation model.
--   2. `profiles` table — one row per `auth.users` row, carrying the
--      `app_role` plus an optional FK to the existing `team_members` row.
--      A trigger auto-creates a profile row when a new auth user is created.
--   3. RLS policies on `profiles` — users can read their own profile,
--      anyone authenticated can read the directory of profiles (needed
--      for "assignee" pickers etc.), and only `owner`/`admin` profiles
--      can modify other profiles. Inserts are blocked because the
--      trigger is authoritative.
--
-- Backwards compatibility: this migration is purely additive. No existing
-- rows are altered, no existing columns dropped, no existing policies
-- modified. The 16 prior migrations still apply unchanged.

-- ---------- app_role enum ----------------------------------------------

create type app_role as enum ('owner', 'admin', 'user');

-- ---------- profiles ---------------------------------------------------
-- One row per auth.users row. Keyed on auth.users.id so the FK cascades
-- on user deletion (Supabase Auth handles user deletion via its own admin
-- API; we just track the role).

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role app_role not null default 'user',
  team_member_id uuid references team_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated before update on profiles
  for each row execute function set_updated_at();

create index profiles_role_idx on profiles (role);
create index profiles_team_member_idx on profiles (team_member_id);

-- ---------- auto-create profile on new auth user -----------------------
-- Every Supabase Auth signup gets a `user`-tier profile by default. An
-- owner/admin can promote them afterwards via the Team Members admin
-- page.  We pull email + raw_user_meta_data.full_name when available so
-- the directory has friendly names from day one.

create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    'user'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- ---------- RLS on profiles --------------------------------------------
-- Reads: any authenticated user can read the profile directory (needed
-- for assignee pickers, avatars, "created_by" name resolution etc.).
-- Inserts: blocked from the client; the trigger is the only writer.
-- Updates: a profile can update its own non-role fields; only owners
-- and admins can change any role or another user's profile.
-- Deletes: blocked from the client; deletions cascade from auth.users.

alter table profiles enable row level security;

create policy "profiles_read_authenticated"
  on profiles for select
  to authenticated
  using (true);

create policy "profiles_update_self"
  on profiles for update
  to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    -- self-update cannot change role: must be unchanged from current row
    and role = (select role from profiles where id = auth.uid())
  );

create policy "profiles_update_admin"
  on profiles for update
  to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role in ('owner', 'admin')
    )
  );
