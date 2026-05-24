# Driven Talent Ops App — Implementation Plan

Status: feature branch `feat/ops-app-rebuild`. Working module-by-module
against the Driven Talent operations team's feedback and the
**Build Specification** prepared from the team's 8-sheet Tracker
spreadsheet, Incident SOP v2.1, employee handbook, and welcome letter.

This document is the working contract for what we're building and the
order we're building it. Each module gets its own commit (or small set
of commits) and a self-contained migration. Nothing ships to
production without Antonio's review.

---

## 1. What the "Demo" Actually Is

Antonio's brief described a "functional demo dashboard" on the Working
drive. What's actually there is the agency's **operating reality**:

| File | What it is | Role in the build |
|---|---|---|
| `Driven_Talent_Tracker (1).xlsx` (8 sheets) | The team's live ops tracker — Open Positions · Applicant Tracking · Active Candidates · Onboarding · Do Not Return · Terminations · Tasks & Meetings · Safety (empty) | **The data model + workflow spec.** Every entity, field, picklist, and stage flow in the app derives from these sheets. |
| `Driven_Talent_Incident_SOP_EN.docx (1) (2).pdf` (v2.1) | Workplace Injury & Incident Response SOP, plus Forms 01–04 | Drives the Safety / Incident Case module + California compliance reminders (DWC-1 1-working-day, Cal/OSHA 8-hour). |
| `driven_talent_llc_3656_handbook_194552 (1).pdf` | CA Employee Handbook (03/19/2026) | Sick leave, meal/rest, overtime, termination, FEHA, record retention rules. |
| `Welcome_Letter_Driven_Talent .docx (1).pdf` | New-hire welcome letter | Onboarding context, employee-portal reference, sick-time summary. |
| `Driven_Talent_Build_Specification.md` (separate session) | Structured spec derived from the above | Authoritative blueprint — entity/field/flow definitions used throughout this plan. |

**There is no separate UI mockup or "demo dashboard" file.** The Tracker
is the demo: the data model and workflow it encodes are what the app
must mirror. The Build Spec is the canonical reading of it.

**Note on Payroll SOP.** The brief mentioned a Payroll SOP in the
Working folder. What's actually there is the **Incident** SOP. For
Module 5 (Payroll → Invoice), the operating procedure comes from the
existing `/payroll` module's behavior, the Build Spec, and the
report-format rules already encoded in `clients.report_format`. We'll
confirm payroll specifics with Antonio when we reach that module.

---

## 2. What's Already Shipped

The app at `Notverysocial/driven-talent-standalone` already covers a
solid foundation. Cataloged from the codebase, not the brief:

| Area | Module | Status |
|---|---|---|
| Operations | Dashboard | KPI strip, attendance incidents feed, AR card, hiring pipeline, active clients table |
| Operations | Inbox (CRM) | Web-chat conversations, message threads, assignment, realtime |
| Operations | Candidates (ATS) | Pipeline `applied → screening → interview → offer → hired → rejected`, weighted criteria scoring, hire flow that seeds onboarding |
| Operations | Employees / Roster | Multi-client assignments, score bands |
| HR | Onboarding | Estefany's 13-item checklist with status + notes per item, welcome-letter draft, auto-promote to active |
| HR | Attendance | 14-day grid, click-to-cycle 5 statuses (present/late/missed/no_show/excused) |
| Finance | Timecards | Weekly per-employee/client, 7-day JSONB shape, audit flags, status machine |
| Finance | Invoices | Per-client lines, PDF render via `@react-pdf/renderer`, overdue view |
| Finance | Payroll | Periods (`open → audited → submitted → approved → closed`), per-client/per-employee export, PEOPLEASE row export |

Stack: Next 16 (App Router, async `cookies()` / `searchParams`),
React 19, Tailwind 4 + custom design tokens (`--dt-*` in
`src/app/globals.css`), Supabase SSR + service-role client, hand-written
TS types in `src/lib/supabase/types.ts`. Server data loaders in
`src/lib/*.server.ts`, server actions in each route's `actions.ts`.

Auth is **anon-only** today: every table has a permissive RLS policy
(`for all to public using (true)`). "Every team member can add/move/delete"
in the calendar context means anyone with the anon key — which is the
team — until proper auth lands.

---

## 3. Gap Analysis (against the ops team's email)

| # | Gap | Source | Severity | Module |
|---|---|---|---|---|
| 1 | **Shared Corporate Calendar** — Birthdays, US Holidays, Social Posts, Custom Events; add/move/delete for all; color/shape coded | Email + Tracker sheet 7 (Tasks & Meetings) | **CRITICAL** | Module 1 |
| 2 | Charts & visual analytics on dashboard | Email | High | Module 2 |
| 3 | Inbound Calls log (ATS gap — no incoming candidate lost) | Email + Tracker Applicant Source picklist (`Inbound Call`) | High | Module 3 |
| 4 | Open Positions panel (open + filled/completed; richer records) | Email + Tracker sheet 1 (39 columns) | High | Module 3 |
| 5 | Sick Time tab | Email + `employees.sick_hours_balance` + `timecards.sick_hours` already in schema | Medium | Module 4 |
| 6 | LOA (Leave of Absence) tab | Email | Medium | Module 4 |
| 7 | Safety / Warnings tab — incident cases | Email + Incident SOP v2.1 + Build Spec System B | High (compliance) | Module 4 |
| 8 | Payroll → automated invoice creation in-app | Email + existing payroll module | Medium | Module 5 |

