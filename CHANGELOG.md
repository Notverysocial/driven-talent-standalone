# Changelog — Driven Talent

Tracks the major shipped work, anchored to the DT ops team's spec
(Rocio · recruitment, Estefany · HR/Onboarding, Leangel · ops support).

---

## 2026-05-07 — Sidebar regrouping (`bb2a530`)

Reorganized the sidebar to match how Roxanna's team thinks about the work:

- **Operations** — Dashboard · Candidates · Employees
- **HR** — Onboarding · Attendance
- **Finance** — Timecards · Invoices · Payroll

Dropped the legacy Workspace / People Ops / Insights groupings plus the
Reports/Clients placeholder links that just bounced back to /dashboard.
The /reconciliation route stays in the codebase but is no longer
surfaced in the nav.

---

## 2026-05-04 — Ops workflow: HR / Onboarding / Recruitment ATS / Payroll (`157a339`)

The big one. Brings the app in line with the operator playbook
delivered by the DT team. Three modules, one schema migration.

### Migration `0001_ops_workflow.sql`

- Candidate status enum migrated to `applied / screening / interview /
  offer / hired / rejected` (was `new / screening / interview / placed /
  inactive`)
- New `onboarding_status` enum (`not_started / in_progress / done /
  na`); replaces the boolean `done` column on
  `onboarding_checklist_items` and adds per-item `notes`
- New columns:
  - `employees.recruiter`, `employees.onboarding_in_charge`,
    `employees.sick_hours_balance`
  - `candidates.recruiter`
  - `timecards.sick_hours`, `timecards.flags` (jsonb),
    `timecards.payroll_period_id`; `total_hours` generated column
    refreshed to include sick
  - `invoices.bill_to_client_name`, `invoices.payroll_period_id`
  - `invoice_line_items.employee_cost` (margin %)
  - `clients.report_format` (standard / hours_spent / timecard) — drives
    FabFitFun vs ISC export
- New tables:
  - `welcome_letter_drafts` — one persisted draft per employee
  - `payroll_periods` + `payroll_period_status` enum

### Seed updates

- FabFitFun + ISC clients added (with their report formats)
- Rocio / Leangel / Estefany populated as recruiters and
  onboarding-in-charge across the seed roster
- Three sample payroll periods (one closed, one audited, one open)
- Sample timecard with a `missed_punch` flag for audit demo
- Estefany's 13-item template replaces the generic 15-step checklist
  for new hires

### HR / Onboarding (Estefany's spec — highest priority)

`/onboarding/[employeeId]` rebuilt around the 13 items:

1. Employee personal information received
2. Welcome letter sent by email
3. Welcome letter via PandaDocs
4. Agreement and Expectations document signed
5. Orientation scheduled
6. Copy of agreements + orientation sent to employee
7. Background check completed
8. Badge ID issued
9. Clock setup
10. UAttend registration
11. PEO ID assigned in UAttend
12. Sexual harassment training completed
13. Active employee folder created

Each row has a status dropdown (Not Started / In Progress / Done / N/A)
plus a notes textarea. Progress bar is `done / (total − N/A)`.

The General Info card up top surfaces the operator playbook fields:
full_name, phone, email, company, position, rate, start_date,
recruiter, onboarding_in_charge.

The Welcome Letter generator builds a draft from employee + assignment
data, lets the operator edit in a textarea, persists the draft, and a
Mark Sent button flips item #2 to Done in one click.

Self-heal: legacy employees missing the new template get all 13 items
materialized lazily on first view. Auto-promote onboarding → active
when every relevant item is `done` or `na`.

### Recruitment

- Pipeline now matches the spec: Applied → Screening → Interview →
  Offer → Hired → Rejected
- Recruiter field on candidate forms + detail
- Hire flow creates an employee + seeds the 13-item onboarding
  template + redirects to /onboarding/[employeeId]

### Payroll

- `/payroll` — current period card, recent periods table with
  hours/billable/flags rollups, new-period form
- `/payroll/[periodId]` — KPI strip
  (employees / reg / OT / sick / flags / billable), per-client
  breakdown with format-aware export buttons, per-employee breakdown
  shaped for PEOPLEASE entry, audit table with computed flags
- State machine: `open → audited → submitted → approved → closed`
  (closed = invoices generated)
- Audit recomputes flags via `computeFlags()` (looks for missed
  punches) and links timecards to the period
- `/payroll/[periodId]/export?format=peoplease|client&client=<id>` —
  PEOPLEASE row per employee, FabFitFun Hours Spent Report, or ISC
  Timecard Report, picked from `clients.report_format`
- Sequential invoice numbering preserved; one invoice per client when
  generating from a period

### Sidebar

Payroll link added to Operations section (later regrouped — see above).

---

## 2026-05-04 — Migration fix (`171e6cb`)

`create or replace view invoices_with_overdue` failed once invoices had
new columns — `i.*` changed shape and Postgres refused to rebind column
positions. Replaced with `drop view if exists ... cascade; create
view ...`.

---

## Earlier ground floor

The 7-feature build (Candidates, Roster, Timecards, Invoices,
Attendance, Onboarding, Dashboard) shipped across commits
`65f4eac` → `2228352`. See `git log` for per-commit detail.
