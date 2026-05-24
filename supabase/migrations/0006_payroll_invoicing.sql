-- Driven Talent — Payroll → Invoice automation
--
-- Derived from the Payroll SOP and W1-2026 Invoice Spreadsheet workflow.
-- The SOP cuts one invoice per (client × department) per week (FabFitFun
-- alone produces 5+ invoices/week: IC, WH, M, FM, RC, PD). Each line item
-- in the master sheet is split into a Reg row and an OT row priced at
-- separate rates (OT bill = 1.5× the regular bill rate).
--
-- This migration:
--   1. Splits pay rate (employee cost) from bill rate (client charge) on
--      employee_assignments. The existing `hourly_rate` is the pay rate;
--      a new `bill_rate` is the rate billed to the client.
--   2. Adds department/branch dimensions to invoices so generated rows
--      can be filtered and grouped per the SOP.
--   3. Tracks each batch generation in `invoice_runs` so re-runs are
--      observable and re-runnable.
--   4. Adds an explicit `invoice_date` to payroll periods (SOP says
--      invoice date is ~4 days after period-end, but it varies).
--
-- Additive only — no destructive changes to existing tables.

-- ---------- employee_assignments: separate bill rate -----------------

-- pay rate stays in `hourly_rate`; this is what the client is charged.
-- nullable so existing rows continue to fall back to hourly_rate
-- (× client.service_fee_pct) at invoice-generation time.
alter table employee_assignments
  add column if not exists bill_rate numeric(8,2);

-- Branch / location dimension (Chino, Eagan, etc) on the assignment
-- so we can group employees onto the correct invoice for clients with
-- multiple physical locations.
alter table employee_assignments
  add column if not exists branch text;

-- ---------- invoices: department + branch ----------------------------

alter table invoices
  add column if not exists department text;

alter table invoices
  add column if not exists branch text;

-- Useful index for "all invoices for this client × department"
-- lookups during re-runs.
create index if not exists invoices_client_dept_idx
  on invoices (client_id, department, period_start);

-- ---------- payroll_periods: invoice_date ----------------------------

alter table payroll_periods
  add column if not exists invoice_date date;

-- ---------- invoice_runs: track batch generation ---------------------
-- One row per click of "Generate Invoices". Lets the UI show
-- "Last generated 12 mins ago, created 14 invoices" and tells operators
-- whether the period has been invoiced already.

create table if not exists invoice_runs (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references payroll_periods(id) on delete cascade,
  ran_at timestamptz not null default now(),
  ran_by text,
  invoices_created int not null default 0,
  line_items_created int not null default 0,
  total_billed numeric(12,2) not null default 0,
  notes text
);

create index if not exists invoice_runs_period_idx on invoice_runs (payroll_period_id);
create index if not exists invoice_runs_ran_at_idx on invoice_runs (ran_at desc);

alter table invoice_runs enable row level security;
drop policy if exists "open" on invoice_runs;
create policy "open" on invoice_runs for all to public using (true) with check (true);
