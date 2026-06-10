import type { IntegrationClient, IntegrationRow } from "./types";

// Default placeholder implementation for any provider whose dedicated
// file hasn't been written yet. Each provider agent overwrites its
// registry slot with a real client (see registry.ts).
//
// All operations short-circuit to a "Not yet implemented" error.
// `disconnect` is the one exception — it still flips the row back to
// disconnected so an admin can always clear a stuck state from the UI.

export class StubIntegrationClient implements IntegrationClient {
  constructor(private providerLabel: string) {}

  async sync(
    _integration: IntegrationRow,
  ): Promise<{ ok: boolean; count?: number; error?: string }> {
    return {
      ok: false,
      error: `${this.providerLabel} integration is not yet implemented`,
    };
  }

  async disconnect(
    _integration: IntegrationRow,
  ): Promise<{ ok: boolean; error?: string }> {
    // Soft success — the DB layer (db.ts) is the one that actually
    // clears tokens + flips status. Returning ok lets the disconnect
    // route do the bookkeeping even before the real client exists.
    return { ok: true };
  }
}
