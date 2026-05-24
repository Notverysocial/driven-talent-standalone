-- Driven Talent — Recruiter & Referral bonus tracking
--
-- One unified `bonuses` table covering both:
--   * recruiter bonuses — paid to an internal recruiter for filling a seat
--   * referral bonuses  — paid to an existing employee who referred a hire
--
-- Both kinds share the same lifecycle (pending → approved → paid) and the
-- same payout/notes fields, so collapsing them into one table keeps the
-- list view, KPIs, and approval queue trivial. A `kind` enum discriminates,
-- and the `recruiter_name` / `referrer_employee_id` columns are filled
-- according to kind (the form/server-action enforces the right field per
-- kind; the DB just stores whatever is set).
--
-- The hired/placed employee (or pre-hire candidate) is linked via two
-- nullable FKs:
--   * employee_id    — the hired person, once they exist in employees
--   * candidate_id   — the pre-hire candidate, if bonus is logged before
--                      promotion to employee
-- At least one of {employee_id, candidate_id} should be set; we don't
-- enforce that at the DB level so a bonus can be logged before either
-- record exists (e.g. just a name in `subject_name`).
--
-- Additive only — no destructive changes to existing tables/enums.

-- ---------- enums --------------------------------------------------------

create type bonus_kind as enum (
  'recruiter',   -- paid to an internal recruiter for a filled placement
  'referral'     -- paid to an existing employee for referring a hire
);

create type bonus_status as enum (
  'pending',     -- logged, awaiting approval
  'approved',    -- approved for payout
  'paid',        -- payout disbursed
  'void'         -- cancelled / clawed back
);

-- ---------- bonuses ------------------------------------------------------

create table bonuses (
  id uuid primary key default gen_random_uuid(),
  kind bonus_kind not null,
  status bonus_status not null default 'pending',
  amount numeric(10,2) not null check (amount >= 0),

  -- Who gets paid -----------------------------------------------------
  -- For recruiter bonuses: free-text recruiter name (the recruiter is
  -- usually staff, not modeled in `employees`). For referral bonuses:
  -- a FK to the referring employee.
  recruiter_name text,
  referrer_employee_id uuid references employees(id) on delete set null,

  -- Who the bonus is *about* (the placed/referred hire) ---------------
  employee_id uuid references employees(id) on delete set null,
  candidate_id uuid references candidates(id) on delete set null,
  subject_name text,   -- fallback display name when neither FK is set
  position_id uuid references positions(id) on delete set null,
  client_id uuid references clients(id) on delete set null,

  -- Lifecycle dates ---------------------------------------------------
  earned_date date not null default current_date,    -- when the bonus was earned (placement / hire date)
  approved_at timestamptz,
  approved_by text,
  paid_at date,            -- date of payout
  payout_method text,      -- 'payroll', 'check', 'cash', etc — free text per SOP
  payout_reference text,   -- check #, payroll period, etc

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger bonuses_updated before update on bonuses
  for each row execute function set_updated_at();

create index bonuses_kind_idx                 on bonuses (kind);
create index bonuses_status_idx               on bonuses (status);
create index bonuses_earned_date_idx          on bonuses (earned_date desc);
create index bonuses_employee_idx             on bonuses (employee_id);
create index bonuses_referrer_employee_idx    on bonuses (referrer_employee_id);
create index bonuses_candidate_idx            on bonuses (candidate_id);
create index bonuses_position_idx             on bonuses (position_id);
create index bonuses_client_idx               on bonuses (client_id);

alter table bonuses enable row level security;
create policy "open" on bonuses for all to public using (true) with check (true);
