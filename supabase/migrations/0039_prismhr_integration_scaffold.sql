-- 0039_prismhr_integration_scaffold.sql
-- Seed the PrismHR (Peoplease) integration row — DISCONNECTED, scaffold only.
--
-- PrismHR is DT's PEO payroll system (via Peoplease). There is NO live
-- connection: Peoplease must first provision a web-service user credential +
-- PEO ID (see src/lib/prismhr/README.md). This just makes the provider appear
-- on /integrations in a disconnected state, mirroring the other providers.
--
-- The `integrations.provider` column is free-text UNIQUE (no enum to extend).
-- Additive + idempotent via ON CONFLICT DO NOTHING.
--
-- config keys (documented, all null until provisioning):
--   peo_id            — PEO / company id in PrismHR
--   web_service_user  — PrismHR web-service username (the secret goes in
--                       integrations.access_token, never in config)
--   api_base          — tenant-specific PrismHR API base URL (optional override)

insert into integrations (provider, display_name, status, config)
values (
  'prismhr',
  'PrismHR / Peoplease',
  'disconnected',
  '{"peo_id": null, "web_service_user": null, "api_base": null, "scaffold": true}'::jsonb
)
on conflict (provider) do nothing;
