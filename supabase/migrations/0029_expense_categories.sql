-- Driven Talent — Editable expense categories (CR #9)
--
-- `expenses.category` was a fixed Postgres enum (`expense_category`), so
-- adding or renaming a category required a schema migration + code deploy.
-- This converts it to a user-managed lookup table:
--
--   * new `expense_categories` table (slug = stable key, label = editable
--     display name, tone = badge color, sort = display order, is_active).
--   * `expenses.category` becomes text with a FK to expense_categories.slug
--     (on update cascade — renaming the slug would follow, though the UI
--     renames the *label* and leaves the slug stable).
--   * the old `expense_category` enum is dropped (nothing else references it).
--
-- "Add a category" = insert a row. "Rename" = update the label. Existing
-- expense rows keep pointing at the same slug, so history is preserved.
--
-- Seeded with the exact 13 values the enum carried, so existing data and
-- the current UI keep working unchanged.

create table if not exists expense_categories (
  id uuid primary key default gen_random_uuid(),
  slug      text unique not null,
  label     text not null,
  tone      text not null default 'warm',   -- BadgeTone: warm|gold|green|amber|red|dark
  sort      int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger expense_categories_updated before update on expense_categories
  for each row execute function set_updated_at();

create index if not exists expense_categories_sort_idx on expense_categories (sort, label);

alter table expense_categories enable row level security;
drop policy if exists "open" on expense_categories;
create policy "open" on expense_categories for all to public using (true) with check (true);

-- Seed from the old enum (slug/label/tone mirror src/lib/expenses.ts).
insert into expense_categories (slug, label, tone, sort) values
  ('rent',                  'Rent',                  'dark',  10),
  ('utilities',             'Utilities',             'warm',  20),
  ('software',              'Software',              'gold',  30),
  ('marketing',             'Marketing',             'amber', 40),
  ('insurance',             'Insurance',             'dark',  50),
  ('supplies',              'Supplies',              'warm',  60),
  ('travel',                'Travel',                'amber', 70),
  ('meals',                 'Meals',                 'warm',  80),
  ('professional_services', 'Professional Services', 'gold',  90),
  ('payroll',               'Payroll',               'dark', 100),
  ('taxes',                 'Taxes',                 'red',  110),
  ('equipment',             'Equipment',             'warm', 120),
  ('other',                 'Other',                 'warm', 130)
on conflict (slug) do nothing;

-- Convert expenses.category enum -> text, then attach the FK. Seeding above
-- guarantees every existing enum value already exists as a slug, so the FK
-- validates cleanly.
alter table expenses alter column category drop default;
alter table expenses alter column category type text using category::text;
alter table expenses alter column category set default 'other';

alter table expenses
  drop constraint if exists expenses_category_fk;
alter table expenses
  add constraint expenses_category_fk
  foreign key (category) references expense_categories (slug)
  on update cascade;

-- The enum is now unused; drop it so it can't drift from the lookup table.
drop type if exists expense_category;
