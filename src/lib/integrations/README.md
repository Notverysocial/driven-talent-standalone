# Integrations subsystem

Shared scaffolding the five provider integrations (RingCentral,
Indeed, uAttend, PandaDoc, Calendly) plug into. Read this end-to-end
before adding a new provider.

## File layout

```
src/lib/integrations/
  types.ts        ← IntegrationClient interface, provider unions, auth-mode + interval tables
  registry.ts     ← provider -> client map; provider files register themselves here
  db.ts           ← server-only helpers around the integrations table (service-role)
  stub.ts         ← StubIntegrationClient used until a real provider file lands
  providers/      ← one file per provider (you add this)
    ringcentral.ts
    indeed.ts
    uattend.ts
    pandadoc.ts
    calendly.ts
src/app/api/integrations/
  oauth/[provider]/callback/route.ts  ← GET, runs exchangeOAuthCode
  sync/[provider]/route.ts            ← POST (RBAC-gated), runs sync
  webhook/[provider]/route.ts         ← POST (signature-verified), runs handleWebhook
  cron/route.ts                       ← GET (CRON_SECRET-gated), runs due syncs
src/app/integrations/
  page.tsx        ← admin dashboard (RBAC-gated to admin+)
  *.tsx           ← action forms (Connect / Sync / Disconnect / API-key paste)
  actions.ts
supabase/migrations/0022_integrations.sql
vercel.json       ← /api/integrations/cron every 15 min
```

## The IntegrationClient contract

```ts
interface IntegrationClient {
  getOAuthAuthorizeUrl?(state: string): string;
  exchangeOAuthCode?(code: string, state: string): Promise<{ ok; error? }>;
  refreshToken?(integration): Promise<{ ok; error? }>;
  sync(integration): Promise<{ ok; count?; error? }>;
  handleWebhook?(request: Request): Promise<{ ok; error? }>;
  disconnect(integration): Promise<{ ok; error? }>;
}
```

- `sync` and `disconnect` are required. Everything else is optional —
  implement only what your provider needs.
- OAuth providers (RingCentral, PandaDoc, Calendly) implement
  `getOAuthAuthorizeUrl` + `exchangeOAuthCode` + `refreshToken`.
- API-key providers (Indeed, uAttend) skip OAuth entirely; the UI
  surfaces a paste modal that calls a server action to store the key
  directly in `integrations.access_token`.
- The `IntegrationRow` you receive in `sync()` is the live DB row —
  read tokens / config off of it.

## Wiring a new provider

1. Create `src/lib/integrations/providers/<name>.ts`. Export your
   client and register it on module load:
   ```ts
   import { registerClient } from "../registry";
   import type { IntegrationClient, IntegrationRow } from "../types";
   class RingCentralClient implements IntegrationClient { /* ... */ }
   registerClient("ringcentral", new RingCentralClient());
   ```
2. Uncomment the matching `import "./providers/<name>";` line in
   `registry.ts` so the module is in the bundle graph.
3. If your provider is OAuth, ensure your auth mode in `types.ts` is
   already `"oauth"` (it is for ringcentral / pandadoc / calendly).
   Add provider client_id / client_secret to env (`<UPPER>_CLIENT_ID`,
   `<UPPER>_CLIENT_SECRET`) and the redirect URI in the provider
   dashboard pointing at
   `https://driven-talent-standalone.vercel.app/api/integrations/oauth/<provider>/callback`.

## OAuth callback flow

1. UI renders `<a href={client.getOAuthAuthorizeUrl(state)}>Connect</a>`.
2. Provider redirects back to
   `/api/integrations/oauth/<provider>/callback?code=...&state=...`.
3. The callback route:
   - looks up the client from the registry
   - calls `exchangeOAuthCode(code, state)`
   - your client calls `storeOAuthTokens(provider, {...})` from
     `db.ts` to persist
   - the route then redirects to `/integrations?connected=<provider>`
     (or `?error=<provider>` on failure)
4. `state` SHOULD be a CSRF token you generated in the authorize URL
   and re-check on callback. Use the `integrations.config` JSON
   column to stash the state between calls if you need to.

## Webhook routing

`POST /api/integrations/webhook/<provider>` is public-but-signature-
verified. The route:

1. looks up the client and calls `handleWebhook(request)`
2. your client is responsible for verifying the signature header
   (read it off `request.headers`) and rejecting if invalid by
   returning `{ ok: false, error: "..." }`
3. on `ok: true` the route responds 200, otherwise 401

The `webhook_secret` column on `integrations` is where you stash the
shared secret. Some providers (Calendly) put the secret in the
payload — use `getIntegrationByWebhookSecret(secret)` to look the row
up that way.

## Cron triggers sync

`vercel.json` schedules `GET /api/integrations/cron` every 15
minutes. That handler:

1. verifies `Authorization: Bearer <CRON_SECRET>` (Vercel Cron
   injects this header automatically when you set the env var)
2. selects every integration where
   `status = 'connected' AND next_sync_at <= now()`
3. for each: `recordSyncStart()` -> `client.sync(row)` ->
   `recordSyncEnd(provider, result.ok, result.count, result.error)`
4. `recordSyncEnd` schedules `next_sync_at = now() + INTEGRATION_DEFAULT_INTERVAL_MIN[provider]`

Manual sync (`POST /api/integrations/sync/<provider>`) runs the exact
same `recordSyncStart -> sync -> recordSyncEnd` cycle but is gated
to owner/admin and skips the next_sync_at gate.

## DB helper cheat sheet

```ts
import {
  getIntegration,
  updateIntegrationStatus,
  recordSyncStart,
  recordSyncEnd,
  storeOAuthTokens,
  clearIntegrationTokens,
  listIntegrations,
} from "@/lib/integrations/db";
```

All helpers use the **service-role** Supabase client and are
`server-only`. Don't import from `db.ts` in client components.

## Environment variables

Per provider (set in Vercel as well as locally):

- `RINGCENTRAL_CLIENT_ID`, `RINGCENTRAL_CLIENT_SECRET`,
  `RINGCENTRAL_ENV` (`production` | `sandbox`)
- `INDEED_API_KEY` (optional fallback if a user hasn't pasted one yet)
- `UATTEND_API_KEY` (same)
- `PANDADOC_CLIENT_ID`, `PANDADOC_CLIENT_SECRET`
- `CALENDLY_CLIENT_ID`, `CALENDLY_CLIENT_SECRET`

Always-on:

- `CRON_SECRET` — Vercel Cron auth header
- `NEXT_PUBLIC_APP_URL` — used to build redirect URIs

## Things follow-on agents should know

- `IntegrationRow.config` (jsonb) is your free-form per-provider
  scratchpad. Stash CSRF state, last-cursor, etc. there.
- `webhook_secret` is single-tenant: one row per provider. If a
  provider supports multiple webhooks, store them as a list inside
  `config` instead and verify against the list.
- The seed migration creates one row per provider with
  `status='disconnected'`. Provider clients must **never** insert new
  rows; only update the seeded one.
- `status='syncing'` is the in-flight marker. The cron skips rows in
  that state (it filters `status='connected'`) so a stuck sync
  doesn't get double-picked.
- If you need additional columns, add a new migration —
  don't try to overload `config` past 16KB of data.
