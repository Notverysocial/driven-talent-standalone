# Driven Talent — API / Integration Checklist for Estefany

**Prepared:** 2026-06-24 · **Deadline to wire:** July 1, 2026
**Purpose:** Estefany logs into the company's vendor accounts and **generates the API keys / OAuth credentials** the app needs. This is the complete, prioritized list.

> **How the app consumes credentials:** Almost everything is set as **Environment Variables in the Vercel project `driven-talent-standalone`** (Settings → Environment Variables). Two providers (Indeed, uAttend) also accept a key **pasted directly into the in-app `/integrations` admin page**. Estefany does **not** touch code — she logs into vendor portals, generates keys, and hands them over to paste into Vercel.

> **One value you'll paste into EVERY OAuth dev portal** — the app's production URL is hardcoded as:
> `https://driven-talent-standalone.vercel.app`
> The OAuth **Redirect/Callback URI** and **Webhook URL** for each provider are built from that exact host. They must match character-for-character in the dev portal, or the connection silently fails. (If the app's real production domain is different, tell the dev team first — these are hardcoded in the provider files.)

---

## ⚠️ Reconciliation note for Antonio (read first)

1. **The code is ahead of the runbook.** The older DT runbook/User-Guide say e-signature, Indeed, and telephony are "manual / not wired." That's **out of date.** In this codebase, RingCentral, PandaDoc, Calendly, Indeed, and uAttend are **fully coded and live** — they only need credentials. That's the whole point of this meeting.
2. **"Estefany" isn't named in any DT doc.** The runbook names **Rocio Aponza** (Branch Manager) and **Yenitza** (Operations) as the account owners. The vendor logins Estefany needs (PEOPLEASE, uAttend, Indeed employer account) are most likely held by DT ops — **confirm she has access to those accounts before the meeting**, or she'll be blocked at login.
3. **Two integrations are in the migration plan but NOT in this codebase yet:** **Resend** (email) and **Stripe** (payments). If those are in scope for July 1, they need to be *built*, not just keyed. See "Not built" section.
4. **E-signature is ambiguous.** The runbook says **PandaDoc**; the code implements PandaDoc (OAuth, for sending/generating docs) **and** a separate generic e-sign layer (`Documenso`/`DocuSeal`). Decide which is the signing tool of record before generating keys — see item 2 and the e-sign section.

---

# 🔴 PART 1 — GATES JULY 1: Estefany must generate these credentials

These have **working code waiting on credentials**. Nothing else is required to turn them on.

### 1. RingCentral — inbound call logging & telephony (OAuth)
- **What it does:** Logs inbound calls into the app's Inbox; subscribes to call lifecycle events; 15-min call-log sync.
- **Status:** 🟡 Code ready, needs credentials.
- **Estefany's task:** Log into the **RingCentral Developer Console** → https://developers.ringcentral.com → create (or open) an **app** of type *Server/Web — Auth Code grant*. Generate **Client ID** + **Client Secret**.
  - **Redirect URI to register:** `https://driven-talent-standalone.vercel.app/api/integrations/oauth/ringcentral/callback`
  - **Webhook URL (outbound, for the app's subscription):** `https://driven-talent-standalone.vercel.app/api/integrations/webhook/ringcentral`
  - **OAuth scopes to enable on the app:** `ReadCallLog`, `ReadCallRecording`, `ReadAccounts`, `ReadContacts`, `Webhooks`
  - **Note:** App must be **graduated to Production** (sandbox uses a different host). The account must be the DT RingCentral account that actually receives the calls.
- **Env vars:** `RINGCENTRAL_CLIENT_ID`, `RINGCENTRAL_CLIENT_SECRET`, `RINGCENTRAL_ENV=production` → set in Vercel.

### 2. PandaDoc — onboarding document generation & e-signature (OAuth)
- **What it does:** Creates/sends onboarding docs from templates; receives signed/declined webhooks back into the app.
- **Status:** 🟡 Code ready, needs credentials.
- **Estefany's task:** Log into **PandaDoc** → https://app.pandadoc.com → Settings → **API / Integrations → OAuth 2.0 apps** → create an app. Generate **Client ID** + **Client Secret**. Grant **`read + write`** scope.
  - **Redirect URI to register:** `https://driven-talent-standalone.vercel.app/api/integrations/oauth/pandadoc/callback`
  - **Webhook URL:** `https://driven-talent-standalone.vercel.app/api/integrations/webhook/pandadoc`
- **Env vars:** `PANDADOC_CLIENT_ID`, `PANDADOC_CLIENT_SECRET` → set in Vercel.

### 3. Calendly — scheduling widget & booking events (OAuth)
- **What it does:** Embeds the booking widget on the public `/contact` page; logs bookings/cancellations into the Inbox.
- **Status:** 🟡 Code ready, needs credentials. (Requires a **Calendly paid/Standard+** plan for API/webhook access.)
- **Estefany's task:** Log into **Calendly** → https://developer.calendly.com → **My Apps → Create** an OAuth app. Generate **Client ID** + **Client Secret**.
  - **Redirect URI to register:** `https://driven-talent-standalone.vercel.app/api/integrations/oauth/calendly/callback`
  - **Webhook URL:** `https://driven-talent-standalone.vercel.app/api/integrations/webhook/calendly`
- **Env vars:** `CALENDLY_CLIENT_ID`, `CALENDLY_CLIENT_SECRET` → set in Vercel.

### 4. uAttend — timeclock punch sync (API key)
- **What it does:** Pulls employee timeclock punches every 15 min into the app's timecards.
- **Status:** 🟡 Code ready, needs credentials.
- **Estefany's task:** Log into the **DT uAttend account** (https://www.trackmytime.com / uAttend portal) → **Account/Company settings → API access** → generate/copy the **API key/token**. (If API access isn't visible on the plan, uAttend support may need to enable it — flag early.)
- **How to apply:** Paste the key into the app at **`/integrations` → uAttend → Connect** (stored in DB), **or** set env var `UATTEND_API_KEY` in Vercel as a fallback.

### 5. Indeed — job feed & applicant intake (API key, optional + feed registration)
- **What it does:** Publishes open jobs as an XML feed Indeed crawls; receives Indeed-Apply applicants as webhooks into the app. An Employer API key is **optional** (adds analytics; feed + apply work without it).
- **Status:** 🟡 Code ready. Feed/apply works credential-free; Employer API key is the optional add-on.
- **Estefany's task:**
  1. In the **DT Indeed Employer account** (https://employers.indeed.com), register the **XML feed source / Disposition Sync** pointing Indeed at:
     `https://driven-talent-standalone.vercel.app/api/integrations/indeed/feed`
  2. Configure **Indeed Apply** to deliver applicants to:
     `https://driven-talent-standalone.vercel.app/api/integrations/webhook/indeed`
  3. *(Optional, paid tier only)* Generate an **Employer API token** for stats.
- **Env vars:** `INDEED_API_KEY` (optional) → set in Vercel, or paste via `/integrations`.

---

# 🟡 PART 2 — Owned infrastructure accounts (DT-owned keys needed, but not vendor-OAuth)

These are platform/infra credentials. At **handover** they must be re-issued under **DT-owned accounts** (per the Migration Plan). Estefany may or may not own these — confirm who does.

### 6. Supabase — database & auth (REQUIRED, app won't run without it)
- **Status:** ✅ Wired (currently on the build account; must move to DT-owned project at handover).
- **Estefany/owner task:** In the **DT Supabase project** → Settings → API → copy **Project URL**, **anon key**, **service-role key**.
- **Env vars:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

### 7. Sentry — error monitoring
- **Status:** 🟡 Code ready, no-op until DSN is set (optional but recommended).
- **Task:** In the **DT Sentry account** → Project Settings → Client Keys → copy **DSN**; then Account → Auth Tokens → create a token for releases.
- **Env vars:** `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`.

### 8. Vercel Blob — legal/onboarding file storage
- **Status:** 🟡 Code ready; legal-doc upload **throws a user-facing error** until provisioned.
- **Task:** In Vercel → project `driven-talent-standalone` → **Storage → create a Blob store** → copy the read/write token.
- **Env var:** `BLOB_READ_WRITE_TOKEN`.

### 9. Vercel Analytics proxy — dashboard site-traffic card
- **Status:** 🟡 Code ready; the dashboard traffic card **returns a 500** until set.
- **Task:** Vercel → Account → **Settings → Tokens** → create an API token; note the **Team ID** and the **marketing project ID** (`driven-talent-site`).
- **Env vars:** `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, `MARKETING_PROJECT_ID`.

### 10. Vercel Cron secret — scheduled sync auth
- **Status:** ✅ Wired; Vercel auto-injects when set.
- **Task:** Generate any random secret, set in Vercel; used to authorize the every-15-min sync job.
- **Env var:** `CRON_SECRET`.

### 11. E-signature backend (Documenso / DocuSeal) — *only if NOT using PandaDoc for signing*
- **Status:** 🟡 Code ready; falls back to a **manual/no-op stub** until configured. **Decision needed** (see reconciliation note 4).
- **Task (if chosen):** Stand up / log into a **Documenso** or **DocuSeal** instance, generate an **API token + base URL**.
- **Env vars:** `ESIGN_PROVIDER` (`documenso`|`docuseal`|`manual`), `DOCUMENSO_API_URL`+`DOCUMENSO_API_TOKEN`, or `DOCUSEAL_API_URL`+`DOCUSEAL_API_TOKEN`.

---

# 🔴 PART 3 — Not built in this codebase (need DEV work, not just keys)

These appear in the **Migration Plan / runbook** but have **no integration code in the standalone app**. If they're required for July 1, flag to the dev team — a key alone won't activate them.

| Integration | Role | Reality in code |
|---|---|---|
| **Resend** | Transactional email (`driven-talent.com` sending domain) | Not present in standalone app. Needs build + `RESEND_API_KEY`. |
| **Stripe** | Payments/invoicing | Not present in standalone app. Migration Plan says "DT creates fresh." Needs build + `STRIPE_*`. |
| **PEOPLEASE / PrismHR** | Payroll & onboarding system of record | **No API** — it's a manual portal workflow (timesheet data entry, claims email). App only stores a default claims email (`NEXT_PUBLIC_PEOPLEASE_CLAIMS_EMAIL`). No key to generate; portal logins only. Portals: registration `https://ppl.prismhr.com/ppl/auth/#/register`, employee portal `https://ppl-ep.prismhr.com/uex/#/auth/login`, support `myhr@peoplease.com`. |

---

# ✅ Already working (no Estefany action)

- **Vercel Cron** scheduling, **Manual e-sign** fallback, app DB schema, the `/integrations` admin UI — all live. The cron + routes are fully wired so each provider lights up the moment its credentials land.

---

## Meeting flow (suggested order)
1. **Confirm account access** — does Estefany have logins for RingCentral, PandaDoc, Calendly, the DT uAttend account, and the DT Indeed employer account? If not, that's the first blocker.
2. **Generate the 3 OAuth apps** (RingCentral, PandaDoc, Calendly) — paste in the redirect + webhook URIs above, copy out Client ID/Secret.
3. **Generate the 2 API keys** (uAttend, Indeed-optional) + register the Indeed feed/apply URLs.
4. **Infra keys** (Supabase, Sentry, Vercel Blob/Analytics/Cron) — whoever owns those accounts.
5. **Decisions:** e-sign tool of record (PandaDoc vs Documenso/DocuSeal); are Resend + Stripe in scope for July 1 (those need dev work).

## Env var summary (all set in Vercel project `driven-talent-standalone`)
```
# OAuth providers (Estefany generates in dev portals)
RINGCENTRAL_CLIENT_ID / RINGCENTRAL_CLIENT_SECRET / RINGCENTRAL_ENV=production
PANDADOC_CLIENT_ID / PANDADOC_CLIENT_SECRET
CALENDLY_CLIENT_ID / CALENDLY_CLIENT_SECRET
# API-key providers (paste in /integrations or set here)
UATTEND_API_KEY
INDEED_API_KEY            # optional
# Infra / owned accounts
NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SENTRY_DSN / SENTRY_ORG / SENTRY_PROJECT / SENTRY_AUTH_TOKEN
BLOB_READ_WRITE_TOKEN
VERCEL_TOKEN / VERCEL_TEAM_ID / MARKETING_PROJECT_ID
CRON_SECRET
NEXT_PUBLIC_APP_URL       # app base URL (final-redirect host)
# E-sign (only if not PandaDoc)
ESIGN_PROVIDER / DOCUMENSO_API_URL / DOCUMENSO_API_TOKEN / DOCUSEAL_API_URL / DOCUSEAL_API_TOKEN
# Not built yet (need dev work if in scope)
RESEND_API_KEY / STRIPE_*
```
