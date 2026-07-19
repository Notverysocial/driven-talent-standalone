// uAttend integration — timeclock punches sync to /timecards.
//
// uAttend (WorkwellTech) is an API-key authenticated REST service at
// https://api.workwelltech.com — POST + JSON body, header `x-api-key`.
// Employees clock in/out on devices or the mobile app; the cron pulls the
// punch report and writes `timeclock_punches`. Admins map the uAttend user id
// to a DT employees.id via integration.config.employee_mapping (edited on the
// /integrations page). Unmapped ids are still stored, flagged as a warning.
//
// ONE CLIENT. All HTTP goes through LiveUattendAdapter (src/lib/uattend/
// adapter.ts), which is the implementation that was verified against the real
// API on 2026-07-02. This file used to carry a SECOND, hand-written client
// pointed at `https://api.uattend.com` with GET /punches and a Bearer token.
// That hostname has no DNS record and never had one — it was wrong in this
// file's first commit and was not corrected when the adapter was fixed. Every
// run failed at `getaddrinfo ENOTFOUND`, reported only as "fetch failed", and
// nobody saw it because the cron was separately being 307'd by the auth proxy.
// The lesson is the duplication: two clients for one vendor let one of them
// stay broken for its entire life. Do not add a third.
//
// uAttend's webhook offering is inconsistent across plans, so cron sync is the
// primary path. handleWebhook() accepts "PunchAdded" callbacks if the account
// is provisioned for them and verifies the optional shared secret. NOTE: its
// payload normalizer is still written from the docs and has never been
// exercised against a real callback — treat it as unverified.
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
import { describeError, isDnsFailure } from "../describe-error";
import { resolveUattendAdapter } from "@/lib/uattend/adapter";
import {
  punchLineToEvents,
  clampLookback,
  shiftDays,
  DEFAULT_LOOKBACK_DAYS,
  DEFAULT_TIMEZONE,
  type PunchType,
} from "@/lib/uattend/punch-events";
import type { UattendPunch } from "@/lib/uattend/contract";
import type { IntegrationClient, IntegrationRow, SyncResult } from "../types";

class UAttendClient implements IntegrationClient {
  // uAttend uses API-key auth.  No OAuth methods.
  // getOAuthAuthorizeUrl / exchangeOAuthCode / refreshToken
  // intentionally not implemented — see types.ts
  // INTEGRATION_AUTH_MODE.uattend = "api_key".

  // ---------------- sync ----------------
  //
  // Delegates to LiveUattendAdapter — the ONE verified uAttend client. This
  // method used to hand-roll its own HTTP against `https://api.uattend.com`
  // with GET /punches and a Bearer token. That host has no DNS record and
  // never has (`getaddrinfo ENOTFOUND`); the value was wrong in the very first
  // commit of this file and was never corrected when adapter.ts was fixed
  // against the real API on 2026-07-02. So this sync has never once succeeded.
  // Two clients for one vendor is what allowed one of them to stay broken and
  // unnoticed, so the second one is gone rather than repointed.
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
    const employeeMapping =
      (config.employee_mapping as Record<string, string> | undefined) ?? {};
    const apiBase =
      typeof config.api_base === "string" && config.api_base
        ? (config.api_base as string)
        : undefined;

    // A token is present, so this always resolves to the LIVE adapter. Asserted
    // rather than assumed: the mock adapter returns invented punches, and
    // writing those into timeclock_punches would be indistinguishable from real
    // clock data once stored.
    const adapter = resolveUattendAdapter({ apiKey: token, apiBase });
    if (adapter.mode !== "live") {
      return {
        ok: false,
        count: 0,
        error:
          "Refusing to sync: adapter resolved to mock mode despite an API key being present. Mock punches must never reach timeclock_punches.",
      };
    }

    // Window: resume from the cursor, else the trailing week. Clamped to
    // MAX_LOOKBACK_DAYS so a long outage cannot make one run pull a year.
    const todayYmd = new Date().toISOString().slice(0, 10);
    const cursor =
      typeof config.last_punch_cursor === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(config.last_punch_cursor)
        ? config.last_punch_cursor
        : null;
    const startDate = clampLookback(cursor ?? shiftDays(todayYmd, -DEFAULT_LOOKBACK_DAYS), todayYmd);

    let punches: UattendPunch[];
    try {
      punches = await adapter.getPunchReport({ startDate, endDate: todayYmd });
    } catch (e) {
      // describeError surfaces err.cause, so a DNS/TLS/timeout failure names
      // itself in last_error instead of reading "fetch failed".
      const detail = describeError(e, "uattend_punch_report_failed");
      return {
        ok: false,
        count: 0,
        error: isDnsFailure(e)
          ? `${detail} — the API host does not resolve, so no credential was sent. This is a URL problem, not a key problem.`
          : detail,
      };
    }

    // Derive discrete clock events from the report's day-level line items.
    const timezone =
      typeof config.timezone === "string" && config.timezone
        ? config.timezone
        : DEFAULT_TIMEZONE;
    const events = punches.flatMap((p) => punchLineToEvents(p, timezone));

    const sb = createServiceClient();
    const unmapped = new Set<string>();
    let stored = 0;

    for (const ev of events) {
      const dtEmployeeId = employeeMapping[ev.uattendId] ?? null;
      if (!dtEmployeeId) unmapped.add(ev.uattendId);

      const { error } = await sb.from("timeclock_punches").upsert(
        {
          employee_id: dtEmployeeId,
          uattend_employee_id: ev.uattendId,
          uattend_punch_id: ev.punchId,
          punch_type: ev.punchType,
          punch_time: ev.punchTime,
          device_name: null, // the punch report carries no device field
          notes: ev.note,
          raw_payload: ev.raw,
        },
        { onConflict: "uattend_punch_id" },
      );
      if (!error) stored += 1;
    }

    // Advance the cursor only on a clean run, and only to the start of today —
    // today's punches are still accumulating, so re-pulling from today next
    // time is deliberate. Synthetic ids make that re-pull an update, not a
    // duplicate.
    const configPatch: Record<string, unknown> = {
      ...config,
      last_punch_cursor: todayYmd,
      timezone,
      unmapped_employees: Array.from(unmapped).sort(),
      last_pull_stats: {
        fetched_at: new Date().toISOString(),
        window_start: startDate,
        window_end: todayYmd,
        line_items_seen: punches.length,
        events_derived: events.length,
        events_stored: stored,
        unmapped_count: unmapped.size,
      },
    };
    await updateIntegrationStatus("uattend", { config: configPatch });

    // Unmapped employees are a warning, not a failure: the punches WERE stored
    // with employee_id=null. Returning ok:false here used to flip status=error,
    // which removed the row from the cron loop permanently.
    if (unmapped.size > 0) {
      const list = Array.from(unmapped).sort();
      return {
        ok: true,
        count: stored,
        warning: `Unmapped uAttend employees: ${list.slice(0, 10).join(", ")}${
          list.length > 10 ? "…" : ""
        }`,
      };
    }
    return { ok: true, count: stored };
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
        error: describeError(e, "disconnect_failed"),
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

export { UAttendClient };
