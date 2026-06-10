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
import { createServiceClient } from "@/lib/supabase/server";

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

// ---------- uAttend employee-mapping admin ----------
//
// integrations.uattend.config.employee_mapping is a JSON map of
// uAttend employee id -> DT employees.id (uuid).  This action accepts
// a form payload of the shape:
//
//   uattend_id[]   = ["123", "456", ...]
//   dt_employee[]  = ["<uuid>", "", ...]   ("" means unset / skip)
//
// We merge non-empty pairs into the existing map; setting dt_employee
// to "__remove__" clears that key.  After saving we backfill any
// existing timeclock_punches rows whose employee_id is null but whose
// uattend_employee_id now has a match — so the timecards page picks
// them up immediately without waiting for the next cron pull.
export async function saveUattendMappingAction(
  _prev: IntegrationActionState,
  formData: FormData,
): Promise<IntegrationActionState> {
  try {
    await assertRole("admin");
    const row = await getIntegration("uattend");
    if (!row) return { error: "integration_row_missing" };

    const uIds = formData.getAll("uattend_id").map((v) => String(v));
    const dtIds = formData.getAll("dt_employee").map((v) => String(v));

    const cfg = (row.config ?? {}) as Record<string, unknown>;
    const existing =
      (cfg.employee_mapping as Record<string, string> | undefined) ?? {};
    const merged: Record<string, string> = { ...existing };

    let added = 0;
    let removed = 0;
    for (let i = 0; i < uIds.length; i++) {
      const uid = uIds[i]?.trim();
      const dtid = dtIds[i]?.trim();
      if (!uid) continue;
      if (dtid === "__remove__") {
        if (uid in merged) {
          delete merged[uid];
          removed += 1;
        }
        continue;
      }
      if (!dtid) continue; // skip empty (no choice made)
      if (!/^[0-9a-f-]{36}$/i.test(dtid)) continue; // sanity check uuid shape
      merged[uid] = dtid;
      added += 1;
    }

    await updateIntegrationStatus("uattend", {
      config: { ...cfg, employee_mapping: merged },
    });

    // Backfill: any existing punches with this uattend_employee_id
    // and null employee_id should get the new mapping applied.
    const sb = createServiceClient();
    let backfilled = 0;
    for (const [uid, dtid] of Object.entries(merged)) {
      const { error, count } = await sb
        .from("timeclock_punches")
        .update({ employee_id: dtid }, { count: "exact" })
        .is("employee_id", null)
        .eq("uattend_employee_id", uid);
      if (!error && typeof count === "number") backfilled += count;
    }

    revalidatePath("/integrations");
    revalidatePath("/timecards");
    return {
      ok: `Saved ${added} mapping${added === 1 ? "" : "s"}${
        removed ? `, removed ${removed}` : ""
      }${backfilled ? `, backfilled ${backfilled} punch${backfilled === 1 ? "" : "es"}` : ""}.`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "save_failed" };
  }
}
