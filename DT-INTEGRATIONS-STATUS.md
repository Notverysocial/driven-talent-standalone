# Driven Talent — Integrations Status

**Owner:** Antonio · **Updated:** 2026-06-24 · **Branch:** `feat/loops-production-error-sweep`
**Build:** ✅ `npm run build` green · **Verify command:** `npm run verify:integrations`

This is the single source of truth for where every integration stands. It
supersedes the older runbook/User-Guide on integration status (the code is
ahead of those docs). Companion to `API-INTEGRATIONS-FOR-ESTEFANY.md` (the
credential-generation checklist for the vendor portals).

Legend:
- ✅ **code-complete & build-green** — nothing left to build; works the moment its inputs exist.
- 🟡 **code-ready, awaiting Antonio's key** — finished code, gated only on a value you paste.
- 🔴 **needs a decision** — a yes/no from you before any more work is worth doing.

---

## Status table

| # | Integration | Status | What's left (and where it goes) |
|---|---|---|---|
| 1 | **RingCentral** (inbound call logging) | 🟡 awaiting key | Paste `RINGCENTRAL_CLIENT_ID`, `RINGCENTRAL_CLIENT_SECRET`, `RINGCENTRAL_ENV=production` → **Vercel**. Code: OAuth + webhook subscription + 15-min call-log sync all complete. **Inbox-mirror bug fixed** (see Fixes). |
| 2 | **PandaDoc** (onboarding docs + e-sign) | 🟡 awaiting key | Paste `PANDADOC_CLIENT_ID`, `PANDADOC_CLIENT_SECRET` → **Vercel**. Then set `onboarding_template_id` in the integration's config (admin can do it on `/integrations` once connected). "Send Onboarding Doc" action is wired on the candidate page. |
| 3 | **Calendly** (scheduling) | 🟡 awaiting key | Paste `CALENDLY_CLIENT_ID`, `CALENDLY_CLIENT_SECRET` → **Vercel**. OAuth app already created (redirect URI + scopes match the code). `ensureWebhookSubscription` auto-creates the subscription + stores its signing key on connect. |
| 4 | **uAttend** (timeclock punches) | 🟡 awaiting key | Paste `UATTEND_API_KEY` in-app at `/integrations → uAttend → Connect` (or `UATTEND_API_KEY` in Vercel). Then map uAttend employee IDs → DT employees on the same page. |
| 5 | **Indeed** (job feed + apply) | ✅ works credential-free | Feed (`/api/integrations/indeed/feed`) + Apply webhook are live with **no key**. Register the two URLs in the Indeed employer portal. `INDEED_API_KEY` is an **optional** analytics add-on only. |
| 6 | **Supabase** (DB + auth) | ✅ wired (required) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — already set (app runs). Re-issue under DT-owned project at handover. |
| 7 | **Sentry** (error monitoring) | 🟡 awaiting key | No-op until `NEXT_PUBLIC_SENTRY_DSN` (+ `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` for releases) set in Vercel. Config safely no-ops when unset — optional but recommended. |
| 8 | **Vercel Blob** (legal/onboarding files) | 🟡 awaiting key | Legal-doc upload throws a clear user-facing error until `BLOB_READ_WRITE_TOKEN` is set (Vercel → Storage → create Blob store). |
| 9 | **Vercel Analytics proxy** (dashboard traffic card) | 🟡 awaiting key | Dashboard traffic card 500s until `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, `MARKETING_PROJECT_ID` set. (Marketing project id is `prj_um5kWh3IkEEATGUcS0fz94Abv259`.) |
| 10 | **Vercel Cron** (15-min sync auth) | ✅ wired | Set any random `CRON_SECRET` in Vercel; the cron route + `vercel.json` schedule are already in place. Without it the cron still runs but is unauthenticated. |
| 11 | **PEOPLEASE / PrismHR** (payroll SOR) | ✅ no integration needed | **No API** — manual portal workflow. App only stores a claims email (`NEXT_PUBLIC_PEOPLEASE_CLAIMS_EMAIL`). Nothing to build or key. |
| 12 | **Resend** (transactional email) | 🔴 decision — *recommend drop in-app* | **Not used by the standalone app.** It was wired into Build Direct, then intentionally removed in favor of the in-app `/bug-reports` queue. Email sending for `driven-talent.com` lives in the **marketing site repo**, not here. No in-app feature currently needs it. Decision: leave out of this app unless you want a specific in-app email (e.g. candidate notifications) — that would be net-new work. |
| 13 | **Stripe** (payments) | 🔴 decision — *recommend drop/confirm* | **Not present in code.** DT bills via invoices / PEOPLEASE / factoring (the app has an invoices module, no card processing). Nothing references Stripe. Confirm it's truly out of scope, or it's a net-new build — a key alone does nothing. |
| — | **E-signature backend** (Documenso/DocuSeal) | 🔴 decision | PandaDoc (#2) already covers send + e-sign. The generic e-sign layer falls back to a manual/no-op stub. Decide: **PandaDoc is the signing tool of record** (recommended — it's the one with finished OAuth code) and leave Documenso/DocuSeal unconfigured, or stand one up and set `ESIGN_PROVIDER`. |

---

## When you're back: paste these to light up the July-1 gates

All in **Vercel → project `driven-talent-standalone` → Settings → Environment Variables** unless noted.
**7 values** turn on the three OAuth providers + uAttend; Indeed needs **no key** (just URL registration).

```
# RingCentral  (creds granted Jun 13 — graduate the app to Production)
RINGCENTRAL_CLIENT_ID         = <paste>
RINGCENTRAL_CLIENT_SECRET     = <paste>
RINGCENTRAL_ENV               = production

