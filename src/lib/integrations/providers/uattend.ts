// uAttend integration — timeclock punches sync to /timecards.
//
// uAttend (trackmytime.com) is an API-key authenticated REST service.
// Employees clock in/out via physical devices or the uAttend mobile
// app; we pull recent punches every 15 minutes (cron) and insert them
// into the `timeclock_punches` table.  Each punch carries the uAttend
// employee id; admins map that id to a DT employees.id via
// integration.config.employee_mapping (edited on the /integrations
// page).  Unmapped ids still get stored — they're flagged in
// integration.last_error so an admin knows to map them.
//
// uAttend's webhook offering is inconsistent across plans, so we
// rely on cron sync as the primary path.  handleWebhook() is a
// best-effort hook that accepts uAttend "PunchAdded" callbacks if the
// account is provisioned for them, verifies the optional shared
// secret, and writes through the same path as sync().
//
// Auth mode is "api_key" in types.ts — Antonio pastes the key via
// the /integrations Connect modal.

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import {
  getIntegration,
  updateIntegrationStatus,
  clearIntegrationTokens,
} from "../db";
import type { IntegrationClient, IntegrationRow, SyncResult } from "../types";

// uAttend REST base.  Their docs list api.uattend.com as the host;
// the path layout for punch records is `/punches` with a `start` /
// `end` window (ISO-8601).  If the host moves we override via
// integration.config.api_base.
const DEFAULT_API_BASE = "https://api.uattend.com";

// How far back to look on each sync.  We default to 24h to absorb
// brief outages of the cron loop; the unique constraint on
// uattend_punch_id makes re-pulling the same window safe.
const SYNC_WINDOW_MS = 24 * 60 * 60 * 1000;

// Cap how many punches we ingest in one cron pass.  Real-world
// punches per 15-min window are < 100, but we don't want a stuck
// account to balloon a single run.
const MAX_PUNCHES_PER_SYNC = 500;

type PunchType =
  | "in"
  | "out"
  | "lunch_in"
  | "lunch_out"
  | "break_in"
  | "break_out";

class UAttendClient implements IntegrationClient {
  // uAttend uses API-key auth.  No OAuth methods.
  // getOAuthAuthorizeUrl / exchangeOAuthCode / refreshToken
  // intentionally not implemented — see types.ts
  // INTEGRATION_AUTH_MODE.uattend = "api_key".

