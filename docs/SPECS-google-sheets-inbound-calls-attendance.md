# Three specs (not yet built) — written to spec, not to code

Prepared during the ATS build session of 2026-07-18. Each item below is
grounded in the current codebase. These are **specs only** — nothing here was
built. Each says what is required and what is needed from Antonio to proceed.

---

## 1. Google Sheets integration — card 5274415a

### Current state
No Google integration exists. The integration registry
(`src/lib/integrations/types.ts`) has exactly six providers: ringcentral,
indeed, uattend, pandadoc, calendly, prismhr. There is no Google auth, no
Sheets client, and no sync job.

### What is required
- **Decide the direction.** Two very different builds share this card name:
  1. **Export / one-way push** — write a DT list (candidates, roster, payroll)
     out to a Google Sheet on a schedule or button. Simpler, no ongoing merge
     logic.
  2. **Two-way sync** — DT and a Sheet stay mirrored, with conflict handling.
     Much larger; needs a row-identity key and a change-reconciliation loop.
- **A new provider** `google_sheets` added to the integration registry, plus an
  API surface (`/api/integrations/google-sheets/...`) following the pattern the
  other five providers use (connect, sync, disconnect, status badge on
  `/integrations`).
- **Auth.** Google requires OAuth 2.0 with the `spreadsheets` scope, or a
  service-account JSON key shared onto the target sheet. Service account is far
  simpler for a headless sync (no per-user consent screen) and is the
  recommended default.
- **A field map** — which DT columns map to which sheet columns, and which
  sheet/tab is the target.

### What is needed from Antonio
1. **Which direction** — export-only (recommended first step) or full two-way
   sync?
2. **Which data** — candidates, active roster, payroll, or a specific existing
   spreadsheet the team already keeps by hand?
3. **The actual Google Sheet** (link) and permission to connect a
   service-account email to it, OR confirmation to set up OAuth.
4. Whether this replaces a manual sheet the team maintains today (if so, share
   it so the column map matches exactly).

### Rough size
Export-only: small (a few days). Two-way sync: large (own project).
Recommendation: ship export-only first, evaluate before committing to two-way.

---

## 2. Inbound call management — card ee503e06

### Current state
This is **already substantially built** and is the closest to done of the three.
- There is a full **Calls** module (`src/app/calls`) with a filterable,
  status-tracked list of inbound calls (search, month, position, and status
  filters), per-call rows with a follow-up status lifecycle, and a manual
  "log a call" action.
- The **RingCentral** integration is coded end-to-end: a telephony webhook that
  inserts inbound calls, a 15-minute call-log poll sync, recording URL +
  voicemail-transcription capture, and an upsert keyed on the RingCentral
  session id (`inbound_calls` schema, migration 0024). It is **gated only on
  credentials** — no live keys are set yet.

### What is required (to turn "built but dormant" into "managed")
- **Turn RingCentral live** — set `RINGCENTRAL_CLIENT_ID` / `SECRET` (and
  complete the OAuth connect on `/integrations`) so real calls flow in
  automatically instead of being logged by hand.
- **Define what "management" means beyond logging.** Likely asks: assign a call
  to a recruiter, convert a call directly into a candidate/intake, SLA/aging on
  un-returned calls, and a "my calls to return" queue. These are additive to the
  existing list.
- **Missed-call / voicemail routing** — who owns an unassigned inbound call, and
  how it gets picked up.

### What is needed from Antonio
1. **RingCentral credentials** (or confirmation to use a different phone
   provider) — this is the single unlock that makes calls populate automatically.
2. A short description of the **desired call workflow**: once a call comes in,
   who should it route to, and what are the steps to "close" it?
3. Whether an inbound call should be **one-click convertible into a candidate**
   (recommended — it reuses the existing intake-to-candidate flow).

### Rough size
Small-to-medium — most of the engine exists. The work is credentials + a thin
assignment/queue layer on top, not a new module.

---

## 3. Attendance interface improvement — card 76c70d69

### Current state
An **Attendance** module exists (`src/app/attendance`). It shows attendance
**exceptions** (issues) over a rolling 60-day window, filterable by client, with
a CSV export. It is exception-focused — it surfaces problems rather than showing
a full daily attendance grid.

### What is required
The card says "improvement" without specifics, so the first requirement is to
**pin down the pain point**. Candidate improvements, any of which are feasible on
the current data:
- A **daily grid view** (employees x days, present/absent/late) in addition to
  the exceptions list.
- **Per-employee attendance history** and a reliability signal that feeds the
  candidate/employee score.
- **Client-facing attendance summary** for the weekly report.
- Tighter tie-in with the **uAttend punch feed** so exceptions are derived from
  real clock data automatically (the uAttend integration exists but runs in mock
  mode until its live key is set).
- Faster filtering / a default view that matches how the team actually triages
  each morning.

### What is needed from Antonio
1. **What specifically is wrong with the current attendance screen** — is it
   missing a daily grid, too slow to scan, missing history, or not tied to real
   clock data?
2. Who uses it and **what decision they are trying to make** when they open it
   (chasing no-shows, billing clients, coaching employees?).
3. Whether the **uAttend live key** can be set — several of the strongest
   improvements depend on real punch data flowing in instead of manual entry.

### Rough size
Unknown until the pain point is named. A daily-grid view is medium; a full
uAttend-driven rebuild is larger. Recommend a 10-minute conversation before any
build.

---

### One-line summary for each
- **Google Sheets:** not built — needs direction (export vs sync), the target
  sheet, and auth choice.
- **Inbound calls:** mostly built and dormant — needs RingCentral credentials and
  a definition of the call-handling workflow.
- **Attendance:** exists as an exceptions view — needs the specific pain point
  named (and ideally the uAttend live key) before building.
