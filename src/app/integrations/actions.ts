"use server";

import { revalidatePath } from "next/cache";
import { assertRole } from "@/lib/auth.server";
import { getClient } from "@/lib/integrations/registry";
import {
  clearIntegrationTokens,
  getIntegration,
  recordSyncEnd,
  recordSyncStart,
  updateIntegrationStatus,
} from "@/lib/integrations/db";
import { isIntegrationProvider } from "@/lib/integrations/types";

export type IntegrationActionState = { error?: string; ok?: string };

function asProvider(input: FormDataEntryValue | null): string {
  return typeof input === "string" ? input : "";
}

// Disconnect — clear tokens, status='disconnected'. Calls the
// provider's disconnect() first so it can revoke remote tokens /
// unsubscribe webhooks, then wipes the DB row regardless of result.
export async function disconnectIntegration(
  formData: FormData,
): Promise<void> {
  await assertRole("admin");
  const provider = asProvider(formData.get("provider"));
  if (!isIntegrationProvider(provider)) {
    throw new Error("unknown_provider");
  }
  const row = await getIntegration(provider);
  if (!row) throw new Error("integration_row_missing");

  const client = getClient(provider);
  try {
    await client.disconnect(row);
  } catch {
    // ignore — we still clear local state
  }
  await clearIntegrationTokens(provider);
  revalidatePath("/integrations");
}

// Manual sync via form action — mirrors POST /api/integrations/sync
// but is callable from the page's <form action={…}> button.
export async function syncIntegrationAction(
  formData: FormData,
): Promise<void> {
  await assertRole("admin");
  const provider = asProvider(formData.get("provider"));
  if (!isIntegrationProvider(provider)) {
    throw new Error("unknown_provider");
  }
  const row = await getIntegration(provider);
  if (!row) throw new Error("integration_row_missing");
  if (row.status === "disconnected") {
    throw new Error("not_connected");
  }

  const client = getClient(provider);
  await recordSyncStart(provider);
  try {
    const r = await client.sync(row);
    await recordSyncEnd(
      provider,
      r.ok,
      r.count ?? 0,
      r.ok ? null : (r.error ?? "sync_failed"),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "sync_threw";
    await recordSyncEnd(provider, false, 0, msg);
  }
  revalidatePath("/integrations");
}

// Paste-API-key flow — for providers whose auth mode is "api_key".
// Stores the pasted key as access_token and flips status to connected.
export async function saveApiKeyAction(
  _prev: IntegrationActionState,
  formData: FormData,
): Promise<IntegrationActionState> {
  try {
    await assertRole("admin");
    const provider = asProvider(formData.get("provider"));
    const apiKey = String(formData.get("api_key") ?? "").trim();
    const accountEmail =
      String(formData.get("account_email") ?? "").trim() || null;
    if (!isIntegrationProvider(provider)) {
      return { error: "unknown_provider" };
    }
    if (!apiKey) {
      return { error: "API key is required" };
    }
    await updateIntegrationStatus(provider, {
      status: "connected",
      access_token: apiKey,
      refresh_token: null,
      token_expires_at: null,
      account_email: accountEmail,
      last_error: null,
    });
    revalidatePath("/integrations");
    return { ok: "Connected" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "save_failed" };
  }
}