What's **not** in this gap list but exists in the Build Spec and
should be tracked: **Do Not Return** blocklist (Spec §4.5),
**Terminations** module (Spec §4.6), **website → ATS auto-upload**
integration (Spec §4.7), audit/history log on every table, RBAC, file
storage hardening, and California compliance reminders (Spec §12.4).
These are deferred until the gap-list modules are in.

---

## 4. Build Sequence

Each module = additive Supabase migration + new pages/components/server
loaders/actions + sidebar entry where appropriate. No production
deploys; Antonio reviews each module locally before merge.

### Module 1 — Shared Corporate Calendar (THIS ROUND)
Standalone Calendar page at `/calendar`. Month grid with 4 event tracks:

- **Birthdays** (employee birthdays, surfaced from `employees.birthday`)
- **US Holidays** (auto-seeded federal holidays for 2026–2027)
- **Social Media Posts** (`social_post` track — content calendar use)
- **Custom Events / Meetings** (carries fields from Tracker sheet 7: title, time, owner, collaborators, client/position, description)

Color/shape coding by track + per-person color for assignees.
Add/move/delete for any user via add-event dialog and drag-to-move.
Wired to Supabase via additive migration `0003_calendar.sql`.
Sidebar gains a "Calendar" entry under Operations.

### Module 2 — Charts & Visual Analytics on Dashboard
Replace some of the dashboard's static KPI strip and tables with
visual charts: pipeline funnel, attendance trend (14-day sparkline),
hours billed per week per client, AR aging, candidate sourcing
breakdown. Library: **Recharts** (SVG, server-render-safe, small,
matches the design's restrained aesthetic). Server loaders extend
`src/lib/dashboard.server.ts`.

### Module 3 — Recruiting Expansions
Two additions on the ATS side:

1. **Inbound Calls log** — new entity `inbound_calls` with caller name,
   phone, source, position-of-interest, taken-by, notes, and a
   "convert to applicant" action. Surfaced as its own list and a
   dashboard widget.
2. **Open Positions panel** — full Build Spec §4.1 entity
   (`open_positions` table with 39 fields). List view splits Open /
   Recurrente / On Hold / Filled / Closed; detail page with computed
   counters (candidates submitted, interviews scheduled, hires made)
   rolled up from linked candidates. Promotion of candidates already
   exists; this gives them a parent record.

### Module 4 — HR & Safety Compliance Tabs
1. **Sick Time tab** — per-employee balance, accrual ledger, usage
   pulled from `timecards.sick_hours`, manual adjustments with audit.
   Welcome letter cites "up to 5 days / 40 hours per year"; handbook
   cites accrual caps of 56 and 80 — **confirm policy with HR before
   encoding accrual rules**, ledger UI ships first.
2. **LOA (Leave of Absence) tab** — new entity `leaves_of_absence` with
   start/end, type (medical, personal, jury, bereavement, FMLA/CFRA,
   pregnancy disability), status, docs.
3. **Safety / Warnings tab** — Build Spec System B `incident_cases`
   with full Form 01 data model, document uploads, status workflow,
   SOP linking, DWC-1 / Cal/OSHA reminders. This is the biggest item
   in Module 4 and may split into its own commit.

### Module 5 — Payroll → Invoice Automation
Existing payroll module closes a period with status `closed = invoices generated`,
but the invoice-generation step is the gap. Wire payroll period
closure to:
1. Group approved timecards by `client_id`
2. Create a draft invoice per client using `clients.report_format` for
   billing shape (FabFitFun Hours Spent vs ISC Timecard vs standard)
3. Apply `service_fee_pct` and `bill_to_client_name` overrides
4. Link `invoices.payroll_period_id` and per-line `timecard_id`
5. Leave invoices in `draft` for review before send

Will confirm the operational SOP (manual review gates, sign-off,
margin display) with Antonio before coding.

### Future / deferred (not in current scope)
Do Not Return blocklist enforcement, full Terminations module
(California `Change of Relationship` + EDD + final-pay rules),
website → ATS auto-upload, RBAC + proper auth, document storage
hardening (PII), bilingual EN/ES support, audit/history log table.

---

## 5. Conventions Followed in This Build

Mirrors the existing codebase, no rewrites:

- Pages: `src/app/<module>/page.tsx`, Shell + Topbar layout.
- Server data: `src/lib/<module>.server.ts` with `import "server-only"`.
- Server actions: `src/app/<module>/actions.ts` with `"use server"` +
  `revalidatePath` after mutations.
- Client interactivity: colocated `*Client.tsx` files marked
  `"use client"`.
- Styling: existing `dt-*` classes + design tokens; no new CSS
  framework. New per-module styles added to `globals.css` in a
  clearly-labeled block.
- Types: hand-extend `src/lib/supabase/types.ts` to match each
  migration.
- Migrations: sequential `supabase/migrations/NNNN_<name>.sql`,
  **additive only**, not applied to production by Claude. Antonio
  runs them when ready.
- RLS: every new table enables RLS with the same permissive `for all
  to public` policy used elsewhere — until auth is added, the app is
  anon-key.
- Time: Pacific Time. Dates stored as `date` (US/Pacific calendar)
  or `timestamptz` (always with TZ). UI formats with
  `Intl.DateTimeFormat` in `America/Los_Angeles`.

---

## 6. Module 1 Deliverable Detail (built this round)

Below is what ships in the calendar commit.

**Database (`supabase/migrations/0003_calendar.sql`)**
- New enum `calendar_event_kind`: `birthday | holiday | social_post | custom`.
- New table `calendar_events`:
  - `id`, `kind`, `title`, `description`,
  - `event_date` (date) + optional `start_time`/`end_time` (time),
  - `all_day` (bool), `location` (text),
  - `assignee_name` (text), `client_id` (fk, nullable),
  - `employee_id` (fk, nullable — for birthdays),
  - `color_hex` (text override), `link_url` (text),
  - `created_by` (text, free-text since no auth),
  - `created_at` / `updated_at` triggered.
- Index on `(event_date)` for month queries.
- Additive column on `employees`: `birthday date` (nullable).
- Helper view/function: none — month queries done from app code.
- RLS open policy on `calendar_events`, matching existing convention.
- Seed: US federal holidays for 2026 and 2027 inserted on migration
  apply (idempotent).

**Code**
- `src/lib/calendar.ts` — client-safe helpers: track colors/shapes,
  month-grid builder, formatters (Pacific Time).
- `src/lib/calendar.server.ts` — `getMonthEvents(year, month)` and
  `getEmployees()` for assignee picker.
- `src/app/calendar/page.tsx` — server component, month resolved from
  searchParams.
- `src/app/calendar/CalendarClient.tsx` — interactive month grid,
  track filter chips, click-to-add, click-event-to-edit, drag-to-move.
- `src/app/calendar/EventDialog.tsx` — add/edit modal with track,
  date/time, title, description, assignee, color override, delete.
- `src/app/calendar/actions.ts` — `createEvent`, `updateEvent`,
  `moveEvent` (drag), `deleteEvent`.
- `src/components/Sidebar.tsx` — add "Calendar" under Operations.
- `src/app/globals.css` — `.dt-cal-*` classes for the month grid and
  event chips.

**Track styling (color + shape)**
- Birthday — soft pink `#E89BAA`, **filled circle** chip with cake glyph.
- Holiday — deep gold `#C8881C`, **outlined pill** with star.
- Social post — accent blue `#3A77B2`, **square** chip with camera.
- Custom — neutral warm `var(--dt-warm-700)`, **rounded bar** with dot.
- Assignee tint: when a custom event has an assignee, the chip's
  left edge is colored by a deterministic per-name hash (8-color
  palette) so people get a recognizable color across events.

**Out of scope for Module 1** (deferred to later modules)
- Recurrence (weekly stand-ups, repeating posts).
- iCal export / Google Calendar sync.
- Reminders / notifications.
- Per-user color preferences (no auth yet).
- Multi-day event spans across cells (events render on their start
  date; if `end_time` is set, it's shown in the chip; multi-day
  ribboning lands once recurrence does).

---

## 7. Open Items for Antonio (do not block Module 1)

These come up in the Build Spec but need a decision before later
modules ship. Listed here so they don't surprise us.

1. **Auth & RBAC.** Calendar treats "all users" as anyone on the anon
   key. Once auth lands, calendar events should carry a real
   `created_by` user_id and permissions can tighten if needed.
2. **Sick leave policy.** Welcome letter (5 days/40 hours) vs handbook
   (56/80 hour caps) need reconciliation before the Sick Time tab
   does accrual math.
3. **Tracker sheet 7 (Tasks & Meetings).** The team uses this for
   daily stand-ups, calls, submissions, follow-ups. Module 1's
   "Custom" track covers it visually; do we want a full task module
   too (Build Spec §4.8), or is calendar + the Inbox enough?
4. **Do Not Return enforcement.** The Build Spec wants the ATS
   intake to *actively check* this list. Not in current scope.
5. **Website → ATS auto-upload.** Needs an inventory of the
   driven-talent.com form fields. Out of scope until inventoried.
6. **Document storage.** When Safety/Warnings ships, PII handling
   needs a real plan (current storage policies are also open).
7. **Confirm Payroll SOP.** Brief mentioned a Payroll SOP that isn't
   in the Working folder — we proceed from the existing payroll
   module's behavior and the Build Spec.

---

*Plan version 1 — prepared on the `feat/ops-app-rebuild` branch.
Module 1 (Shared Corporate Calendar) implementation follows in this
same commit set.*
