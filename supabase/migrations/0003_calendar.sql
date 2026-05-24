-- Driven Talent — shared corporate calendar
--
-- Adds a single shared calendar surface for the team. Four event tracks:
--   birthday     — pulled from employees.birthday (this migration adds the column);
--                   one calendar_events row per employee birthday (entered when needed)
--   holiday      — US federal holidays; seeded for 2026 + 2027 in this migration
--   social_post  — content/social-media schedule
--   custom       — meetings, calls, interviews, internal events
--                   (carries the fields the team uses in Tracker sheet 7)
--
-- Anyone with the anon key can add/move/delete (matches the rest of the app's
-- no-auth posture; the existing "open" RLS policy is reused here).

-- ---------- enum --------------------------------------------------------

create type calendar_event_kind as enum (
  'birthday', 'holiday', 'social_post', 'custom'
);

-- ---------- employees.birthday -----------------------------------------
-- Additive — nullable date so existing rows are untouched.

alter table employees
  add column if not exists birthday date;

-- ---------- calendar_events --------------------------------------------

create table calendar_events (
  id uuid primary key default gen_random_uuid(),

  kind calendar_event_kind not null,
  title text not null,
  description text,

  event_date date not null,                      -- the day the event lives on
  start_time time,                               -- optional start time (null + all_day=true = all-day)
  end_time time,                                 -- optional end time
  all_day boolean not null default true,

  location text,
  link_url text,                                 -- e.g. zoom link, social post draft

  -- Who it belongs to / is about.
  assignee_name text,                            -- free-text owner ("Rocio", "All Recruiters")
  employee_id uuid references employees(id) on delete cascade,   -- for birthdays
  client_id uuid references clients(id) on delete set null,

  -- Visual override (when set, beats the per-kind default color)
  color_hex text check (color_hex is null or color_hex ~ '^#[0-9A-Fa-f]{6}$'),

  -- Bookkeeping
  created_by text,                               -- free-text until auth lands
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger calendar_events_updated before update on calendar_events
  for each row execute function set_updated_at();

create index calendar_events_date_idx on calendar_events (event_date);
create index calendar_events_kind_idx on calendar_events (kind);
create index calendar_events_employee_idx on calendar_events (employee_id) where employee_id is not null;
create index calendar_events_client_idx on calendar_events (client_id) where client_id is not null;

-- ---------- RLS ---------------------------------------------------------
-- Match the existing convention: open policy for the anon key. When auth
-- lands, swap `to public` for `to authenticated` and tighten per-user.

alter table calendar_events enable row level security;
create policy "open" on calendar_events for all to public using (true) with check (true);

-- ---------- Seed: US federal holidays 2026 + 2027 ----------------------
-- Idempotent — the `not exists` guards each insert by (kind, event_date, title)
-- so re-running the migration does not duplicate.

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('2026-01-01'::date, 'New Year''s Day'),
      ('2026-01-19'::date, 'Martin Luther King Jr. Day'),
      ('2026-02-16'::date, 'Presidents'' Day'),
      ('2026-05-25'::date, 'Memorial Day'),
      ('2026-06-19'::date, 'Juneteenth'),
      ('2026-07-03'::date, 'Independence Day (observed)'),
      ('2026-07-04'::date, 'Independence Day'),
      ('2026-09-07'::date, 'Labor Day'),
      ('2026-10-12'::date, 'Columbus Day'),
      ('2026-11-11'::date, 'Veterans Day'),
      ('2026-11-26'::date, 'Thanksgiving Day'),
      ('2026-12-25'::date, 'Christmas Day'),

      ('2027-01-01'::date, 'New Year''s Day'),
      ('2027-01-18'::date, 'Martin Luther King Jr. Day'),
      ('2027-02-15'::date, 'Presidents'' Day'),
      ('2027-05-31'::date, 'Memorial Day'),
      ('2027-06-18'::date, 'Juneteenth (observed)'),
      ('2027-06-19'::date, 'Juneteenth'),
      ('2027-07-05'::date, 'Independence Day (observed)'),
      ('2027-07-04'::date, 'Independence Day'),
      ('2027-09-06'::date, 'Labor Day'),
      ('2027-10-11'::date, 'Columbus Day'),
      ('2027-11-11'::date, 'Veterans Day'),
      ('2027-11-25'::date, 'Thanksgiving Day'),
      ('2027-12-24'::date, 'Christmas Day (observed)'),
      ('2027-12-25'::date, 'Christmas Day')
    ) as h(event_date, title)
  loop
    if not exists (
      select 1 from calendar_events
      where kind = 'holiday'
        and event_date = r.event_date
        and title = r.title
    ) then
      insert into calendar_events (kind, title, event_date, all_day, created_by)
      values ('holiday', r.title, r.event_date, true, 'system');
    end if;
  end loop;
end $$;
