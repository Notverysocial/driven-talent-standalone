-- Driven Talent — Reimbursements + Expenses
--
-- Adds storage for:
--   1. Employee reimbursement requests (submit → approved → paid lifecycle).
--   2. Business expenses (categorized, with vendor + receipt reference).
--
-- Additive only — no destructive changes to existing tables.
-- RLS policies follow the existing "open to public" convention used by
-- migrations 0003-0006; auth will be tightened in a later milestone.

-- ---------- enums --------------------------------------------------------

create type reimbursement_status as enum (
  'submitted', 'approved', 'rejected', 'paid'
);

create type reimbursement_category as enum (
  'mileage', 'meals', 'travel', 'supplies', 'equipment',
  'training', 'phone', 'uniform', 'other'
);

create type expense_category as enum (
  'rent', 'utilities', 'software', 'marketing', 'insurance',
  'supplies', 'travel', 'meals', 'professional_services',
  'payroll', 'taxes', 'equipment', 'other'
);

create type expense_payment_method as enum (
  'check', 'ach', 'card', 'cash', 'payroll', 'wire', 'other'
);

-- ---------- reimbursement_requests --------------------------------------
-- One row per submitted reimbursement. The lifecycle is:
--   submitted → approved → paid    (happy path)
--   submitted → rejected           (denied)
-- approved_at / paid_at / rejected_at timestamps record state transitions.

create table reimbursement_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  category reimbursement_category not null default 'other',
  description text not null,
  expense_date date not null,                       -- when expense was incurred
  submitted_at timestamptz not null default now(),
  status reimbursement_status not null default 'submitted',
  receipt_path text,                                -- storage path / file ref
  receipt_url text,                                 -- external URL alt
  payment_method expense_payment_method,            -- set when paid
  approved_by text,
  approved_at timestamptz,
  rejected_reason text,
  rejected_at timestamptz,
  paid_at timestamptz,
  paid_reference text,                              -- check #, ACH trace, etc
  notes text,
  client_id uuid references clients(id) on delete set null,  -- if billable to client
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger reimbursement_requests_updated before update on reimbursement_requests
  for each row execute function set_updated_at();
create index reimbursement_requests_employee_idx on reimbursement_requests (employee_id);
create index reimbursement_requests_status_idx on reimbursement_requests (status);
create index reimbursement_requests_expense_date_idx on reimbursement_requests (expense_date);
create index reimbursement_requests_submitted_idx on reimbursement_requests (submitted_at desc);

alter table reimbursement_requests enable row level security;
create policy "open" on reimbursement_requests for all to public using (true) with check (true);

-- ---------- expenses -----------------------------------------------------
-- Business expense ledger. Each row is one logged outlay (vendor invoice,
-- card charge, recurring subscription, etc). Drives the expense report and
-- ties optionally to a reimbursement_request (when the expense was paid
-- back to an employee) or a client (when pass-through billable).

create table expenses (
  id uuid primary key default gen_random_uuid(),
  category expense_category not null default 'other',
  amount numeric(12,2) not null check (amount >= 0),
  expense_date date not null,
  vendor text,
  description text,
  payment_method expense_payment_method,
  receipt_path text,
  receipt_url text,
  client_id uuid references clients(id) on delete set null,
  reimbursement_id uuid references reimbursement_requests(id) on delete set null,
  reimbursable boolean not null default false,     -- billable to a client
  reference text,                                  -- invoice #, check #, etc
  notes text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger expenses_updated before update on expenses
  for each row execute function set_updated_at();
create index expenses_category_idx on expenses (category);
create index expenses_expense_date_idx on expenses (expense_date desc);
create index expenses_client_idx on expenses (client_id);
create index expenses_reimbursement_idx on expenses (reimbursement_id);

alter table expenses enable row level security;
create policy "open" on expenses for all to public using (true) with check (true);
