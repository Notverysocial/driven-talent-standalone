import "server-only";
import { getIntegration } from "@/lib/integrations/db";
import { resolvePrismHrAdapter, type PrismHrAdapter } from "./adapter";
import type { PrismHrConfig } from "./contract";

// Server-side resolution: read the `prismhr` integration row and return the
// live adapter only when both a credential (access_token) and a PEO ID
// (config.peo_id) are present — otherwise the mock. Today the row ships
// disconnected, so this returns the mock and nothing makes a live call.
export async function getPrismHrAdapter(): Promise<PrismHrAdapter> {
  let apiKey: string | null = null;
  let peoId: string | null = null;
  let apiBase: string | null = null;
  try {
    const row = await getIntegration("prismhr");
    apiKey = row?.access_token ?? null;
    const cfg = (row?.config ?? {}) as Partial<PrismHrConfig>;
    peoId = typeof cfg.peo_id === "string" ? cfg.peo_id : null;
    apiBase = typeof cfg.api_base === "string" ? cfg.api_base : null;
  } catch {
    // integrations table not present / row missing — fall through to mock.
  }
  return resolvePrismHrAdapter({ apiKey, peoId, apiBase });
}
