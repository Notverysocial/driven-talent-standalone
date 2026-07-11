// PrismHR (Peoplease) integration — SCAFFOLD, disconnected by default.
//
// PrismHR is DT's PEO payroll system (via Peoplease). It is NOT wired to a live
// API: Peoplease must first provision a web-service user credential + PEO ID
// (see src/lib/prismhr/README.md). Until then this provider stays disconnected
// and makes NO network calls. Auth mode is "api_key" (types.ts) — the
// /integrations page shows the standard paste-credential Connect flow, and the
// PEO ID goes on the integration row's config.
//
// The data-side scaffold (employee-status read + payroll-hours submit) lives in
// src/lib/prismhr/adapter.ts (Live stubs + Mock). This file is just the
// integrations-registry client so PrismHR appears on /integrations.

import "server-only";
import { clearIntegrationTokens, getIntegration, updateIntegrationStatus } from "../db";
import type { IntegrationClient, IntegrationRow } from "../types";

const PROVIDER = "prismhr" as const;

class PrismHrClient implements IntegrationClient {
  // Cron/manual sync. Safe no-op today: never calls out. Reports the
  // not-connected / scaffold state so the /integrations card is honest.
  async sync(
    integration: IntegrationRow,
  ): Promise<{ ok: boolean; count?: number; error?: string }> {
    if (!integration.access_token) {
      return {
        ok: false,
        count: 0,
        error:
          "PrismHR not connected — awaiting Peoplease web-service credential + PEO ID.",
      };
    }
    // A credential is present but the live adapter is intentionally a scaffold.
    // Do NOT attempt an unimplemented live call; keep the config note fresh.
    await updateIntegrationStatus(PROVIDER, {
      config: {
        ...(integration.config ?? {}),
        scaffold: true,
      },
    });
    return {
      ok: false,
      count: 0,
      error:
        "PrismHR adapter is a scaffold — live sync not implemented yet (endpoints/spec pending Peoplease). No call was made.",
    };
  }

  async disconnect(
    _integration: IntegrationRow,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      await clearIntegrationTokens(PROVIDER);
      // Preserve the documented config keys so a future connect isn't blank.
      const row = await getIntegration(PROVIDER);
      if (row) {
        await updateIntegrationStatus(PROVIDER, {
          config: {
            ...(row.config ?? {}),
            peo_id: null,
            web_service_user: null,
          },
        });
      }
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "disconnect_failed",
      };
    }
  }
}

export const prismhrClient = new PrismHrClient();
export { PrismHrClient };
