# Driven Talent — Onboarding Dashboard Foundation

**Owner:** Antonio · **Updated:** 2026-06-24 · **Branch:** `feat/onboarding-dashboard-foundation`
**Build:** ✅ `npm run build` green · **Source:** 2026-06-24 Estefany meeting backlog → DT "Website + App Build" list (`901714506504`)

This is the status doc for the foundational onboarding-tracker features. It is an
increment — it ships the additive, credential-free, decision-free pieces of the
backlog. The status-transition + collaboration features are a planned follow-up
(see "What's left" below).

> ⚠️ **Migration `0033_onboarding_dashboard_foundation.sql` must be applied to the
> database.** It ships on this branch and does **not** auto-apply to prod (same
> as the integrations migrations). Until applied, the new client-config card, the
> workers-comp table, the PEOPLEASE forms panel, and the language selector will
> 500 because their columns/tables don't exist yet. The migration is additive +
> idempotent (safe to re-run). It is numbered **0033** on purpose: `main` ends at
> 0031 and the parallel `feat/integrations-completion` branch owns `0032`, so this
> avoids a filename collision when both land.

---

## What shipped on this branch

| # | Feature | ClickUp task | Where |
|---|---------|--------------|-------|
| 1 | **Client section/profile config** — per-client account manager ("who's the charge") + the client's default workers-comp code/class + WC notes, editable inline | `86e20w8qy` | `/clients/[slug]` → "Client Configuration" card |
| 2 | **Workers-comp code mapping per client × position** — add/update/remove position-specific WC code/class/description; falls back to the client default | `86e20w8tq` | `/clients/[slug]` → "Workers-Comp Codes by Position" table |
| 3 | **Language preference (EN/ES → doc language)** on the employee + applicant record; carried forward candidate → employee at hire | `86e20w8yz` | `/onboarding/[employeeId]` general-info card + `/candidates/[id]` contact card |
| 4 | **PEOPLEASE forms tracker** (W-2/W-4, I-9, general info, direct deposit, etc.) with per-employee completion status; self-heals the forms packet on first view | `86e20w8v9` | `/onboarding/[employeeId]` → "PEOPLEASE Forms" panel |
| 5 | **More applicant-tracking filters** — added Source, Position, City, and Min-experience filters alongside the existing search/month/day/status | `86e20w8zt` | `/applications` toolbar |

### Already implemented before this branch (verified, not rebuilt)

- **PandaDoc + "add to the clock" (uAttend) as onboarding steps** (`86e20w8xe`) — the
  13-item onboarding template already includes `welcome_pandadocs` (e-sign request),
  `uattend_register`, `clock_setup`, and `peo_uattend`. No new work needed; extend
  the template in `src/lib/onboarding.ts` if the step list changes.
- **Termination flow reason-capture (rehire/DNR)** (`86e20w991`) — `processSeparation`
  in `src/app/team/actions.ts` already captures separation reason + eligibility
  (`eligible` / `conditional` / `do_not_return`) and flips employee status. The
  `/team/terminated` view splits by eligibility. Extend the reason/eligibility enums
  if Estefany wants more granularity.

---

## Schema (migration 0033)

- `clients`: + `workers_comp_code`, `workers_comp_class`, `account_manager`, `workers_comp_notes`
- `client_workers_comp_codes` (new): `(client_id, position)` unique → `wc_code`, `wc_class`, `description`
- `employees`: + `language_pref` (`en`|`es`, default `en`)
- `candidates`: + `language_pref` (`en`|`es`, default `en`)
- `employee_peoplease_forms` (new): `(employee_id, form_key)` unique → `status` (`pending`|`in_progress`|`complete`|`na`), `completed_on`, `notes`

The PEOPLEASE forms packet is defined in `src/lib/peoplease-forms.ts` (`PEOPLEASE_FORMS`);
rows are materialized per-employee on demand, mirroring the onboarding-checklist self-heal.

---

## What's left (planned follow-up increment — NOT on this branch)

These are the status-transition + collaboration features from the same backlog.
They change existing flows (employee status, promotion gate), so they're a deliberate
second PR rather than bundled here:

- **Approval → Active flow** (`86e20w97h`)
- **Mark Active while steps incomplete** — online + offline checklist (`86e20w960`)
- **Notes / wellness log** with author + timestamp (`86e20w9a3`)
- **@mention / assign follow-ups** to teammates (`86e20w9bp`)

**Skipped — blocked on Estefany's input** (per the brief):
- Full candidate field list
- Onboarding-letter template content

---

## Hard limits respected

- No secrets/keys set. Nothing deployed to prod; nothing merged to main.
- Branch + PR only; `npm run build` green.
- Existing features extended, not duplicated (EN/ES UI i18n, Terminated/DNR view,
  applicant filters, onboarding checklist all preserved).
