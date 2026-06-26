-- 0034_estephany_phase1.sql
--
-- Estephany Phase-1 backlog (no client dependency). All additive + idempotent
-- — existing rows untouched, safe to re-run. Numbered 0034 (next after the
-- 0033 onboarding-foundation migration on main).
--
-- Covers:
--   * Recruiter management — a real `recruiters` table so the per-recruiter
--     tabs are self-serve (add/remove) instead of a hardcoded TS constant.
--   * Client section — basic company-info columns (phone / website / status)
--     so a client record carries more than billing config.
--   * Wellness / follow-up notes timeline — an immutable, append-only entry
--     model (date/time/author) scoped to an employee. Backbone of the
--     workplace-accident / incident case-management record.
--   * Team tagging — an in-app `notifications` table so an @mention inside an
--     onboarding task can notify a teammate (no email transport required).
--
-- NOTE: the "Active while onboarding" toggle (Phase-1 item #1) needs NO schema
-- change — `employee_status` already has 'active'; the tracker query is
-- broadened in code to keep mid-onboarding actives visible.

-- ---------------------------------------------------------------------------
-- 1) Recruiters roster (self-serve recruiter management)
-- ---------------------------------------------------------------------------
-- Replaces the hardcoded RECRUITERS constant. Candidates still own their
-- recruiter via the free-text `candidates.recruiter` column (matched
-- case-insensitively); this table is the canonical, editable roster that
-- drives the per-recruiter tabs + the "Log Candidate" picker. `active=false`
-- retires a recruiter without losing their historical candidates.
create table if not exists recruiters (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text,
  active     boolean not null default true,
  sort       int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Case-insensitive uniqueness on the name so "Estefany" / "estefany" collapse.
create unique index if not exists recruiters_name_lower_idx
  on recruiters (lower(name));

create trigger recruiters_updated before update on recruiters
  for each row execute function set_updated_at();

alter table recruiters enable row level security;
drop policy if exists "open" on recruiters;
create policy "open" on recruiters for all to public
  using (true) with check (true);

-- Seed the five existing recruiters (idempotent on lower(name)).
insert into recruiters (name, sort) values
  ('Estefany', 1),
  ('Priscila', 2),
  ('Rodrigo',  3),
  ('Nathalia', 4),
  ('Leangel',  5)
on conflict (lower(name)) do nothing;

-- ---------------------------------------------------------------------------
-- 2) Client section — basic company info
-- ---------------------------------------------------------------------------
-- The clients table already carries name/city/industry/address/contact + WC
-- config. Add the missing "company info" basics so the new Client section can
-- capture a fuller record. `status` lets prospects/inactive accounts be
-- distinguished from live ones.
alter table clients
  add column if not exists phone   text,
  add column if not exists website text,
  add column if not exists status  text not null default 'active'
    check (status in ('active', 'prospect', 'inactive'));

-- ---------------------------------------------------------------------------
-- 3) Wellness / follow-up notes timeline (immutable)
-- ---------------------------------------------------------------------------
-- Append-only case-management log scoped to an employee. Every entry is
-- stamped with the author and the moment it was recorded; rows are NEVER
-- updated or deleted (immutability is enforced at the app layer — no update/
-- delete action is exposed). This is the backbone of the workplace-accident /
-- incident follow-up record. `entry_type` is intentionally a free-text label
-- (with a starter check set) so the exact taxonomy can be refined later
-- without a migration.
create table if not exists wellness_notes (
  id                    uuid primary key default gen_random_uuid(),
  employee_id           uuid not null references employees(id) on delete cascade,
  entry_type            text not null default 'note'
                          check (entry_type in (
                            'note', 'follow_up', 'wellness_check',
                            'incident', 'accident', 'return_to_work', 'other'
                          )),
  body                  text not null,
  author_name           text not null,
  author_team_member_id uuid references team_members(id) on delete set null,
  -- occurred_at is when the event happened / was recorded; defaults to now()
  -- but can be back-dated by the author for a late entry.
  occurred_at           timestamptz not null default now(),
  created_at            timestamptz not null default now()
);

create index if not exists wellness_notes_employee_idx
  on wellness_notes (employee_id, occurred_at desc);

alter table wellness_notes enable row level security;
drop policy if exists "open" on wellness_notes;
-- Read + insert are open (mirrors the app's anon-key pattern). Immutability is
-- enforced by simply never issuing UPDATE/DELETE from the app — there is no
-- edit affordance in the UI or a server action that mutates a row.
create policy "open" on wellness_notes for all to public
  using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 4) Notifications (team tagging / @mention backbone)
-- ---------------------------------------------------------------------------
-- In-app notifications. An @mention inside an onboarding task writes one row
-- for the mentioned teammate; the /notifications page renders the recipient's
-- feed. Generic `entity_type`/`entity_id`/`link_path` so the same table can
-- back mentions elsewhere later. No email/SMS transport — purely in-app.
create table if not exists notifications (
  id                       uuid primary key default gen_random_uuid(),
  recipient_team_member_id uuid references team_members(id) on delete cascade,
  recipient_name           text not null,
  actor_name               text,
  kind                     text not null default 'mention',
  body                     text not null,
  entity_type              text,
  entity_id                uuid,
  link_path                text,
  meta                     jsonb not null default '{}'::jsonb,
  read_at                  timestamptz,
  created_at               timestamptz not null default now()
);

create index if not exists notifications_recipient_idx
  on notifications (recipient_team_member_id, created_at desc);
create index if not exists notifications_recipient_name_idx
  on notifications (lower(recipient_name), created_at desc);

alter table notifications enable row level security;
drop policy if exists "open" on notifications;
create policy "open" on notifications for all to public
  using (true) with check (true);