# PandaDoc
PANDADOC_CLIENT_ID            = <paste>
PANDADOC_CLIENT_SECRET        = <paste>

# Calendly  (OAuth app "Driven Talent App" already created)
CALENDLY_CLIENT_ID            = <paste>
CALENDLY_CLIENT_SECRET        = <paste>

# uAttend  (or paste in-app: /integrations → uAttend → Connect)
UATTEND_API_KEY               = <paste>
```

Then, no key required:
- **Indeed** — in the employer portal, register the XML feed at
  `https://driven-talent-standalone.vercel.app/api/integrations/indeed/feed`
  and point Indeed Apply at
  `https://driven-talent-standalone.vercel.app/api/integrations/webhook/indeed`.
- **PandaDoc** — after connecting, set the onboarding template id on the
  PandaDoc integration card.

Recommended-but-optional infra keys (set when convenient):
```
CRON_SECRET                   = <any random string>     # authenticates the 15-min sync
BLOB_READ_WRITE_TOKEN         = <Vercel Blob store>      # enables legal-doc upload
NEXT_PUBLIC_SENTRY_DSN        = <Sentry DSN>             # turns on error monitoring
VERCEL_TOKEN / VERCEL_TEAM_ID / MARKETING_PROJECT_ID     # dashboard traffic card
```

Decisions to make (no paste — just a yes/no):
1. **Resend** — leave out of this app? (Recommended: yes; email lives in the marketing repo.)
2. **Stripe** — confirm out of scope? (Recommended: yes; DT bills via invoices/PEOPLEASE/factoring.)
3. **E-sign of record** — PandaDoc? (Recommended: yes; leave Documenso/DocuSeal unconfigured.)

---

## How to check status without exposing secrets

```bash
npm run verify:integrations
```
Read-only. Prints, per integration, whether each env var is **present** (never
the value), and — if Supabase service creds are in the environment — the live
`integrations` table status / last sync / last error for each provider. It
performs **no** OAuth sign-in and calls **no** vendor API with credentials.

Run it locally after `vercel env pull`, or it runs anywhere the Vercel env is
injected.

---

## Fixes landed on this branch

- **RingCentral Inbox mirror was silently failing.** `mirrorCallToInbox`
  inserts a conversation with `channel: "phone"`, but `'phone'` was never a
  member of the `message_channel` enum (`web_chat, sms, email, application`).
  The insert failed, `.select().single()` returned null, and the function
  bailed before writing the message — so a matched inbound call was logged to
  `inbound_calls` but **never surfaced as a readable Inbox conversation**.
  Same class of bug as the earlier `sender_type='system'→'bot'` fix.
  **Migration `0032_message_channel_phone.sql`** adds `'phone'` to the enum.
  ⚠️ This migration must be applied to the DB (it ships on the branch; it does
  not auto-apply to prod).

