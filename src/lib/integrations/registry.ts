import type { IntegrationClient, IntegrationProvider } from "./types";
import { ALL_PROVIDERS } from "./types";
import { StubIntegrationClient } from "./stub";

// Provider -> client mapping. Each provider's dedicated file (e.g.
// src/lib/integrations/providers/ringcentral.ts) registers itself by
// importing this module and calling `registerClient(...)` at the top
// level. The /integrations admin page + the route handlers under
// /api/integrations/** look up clients here.
//
// All five providers start as stubs so the UI + cron + routes are
// fully wired before any real provider is built. Importing the real
// provider file in the registry replaces the stub.

const clients: Partial<Record<IntegrationProvider, IntegrationClient>> = {};

export function registerClient(
  provider: IntegrationProvider,
  client: IntegrationClient,
): void {
  clients[provider] = client;
}

export function getClient(provider: IntegrationProvider): IntegrationClient {
  const c = clients[provider];
  if (c) return c;
  // Fall back to a stub keyed to the provider label so error messages
  // are useful in the admin UI before the real client lands.
  return new StubIntegrationClient(provider);
}

// Pre-register stubs for every provider so a fresh module load (e.g.
// cold cron invocation) doesn't return undefined for any of them.
for (const p of ALL_PROVIDERS) {
  if (!clients[p]) clients[p] = new StubIntegrationClient(p);
}

// -------------------------------------------------------------------
// Provider imports — each provider file *must* call registerClient()
// at module top level. Adding the import here is enough to wire it in
// because Next bundles the module graph; provider agents should add
// their `import "./providers/<name>";` line below.
// -------------------------------------------------------------------
// import "./providers/ringcentral";
import { indeedClient } from "./providers/indeed";
registerClient("indeed", indeedClient);
// import "./providers/uattend";
// import "./providers/pandadoc";
// import "./providers/calendly";

export { ALL_PROVIDERS };
