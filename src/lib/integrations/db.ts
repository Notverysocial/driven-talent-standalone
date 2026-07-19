import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import {
  ALL_PROVIDERS,
  INTEGRATION_DEFAULT_INTERVAL_MIN,
  isIntegrationProvider,
} from "./types";
import type {
  IntegrationProvider,
  IntegrationRow,
  IntegrationStatus,
} from "./types";

// All reads/writes go through the service-role client. The
// /integrations admin page is RBAC-gated at the route layer
// (requireRole("admin")) so it's safe to use service-role here;
// downstream route handlers (cron / webhook) cannot rely on the
// caller's auth session anyway.

const TABLE = "integrations";

export async function getIntegration(
  provider: IntegrationProvider,
): Promise<IntegrationRow | null> {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("provider", provider)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as IntegrationRow | null) ?? null;
}

export async function listIntegrations(): Promise<IntegrationRow[]> {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .order("display_name", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as IntegrationRow[];
  // Filter out any rows whose provider value doesn't match the typed
  // union — keeps the UI safe against stray rows.
  return rows.filter((r) => isIntegrationProvider(r.provider));
}

// Partial update. The DB has a check constraint on status so callers
// must respect the IntegrationStatus union — but we still let any
// nullable scalar through (callers explicitly pass null to clear a
// field, e.g. disconnect clearing tokens).
export type IntegrationPatch = Partial<
  Omit<IntegrationRow, "id" | "provider" | "display_name">
>;

export async function updateIntegrationStatus(
  provider: IntegrationProvider,
  patch: IntegrationPatch,
): Promise<IntegrationRow> {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .update(patch)
    .eq("provider", provider)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Integration row for ${provider} not found`);
  return data as IntegrationRow;
}

// Mark a sync as in-flight. Provider clients should call this at the
// start of their sync() so the UI shows the syncing badge and the
// cron loop won't double-pick the row mid-run.
export async function recordSyncStart(
  provider: IntegrationProvider,
): Promise<void> {
  await updateIntegrationStatus(provider, {
    status: "syncing",
    last_error: null,
  });
}

// Finalize a sync. On success we set the next_sync_at hint based on
// the provider's default interval; on failure we flip status=error
// and stash the message in last_error (truncated to 1KB so a noisy
// stack trace doesn't bloat the row).
export async function recordSyncEnd(
  provider: IntegrationProvider,
  ok: boolean,
  count: number = 0,
  error: string | null = null,
  // A non-fatal condition worth showing the operator. Written to last_error so
  // the card stays loud, WITHOUT flipping status to 'error' — an error status
  // used to be a one-way door out of the cron loop.
  warning: string | null = null,
): Promise<void> {
  const now = new Date();
  const intervalMin = INTEGRATION_DEFAULT_INTERVAL_MIN[provider] ?? 30;
  const next = new Date(now.getTime() + intervalMin * 60 * 1000);

  const patch: IntegrationPatch = ok
    ? {
        status: "connected",
        last_sync_at: now.toISOString(),
        next_sync_at: next.toISOString(),
        last_sync_count: count,
        last_error: warning ? warning.slice(0, 1024) : null,
      }
    : {
        status: "error",
        last_sync_at: now.toISOString(),
        next_sync_at: next.toISOString(),
        last_sync_count: count,
        last_error: (error ?? "Unknown error").slice(0, 1024),
      };

  await updateIntegrationStatus(provider, patch);
}

// Used by the disconnect action — clears tokens + resets schedule.
export async function clearIntegrationTokens(
  provider: IntegrationProvider,
): Promise<void> {
  await updateIntegrationStatus(provider, {
    status: "disconnected",
    access_token: null,
    refresh_token: null,
    token_expires_at: null,
    account_email: null,
    next_sync_at: null,
    last_error: null,
  });
}

// Used by the OAuth callback — provider clients call this after
// exchanging the code.
export async function storeOAuthTokens(
  provider: IntegrationProvider,
  args: {
    access_token: string;
    refresh_token?: string | null;
    expires_in_seconds?: number | null;
    account_email?: string | null;
    config_patch?: Record<string, unknown>;
  },
): Promise<IntegrationRow> {
  const expiresAt = args.expires_in_seconds
    ? new Date(Date.now() + args.expires_in_seconds * 1000).toISOString()
    : null;

  const sb = createServiceClient();
  const current = await getIntegration(provider);
  const mergedConfig = {
    ...(current?.config ?? {}),
    ...(args.config_patch ?? {}),
  };

  const { data, error } = await sb
    .from(TABLE)
    .update({
      status: "connected" as IntegrationStatus,
      access_token: args.access_token,
      refresh_token: args.refresh_token ?? null,
      token_expires_at: expiresAt,
      account_email: args.account_email ?? null,
      last_error: null,
      config: mergedConfig,
    })
    .eq("provider", provider)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Integration row for ${provider} not found`);
  return data as IntegrationRow;
}

// Used by the webhook route to look up a row by webhook_secret —
// some providers (e.g. Calendly) include a secret in the request and
// the route must verify it.
export async function getIntegrationByWebhookSecret(
  secret: string,
): Promise<IntegrationRow | null> {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("webhook_secret", secret)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as IntegrationRow | null) ?? null;
}

export { ALL_PROVIDERS };
