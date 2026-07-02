# PrismHR (Peoplease) integration — scaffold

DT's PEO is **Peoplease**, which runs on **PrismHR**. This directory scaffolds
the integration so going live is one small, contained change once Peoplease
provisions API access. **Nothing here makes a live call today** — the provider
ships **disconnected** and the live adapter methods are stubs that throw until
wired.

## Status
- **Disconnected / MOCK.** No credentials, no live connection.
- Registered on `/integrations` as **PrismHR / Peoplease** (auth mode `api_key`).
- Seed row: migration `0038_prismhr_integration_scaffold.sql`.
- Data adapter: `adapter.ts` (`LivePrismHrAdapter` stubs + `MockPrismHrAdapter`),
  resolved server-side by `adapter.server.ts` (`getPrismHrAdapter`).
- Integrations-registry client: `../integrations/providers/prismhr.ts`.

## What we need Peoplease to provision (blockers to go live)
1. **PrismHR web-service user** — a dedicated API/web-service account
   (username + password, or an API key/token, per PrismHR's auth). The secret is
   pasted on `/integrations → PrismHR → Connect` and stored in
   `integrations.access_token` (never in `config`).
2. **PEO ID** — DT's PEO / company id in PrismHR. Stored in `config.peo_id`.
3. **API base URL / host** — PrismHR tenants are host-specific. If different from
   the default (`https://api.prismhr.com`), stored in `config.api_base`.
4. **API access / docs** — access to the PrismHR **REST Services API**
   documentation for the exact endpoint paths, request/response schemas, and
   auth scheme (the paths below are provisional placeholders until confirmed).
5. *(confirm)* any **company/client code** or scope PrismHR requires on requests.

## PrismHR Services API endpoints involved (provisional — confirm w/ docs)
Defined in `contract.ts` (`PRISMHR_ENDPOINTS`):
- **(a) Employee status + records** — `GET /v1/employees`, `GET /v1/employees/{id}`
  → read active/inactive status + basic records (map `externalId` ↔
  `employees.legacy_id`).
- **(b) Submit / import payroll hours** — `POST /v1/payroll/batches`
  → submit a pay period's hours (reg/OT/holiday/sick per employee) for the PEO.

## Going live (the one remaining step, after provisioning)
1. Peoplease creates the web-service user + gives the PEO ID + API host + docs.
2. Confirm the real endpoint paths / auth scheme in `contract.ts`.
3. Implement the two `LivePrismHrAdapter` methods (replace the `throw` with the
   real fetch + normalizers).
4. Paste the credential on `/integrations → PrismHR → Connect` and set the PEO
   ID; `resolvePrismHrAdapter` flips MOCK → LIVE automatically.

## How payroll flows (context)
uAttend hours → the app's timecards → **payroll**. Today DT uploads to Peoplease
manually (and the CSV **"Export for Peoplease"** covers that — see
`src/lib/peoplease-export.ts`). This integration is the future automated path:
push the period's hours to PrismHR via `submitPayrollHours`, and read employee
active/inactive status back via `getEmployeeStatuses`.
