-- Driven Talent — per-employee markup rates (Rocio, 2026-06-17)
--
-- "Regarding invoicing, I have attached a file with our employee list.
--  Column K contains the markup rate for each employee. Ideally, I would
--  like to set the markup once per employee..."
--
-- The column already exists: migration 0018 added
-- employee_assignments.markup_percent when Antonio's live spreadsheet was
-- landed, but no code has ever read or written it. This migration does NOT
-- create the billing data — it makes the existing column safe to bill from
-- now that the invoicing engine reads it.
--
-- SAFETY — this migration cannot move any invoice total:
--   * It writes no rows. There is no UPDATE and no backfill anywhere below.
--     Every existing markup_percent value (all NULL today, since nothing has
--     ever written the column) is left exactly as-is, so every invoice
--     generated after this migration resolves to the same rate it would have
--     before it.
--   * invoices and invoice_line_items are not touched at all.
--   * The CHECK constraint is added NOT VALID, so it applies to future writes
--     only and cannot fail against — or rewrite — existing data.
--
-- Idempotent: safe to run more than once, and a no-op on the columns if 0018
-- is already applied (which it should be).

-- ---------- markup_percent ------------------------------------------------

-- Re-asserted from 0018 so this migration stands alone on any database where
-- 0018 was skipped. numeric(6,2): 45.00 means "bill at pay + 45%".
alter table employee_assignments
  add column if not exists markup_percent numeric(6,2);

comment on column employee_assignments.markup_percent is
  'Per-employee markup over pay rate, as a percentage (45.00 = pay + 45%). '
  'Resolution order at invoice time (src/lib/markup.ts): bill_rate (explicit '
  '$/hr) → markup_percent → clients.service_fee_pct → none (billed at cost, '
  'flagged in the UI). NULL means "not set, fall back"; 0 is a deliberate '
  'bill-at-cost choice and is honoured as such.';

-- Guard rail on the billing input. NOT VALID: enforced on every INSERT/UPDATE
-- from now on, never evaluated against rows already in the table, so applying
-- this cannot fail on legacy data or alter it.
--   * >= 0        — a negative markup would bill below our own cost.
--   * <= 1000     — 1000% is far above any real staffing markup; the ceiling
--                   catches a multiplier typed where a percentage belonged
--                   (4500 for 45), which would otherwise 45× an invoice.
alter table employee_assignments
  drop constraint if exists employee_assignments_markup_percent_range;

alter table employee_assignments
  add constraint employee_assignments_markup_percent_range
  check (markup_percent is null or (markup_percent >= 0 and markup_percent <= 1000))
  not valid;

-- Partial index: the roster and preview screens both ask "which active
-- assignments still have no markup?" to drive the fallback warnings.
create index if not exists employee_assignments_markup_unset_idx
  on employee_assignments (client_id)
  where active and markup_percent is null;