  // ---------------- sync ----------------
  async sync(integration: IntegrationRow): Promise<SyncResult> {
    const token = integration.access_token;
    if (!token) {
      return {
        ok: false,
        count: 0,
        error:
          "No uAttend API key on file. Paste one via /integrations → uAttend → Connect.",
      };
    }

    const config = (integration.config ?? {}) as Record<string, unknown>;
    const apiBase =
      typeof config.api_base === "string" && config.api_base
        ? (config.api_base as string).replace(/\/+$/, "")
        : DEFAULT_API_BASE;
    const employeeMapping =
      (config.employee_mapping as Record<string, string> | undefined) ?? {};

    const since =
      typeof config.last_punch_cursor === "string"
        ? (config.last_punch_cursor as string)
        : new Date(Date.now() - SYNC_WINDOW_MS).toISOString();
    const until = new Date().toISOString();

    // Fetch recent punches.  uAttend's docs describe a GET /punches
    // endpoint accepting start/end query params (ISO-8601) plus the
    // API key in an `Authorization: Bearer` header.  Some installs
    // use `?api_key=` query param instead — we try Bearer first.
    let punches: Record<string, unknown>[] = [];
    let usedFallbackAuth = false;
    try {
      const url = new URL(`${apiBase}/punches`);
      url.searchParams.set("start", since);
      url.searchParams.set("end", until);
      url.searchParams.set("limit", String(MAX_PUNCHES_PER_SYNC));

      let res = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      // Some uAttend tenants accept the API key only as a query
      // param.  Fall back if Bearer is rejected.
      if (res.status === 401 || res.status === 403) {
        const altUrl = new URL(`${apiBase}/punches`);
        altUrl.searchParams.set("start", since);
        altUrl.searchParams.set("end", until);
        altUrl.searchParams.set("limit", String(MAX_PUNCHES_PER_SYNC));
        altUrl.searchParams.set("api_key", token);
        res = await fetch(altUrl.toString(), {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        usedFallbackAuth = true;
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return {
          ok: false,
          count: 0,
          error: `uAttend API ${res.status}: ${body.slice(0, 200) || "no body"}`,
        };
      }

      const json = (await res.json()) as Record<string, unknown>;
      // Accept either {punches: [...]} or {data: [...]} or a bare
      // array — uAttend's response shape varies by plan.
      const candidate =
        (json.punches as unknown) ??
        (json.data as unknown) ??
        (Array.isArray(json) ? (json as unknown) : []);
      if (Array.isArray(candidate)) {
        punches = candidate as Record<string, unknown>[];
      }
    } catch (e) {
      return {
        ok: false,
        count: 0,
        error: e instanceof Error ? e.message : "uattend_fetch_failed",
      };
    }

    // Persist punches.
    const sb = createServiceClient();
    const unmapped = new Set<string>();
    let inserted = 0;

    for (const p of punches) {
      const normalized = normalizePunch(p);
      if (!normalized) continue;
      const dtEmployeeId =
        normalized.uattend_employee_id &&
        employeeMapping[normalized.uattend_employee_id]
          ? employeeMapping[normalized.uattend_employee_id]
          : null;
      if (!dtEmployeeId && normalized.uattend_employee_id) {
        unmapped.add(normalized.uattend_employee_id);
      }

      const { error } = await sb
        .from("timeclock_punches")
        .upsert(
          {
            employee_id: dtEmployeeId,
            uattend_employee_id: normalized.uattend_employee_id,
            uattend_punch_id: normalized.uattend_punch_id,
            punch_type: normalized.punch_type,
            punch_time: normalized.punch_time,
            device_name: normalized.device_name,
            notes: normalized.notes,
            raw_payload: p,
          },
          { onConflict: "uattend_punch_id" },
        );
      if (!error) inserted += 1;
    }

    // Stash cursor + auth hint + unmapped list for the admin UI.
    const nextCursor = until;
    const configPatch: Record<string, unknown> = {
      ...config,
      api_base: apiBase,
      last_punch_cursor: nextCursor,
      auth_mode: usedFallbackAuth ? "query_param" : "bearer",
      unmapped_employees: Array.from(unmapped).sort(),
      last_pull_stats: {
        fetched_at: until,
        window_start: since,
        punches_seen: punches.length,
        punches_stored: inserted,
        unmapped_count: unmapped.size,
      },
    };

    // If we hit unmapped ids, surface them via last_error so admins
    // see the warning even though the sync technically succeeded.
    const errMsg =
      unmapped.size > 0
        ? `Unmapped uAttend employees: ${Array.from(unmapped)
            .sort()
            .slice(0, 10)
            .join(", ")}${unmapped.size > 10 ? "…" : ""}`
        : null;

    await updateIntegrationStatus("uattend", { config: configPatch });

    // Unmapped employees aren't a hard failure — the punches WERE stored, with
    // employee_id=null — so this is a warning, not a failed run.
    //
    // It used to return ok=false here "so the admin card stays loud". That was
    // catastrophic: ok=false → status='error' → the cron's status filter
    // dropped the row forever. With 11 of 80 uAttend users unmapped, every
    // single run reported failure, so the very first one after the 2026-07-02
    // punch-feed deploy latched the integration off. Seventeen days of no
    // syncs, caused by a condition that was never fatal.
    //
    // `warning` keeps the card just as loud (it still writes last_error) while
    // leaving status='connected' so the job keeps running.
    if (errMsg) {
      return { ok: true, count: inserted, warning: errMsg };
    }
    return { ok: true, count: inserted };
  }

  // ---------------- webhook ----------------
  // uAttend punch-added callback (optional, enterprise plans only).
  // Payload shape varies; we treat it as a single-punch event and
  // route through the same normalization as sync().  If a shared
  // secret is stored on the row we verify HMAC-SHA256 against the
  // `x-uattend-signature` header.
  async handleWebhook(
    request: Request,
  ): Promise<{ ok: boolean; error?: string }> {
    const raw = await request.text();
    const integration = await getIntegration("uattend");
    const secret = integration?.webhook_secret ?? null;
    if (secret) {
      const sigHeader =
        request.headers.get("x-uattend-signature") ??
        request.headers.get("x-uattend-hmac") ??
        "";
      if (!sigHeader) return { ok: false, error: "missing_signature" };
      const expected = createHmac("sha256", secret).update(raw).digest("hex");
      const a = Buffer.from(expected, "hex");
      const candidates = [
        Buffer.from(sigHeader.replace(/^sha256=/, ""), "hex"),
        Buffer.from(sigHeader.replace(/^sha256=/, ""), "base64"),
      ];
      const ok = candidates.some(
        (c) => c.length === a.length && timingSafeEqual(c, a),
      );
      if (!ok) return { ok: false, error: "invalid_signature" };
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { ok: false, error: "invalid_json" };
    }

    // Some payloads wrap the punch under .punch; others are bare.
    const punchRaw =
      (payload.punch as Record<string, unknown> | undefined) ?? payload;
    const normalized = normalizePunch(punchRaw);
    if (!normalized) return { ok: false, error: "unrecognized_payload" };

    const config = (integration?.config ?? {}) as Record<string, unknown>;
    const employeeMapping =
      (config.employee_mapping as Record<string, string> | undefined) ?? {};
    const dtEmployeeId =
      normalized.uattend_employee_id &&
      employeeMapping[normalized.uattend_employee_id]
        ? employeeMapping[normalized.uattend_employee_id]
        : null;

    const sb = createServiceClient();
    const { error } = await sb.from("timeclock_punches").upsert(
      {
        employee_id: dtEmployeeId,
        uattend_employee_id: normalized.uattend_employee_id,
        uattend_punch_id: normalized.uattend_punch_id,
        punch_type: normalized.punch_type,
        punch_time: normalized.punch_time,
        device_name: normalized.device_name,
        notes: normalized.notes,
        raw_payload: punchRaw,
      },
      { onConflict: "uattend_punch_id" },
    );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  // ---------------- disconnect ----------------
  async disconnect(
    _integration: IntegrationRow,
  ): Promise<{ ok: boolean; error?: string }> {
    // No remote revoke for API-key mode.  Clear tokens and reset the
    // cursor so a future reconnect starts fresh.  Preserve the
    // employee mapping so re-connecting doesn't lose admin work.
    try {
      await clearIntegrationTokens("uattend");
      const row = await getIntegration("uattend");
      if (row) {
        const cfg = (row.config ?? {}) as Record<string, unknown>;
        await updateIntegrationStatus("uattend", {
          config: {
            employee_mapping: cfg.employee_mapping ?? {},
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

// ----------------- helpers -----------------

function normalizePunch(raw: Record<string, unknown>): {
  uattend_punch_id: string;
  uattend_employee_id: string | null;
  punch_type: PunchType;
  punch_time: string;
  device_name: string | null;
  notes: string | null;
} | null {
  const id =
    str(raw.id) ??
    str(raw.punch_id) ??
    str(raw.punchId) ??
    str(raw.uuid) ??
    null;
  if (!id) return null;

  const punchType = mapPunchType(
    str(raw.punch_type) ??
      str(raw.punchType) ??
      str(raw.type) ??
      str(raw.action),
  );
  if (!punchType) return null;

  const time =
    str(raw.punch_time) ??
    str(raw.punchTime) ??
    str(raw.timestamp) ??
    str(raw.time) ??
    str(raw.created_at);
  if (!time) return null;
  const iso = isoOrNull(time);
  if (!iso) return null;

  const employeeId =
    str(raw.employee_id) ??
    str(raw.employeeId) ??
    str(raw.user_id) ??
    str(raw.userId) ??
    null;

  const device =
    str(raw.device_name) ??
    str(raw.deviceName) ??
    str(raw.device) ??
    str(raw.terminal) ??
    null;

  const notes = str(raw.notes) ?? str(raw.note) ?? str(raw.comment) ?? null;

  return {
    uattend_punch_id: id,
    uattend_employee_id: employeeId,
    punch_type: punchType,
    punch_time: iso,
    device_name: device,
    notes,
  };
}

function mapPunchType(v: string | null): PunchType | null {
  if (!v) return null;
  const norm = v.toLowerCase().replace(/[\s-]+/g, "_");
  if (["in", "clock_in", "clockin", "punch_in"].includes(norm)) return "in";
  if (["out", "clock_out", "clockout", "punch_out"].includes(norm)) return "out";
  if (
    ["lunch_in", "lunch_start", "meal_start", "meal_in"].includes(norm)
  )
    return "lunch_in";
  if (
    ["lunch_out", "lunch_end", "meal_end", "meal_out"].includes(norm)
  )
    return "lunch_out";
  if (["break_in", "break_start"].includes(norm)) return "break_in";
  if (["break_out", "break_end"].includes(norm)) return "break_out";
  return null;
}

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function isoOrNull(v: string): string | null {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export const uattendClient = new UAttendClient();

export { UAttendClient, DEFAULT_API_BASE };
