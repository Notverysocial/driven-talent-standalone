-- Driven Talent — Company / invoice settings (CR #8)
--
-- Makes the invoice letterhead, remit/footer text, and invoice formatting
-- defaults editable instead of hardcoded in the PDF route + detail page.
--
-- Single-row "settings" table. The `id boolean primary key default true
-- check (id)` trick guarantees at most one row (id can only ever be `true`),
-- so the app can always `select ... limit 1` and `update where id = true`.
--
-- Additive only. Seeds one row pre-filled with the values that were
-- previously hardcoded, so existing invoices render identically until the
-- operator edits them.

create table if not exists company_settings (
  id boolean primary key default true check (id),

  -- Letterhead identity
  company_name          text not null default 'Driven Talent',
  tagline               text default 'Workforce · Solutions',
  address               text default '2200 Mendocino Ave, Suite 4 · Santa Rosa, CA 95403',
  email                 text default 'hello@driventalent.co',
  phone                 text default '(707) 555-0144',
  ein                   text default 'EIN 88-1284621',

  -- Remit / closing paragraph on the invoice (fully editable free text)
  invoice_footer        text default 'Payment may be remitted via ACH to Mechanics Bank · Routing 121102036 · Account on file. Questions? Reply to this email and we will personally make it right.',

  -- Invoice layout / format knobs
  accent_color          text default '#B58622'
                          check (accent_color is null or accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  invoice_number_prefix text default 'DT',
  default_terms         text default 'Net 30',
  default_fee_pct       numeric(5,2) not null default 8.00,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger company_settings_updated before update on company_settings
  for each row execute function set_updated_at();

-- Seed the singleton row with the previously-hardcoded defaults.
insert into company_settings (id) values (true)
  on conflict (id) do nothing;

alter table company_settings enable row level security;
drop policy if exists "open" on company_settings;
create policy "open" on company_settings for all to public using (true) with check (true);