- **Added `npm run verify:integrations`** (`scripts/verify-integrations.mjs`) —
  the safe connection-verify command the integrations subsystem previously
  lacked.

## What's still gated on Antonio (nothing I can do without crossing a hard limit)

- Pasting the 7 OAuth/API-key values above into Vercel.
- Registering the Indeed feed/apply URLs + graduating the RingCentral app to Production.
- The three drop/confirm decisions (Resend, Stripe, e-sign of record).
- Applying migration `0032` to the database.
- Deploying the branch (build is green; awaiting your approval to merge/deploy).

---

## Payroll / Invoice / Report Engine (Rocio call) — branch `feat/payroll-invoice-engine`

Core principle: **everything is built from the time card; hours entered once propagate to reports, invoices, the roster, the audit view, and PEO export.** Built against the documented uAttend API contract using a mock adapter so connecting the live key is a **config step, not a rewrite**. Migration **`0035_payroll_report_engine.sql`** (additive, idempotent) — must be applied to the DB before deploy.

### uAttend (WorkwellTech) data adapter — `src/lib/uattend/`
- Documented contract: base **`https://api.workwelltech.com`**, auth header **`x-api-key`**, endpoints **`/employee`**, **`/timecards`**, **`/reports/punch`**.
- `LiveUattendAdapter` (calls the API) and `MockUattendAdapter` (realistic seed data through the **same normalizers**). `resolveUattendAdapter({apiKey})` returns live when a key is present, else mock — the single config switch. The key reuses the existing `/integrations → uAttend` row (`access_token`).
- `importUattendTimecards()` maps the adapter feed onto the canonical DB time cards (creating employees/assignments as needed); `reconcileRosterFromUattend()` drives roster auto add/remove.

> ⚠️ **uAttend data-shape ASSUMPTIONS to confirm against the real API** (encoded in `src/lib/uattend/contract.ts`; a mismatch is a one-line normalizer fix, nothing downstream changes):
> - `GET /employee` → `[{ employeeId, firstName, lastName, email, department, payRate, active, badge, clientCode }]`
> - `GET /timecards?startDate&endDate` → `[{ employeeId, weekStart, department, clientCode, days:[{date, regular, overtime, holiday, in, out}] }]`
> - `GET /reports/punch?startDate&endDate` → `[{ employeeId, date, punchIn, punchOut, department, hours }]`
> - Auth header is literally `x-api-key`. The normalizers also accept snake_case + common alternate names, and unwrap `{data}` / `{employees}` / `{timecards}` / `{punches}` envelopes or bare arrays.
> - `clientCode` is assumed to map to a **DT client slug**; employees are matched to DT by **email**. Confirm uAttend exposes a client/location code we can map, and that emails line up — otherwise we wire an explicit ID map on `/integrations`.

### Shipped
1. **Customizable per-client report builder** (`/reports`) — template catalog (`hours_spent` system report = each employee × each day matrix, `timecard_daily`, `standard_weekly`), per-client selection via `clients.report_template_key`. CSV + PDF export.
2. **Invoice auto-generation now idempotent** — `upsertInvoicesForPeriod` reuses draft invoices in place from current hours (stable numbers), collapses duplicates, removes stale drafts, never touches sent/paid invoices. "Refresh Draft Invoices" + "Refresh Invoices from Hours" actions. Still review/download/edit — **no auto-send, no PandaDoc**.
3. **Roster auto add/remove** (`/roster` → Sync from uAttend) — new hires added, terminations retired; logged to `roster_sync_runs`.
4. **Audit / verification view** (`/reconciliation`, now real) — per-employee time card ↔ invoice ↔ payroll hours, the **deduction = zero** check, explicit sign-off saved to `period_verifications`.
5. **PEO hours-by-department CSV** — `/payroll/[periodId]/export?format=peo_department` (PrismHR-friendly).

Verified: `tsc` clean · `next build` green · Playwright **25 passed / 8 skipped / 0 failed** (skips are the pre-existing data-dependent specs; new pure specs cover the uAttend adapter + report engine). Committed on the branch — **not deployed**.
