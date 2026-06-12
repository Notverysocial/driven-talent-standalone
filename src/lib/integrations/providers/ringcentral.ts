// RingCentral integration — OAuth 2.0 (auth-code) + call-log sync + telephony
// webhook for real-time inbound calls.
//
// Flow:
//
//   1. OAuth     — admin clicks Connect on /integrations → /ringcentral card.
//                  We bounce through RingCentral's authorize URL, exchange
//                  the returned code (Basic-auth client_id:client_secret) for
//                  an access + refresh token, store both on the integrations
//                  row via storeOAuthTokens(). RingCentral access tokens are
//                  short-lived (~1h); refresh tokens last ~7d under their
//                  default policy.
//   2. Webhook   — RingCentral POSTs telephony session events to
//                  /api/integrations/webhook/ringcentral. On the FIRST POST
//                  to a fresh subscription RingCentral sends a validation
//                  request with a `Validation-Token` header — the route
//                  layer echoes it back. After that, every event includes a
//                  `Verification-Token` header whose value we match against
//                  integrations.webhook_secret. On `Disconnected` events we
//                  insert a row into inbound_calls keyed by the RingCentral
//                  session id and look up an existing candidate / sales_lead
//                  by phone for context (mirrored into /inbox on a match).
//   3. sync()    — 15-min poll of /restapi/v1.0/account/~/extension/~/call-log
//                  with view=Detailed for inbound calls. Webhooks are the
//                  primary signal; sync is the safety net + back-fill on
//                  initial connect. Cursor stashed in
//                  integration.config.last_call_log_cursor.
//   4. disconnect— POST /restapi/oauth/revoke (Basic auth) for the access
//                  token, then clearIntegrationTokens().
//
// Auth mode is "oauth" in types.ts.  RINGCENTRAL_CLIENT_ID +
// RINGCENTRAL_CLIENT_SECRET must be set in Vercel (see dashboard setup
// checklist in the report). RINGCENTRAL_ENV (production | sandbox) toggles
// the API host — defaults to production.

import "server-only";
import { timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import {
  getIntegration,
  storeOAuthTokens,
  updateIntegrationStatus,
  clearIntegrationTokens,
} from "../db";
import type { IntegrationClient, IntegrationRow } from "../types";

const PROVIDER = "ringcentral" as const;

function apiBase(): string {
  return process.env.RINGCENTRAL_ENV === "sandbox"
    ? "https://platform.devtest.ringcentral.com"
    : "https://platform.ringcentral.com";
}

const REDIRECT_URI =
  "https://driven-talent-standalone.vercel.app/api/integrations/oauth/ringcentral/callback";
const WEBHOOK_URL =
  "https://driven-talent-standalone.vercel.app/api/integrations/webhook/ringcentral";

// We subscribe to telephony session events for the connected extension.
// telephony/sessions gives us the inbound-call lifecycle (Setup ->
// Proceeding -> Answered -> Disconnected).
const SUBSCRIPTION_EVENT_FILTERS = [
  "/restapi/v1.0/account/~/telephony/sessions",
];

// Scopes are space-joined in the authorize URL. RingCentral grants the union
// of what the app is registered for; we request the superset the integration
// needs.
const OAUTH_SCOPES = [
  "ReadCallLog",
  "ReadCallRecording",
  "ReadAccounts",
  "ReadContacts",
  "Webhooks",
].join(" ");

class RingCentralClient implements IntegrationClient {
  // ---------------- OAuth ----------------
  getOAuthAuthorizeUrl(state: string): string {
    const clientId = process.env.RINGCENTRAL_CLIENT_ID ?? "";
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      state,
    });
    // Optional scope param — RingCentral derives scope from the app's
    // registered permissions, but including it makes the consent screen
    // explicit. Encoded space-separated.
    if (OAUTH_SCOPES) {
      params.set("scope", OAUTH_SCOPES);
    }
    return `${apiBase()}/restapi/oauth/authorize?${params.toString()}`;
  }

  async exchangeOAuthCode(
    code: string,
    _state: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const clientId = process.env.RINGCENTRAL_CLIENT_ID;
    const clientSecret = process.env.RINGCENTRAL_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return { ok: false, error: "missing_client_credentials" };
    }

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    });

    try {
      const res = await fetch(`${apiBase()}/restapi/oauth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          Authorization: basicAuthHeader(clientId, clientSecret),
        },
        body,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return {
          ok: false,
          error: `ringcentral_token_${res.status}: ${text.slice(0, 200)}`,
        };
      }

      const json = (await res.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        refresh_token_expires_in?: number;
        owner_id?: string;
      };

      if (!json.access_token) {
        return { ok: false, error: "no_access_token_in_response" };
      }

      const accountEmail = await fetchExtensionEmail(json.access_token).catch(
        () => null,
      );

      await storeOAuthTokens(PROVIDER, {
        access_token: json.access_token,
        refresh_token: json.refresh_token ?? null,
        expires_in_seconds: json.expires_in ?? null,
        account_email: accountEmail,
        config_patch: {
          webhook_url: WEBHOOK_URL,
          redirect_uri: REDIRECT_URI,
          owner_id: json.owner_id ?? null,
          refresh_token_expires_in: json.refresh_token_expires_in ?? null,
        },
      });

      // Best-effort: provision the telephony-sessions webhook subscription.
      // We stash the verification token (a long-lived secret RingCentral
      // echoes per event) into integrations.webhook_secret so the webhook
      // route can verify subsequent events.
      await ensureWebhookSubscription(json.access_token).catch(() => null);

      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "exchange_threw",
      };
    }
  }

  async refreshToken(
    integration: IntegrationRow,
  ): Promise<{ ok: boolean; error?: string }> {
    const refresh = integration.refresh_token;
    if (!refresh) return { ok: false, error: "no_refresh_token" };
    const clientId = process.env.RINGCENTRAL_CLIENT_ID;
    const clientSecret = process.env.RINGCENTRAL_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return { ok: false, error: "missing_client_credentials" };
    }

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refresh,
    });

    try {
      const res = await fetch(`${apiBase()}/restapi/oauth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          Authorization: basicAuthHeader(clientId, clientSecret),
        },
        body,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        await updateIntegrationStatus(PROVIDER, {
          status: "expired",
          last_error: `ringcentral_refresh_${res.status}: ${text.slice(0, 200)}`,
        });
        return { ok: false, error: `refresh_${res.status}` };
      }
      const json = (await res.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
      };
      if (!json.access_token) {
        return { ok: false, error: "no_access_token_in_refresh" };
      }
      await storeOAuthTokens(PROVIDER, {
        access_token: json.access_token,
        refresh_token: json.refresh_token ?? refresh,
        expires_in_seconds: json.expires_in ?? null,
      });
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "refresh_threw",
      };
    }
  }

  // ---------------- sync ----------------
  // Pull every inbound call since the last cursor (or last 24h on first
  // run). Upsert into inbound_calls keyed by ringcentral_id. Attempt to
  // attach recording metadata when present.
  async sync(
    integration: IntegrationRow,
  ): Promise<{ ok: boolean; count?: number; error?: string }> {
    const token = await this.ensureFreshToken(integration);
    if (!token.ok || !token.access_token) {
      return { ok: false, count: 0, error: token.error ?? "no_token" };
    }

    const cfg = (integration.config ?? {}) as Record<string, unknown>;
    const cursor =
      typeof cfg.last_call_log_cursor === "string"
        ? (cfg.last_call_log_cursor as string)
        : null;
    const dateFrom =
      cursor ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    try {
      const url =
        `${apiBase()}/restapi/v1.0/account/~/extension/~/call-log?` +
        new URLSearchParams({
          dateFrom,
          view: "Detailed",
          direction: "Inbound",
          perPage: "100",
        }).toString();

      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return {
          ok: false,
          count: 0,
          error: `ringcentral_call_log_${res.status}: ${text.slice(0, 200)}`,
        };
      }

      const json = (await res.json()) as {
        records?: RingCentralCallLogRecord[];
      };
      const records = json.records ?? [];

      const sb = createServiceClient();
      let inserted = 0;

      for (const rec of records) {
        const persisted = await upsertCallLog(sb, rec);
        if (persisted) inserted++;
      }

      const nextCursor = new Date().toISOString();
      await updateIntegrationStatus(PROVIDER, {
        config: {
          ...cfg,
          webhook_url: WEBHOOK_URL,
          last_call_log_cursor: nextCursor,
          last_sync_window_start: dateFrom,
          last_sync_records_seen: records.length,
        },
      });

      return { ok: true, count: inserted };
    } catch (e) {
      return {
        ok: false,
        count: 0,
        error: e instanceof Error ? e.message : "ringcentral_sync_threw",
      };
    }
  }

  // ---------------- webhook ----------------
  // RingCentral webhook protocol:
  //   * Initial subscription verification: a POST with a `Validation-Token`
  //     header. The route handler echoes it back as a response header. Our
  //     return value here is informational — we just acknowledge.
  //   * Subsequent events: `Verification-Token` header must match
  //     integration.webhook_secret. Payload describes the telephony
  //     session.
  async handleWebhook(
    request: Request,
  ): Promise<{ ok: boolean; error?: string }> {
    // Validation handshake — RingCentral pings the URL once when the
    // subscription is created. The route handler is responsible for
    // echoing Validation-Token; we treat the body as informational only.
    const validationToken = request.headers.get("validation-token");
    if (validationToken) {
      return { ok: true };
    }

    const raw = await request.text();

    const integration = await getIntegration(PROVIDER);
    const secret = integration?.webhook_secret ?? null;
    if (secret) {
      const provided =
        request.headers.get("verification-token") ??
        request.headers.get("Verification-Token") ??
        "";
      if (!provided) {
        return { ok: false, error: "missing_verification_token" };
      }
      const a = Buffer.from(provided);
      const b = Buffer.from(secret);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return { ok: false, error: "invalid_verification_token" };
      }
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { ok: false, error: "invalid_json" };
    }

    const body = (payload.body ?? {}) as Record<string, unknown>;
    const parties = Array.isArray(body.parties)
      ? (body.parties as Array<Record<string, unknown>>)
      : [];
    const sessionId = str(body.telephonySessionId) ?? str(body.sessionId);
    const sessionStatus = str(
      ((body.status as Record<string, unknown> | undefined) ?? {}).code,
    );

    // We only persist on Disconnected — that's when duration + recording
    // URI are knowable. Earlier states (Setup, Proceeding, Answered) are
    // informational; we ack and exit.
    if (sessionStatus && sessionStatus !== "Disconnected") {
      return { ok: true };
    }
    if (!sessionId) return { ok: true };

    // Find the inbound leg. RingCentral models each call as a session with
    // multiple parties; the inbound caller is direction='Inbound'.
    const inboundParty =
      parties.find(
        (p) => str(p.direction) === "Inbound" && p.from !== undefined,
      ) ?? parties[0];
    if (!inboundParty) return { ok: true };

    const fromObj = (inboundParty.from ?? {}) as Record<string, unknown>;
    const callerPhone = normalizePhone(
      str(fromObj.phoneNumber) ?? str(fromObj.extensionNumber),
    );
    const callerName = str(fromObj.name);
    const partyStatus = (inboundParty.status ?? {}) as Record<string, unknown>;
    const callStatusCode = str(partyStatus.code);
    const recording = inboundParty.recordings as
      | Array<Record<string, unknown>>
      | undefined;
    const recordingUri = Array.isArray(recording)
      ? str(recording[0]?.contentUri)
      : null;

    const sb = createServiceClient();

    // Look up an existing candidate / sales_lead by phone for context.
    const match = callerPhone ? await matchPhone(sb, callerPhone) : null;

    const row = {
      ringcentral_id: sessionId,
      caller_name: callerName ?? match?.name ?? "Unknown caller",
      caller_phone: callerPhone,
      caller_email: match?.email ?? null,
      called_at: new Date().toISOString(),
      taken_by: null,
      notes: match
        ? `Matched ${match.kind}: ${match.name}`
        : "Inbound call via RingCentral",
      follow_up_status: "new" as const,
      call_direction: "inbound",
      call_status: callStatusCode,
      recording_url: recordingUri,
    };

    const { error } = await sb
      .from("inbound_calls")
      .upsert(row, { onConflict: "ringcentral_id" });
    if (error) {
      return { ok: false, error: `db_${error.message.slice(0, 120)}` };
    }

    // Mirror to /inbox on a match — keeps operators in the loop.
    if (match) {
      await mirrorCallToInbox(sb, {
        candidateId: match.candidateId,
        contactId: match.contactId,
        callerName: row.caller_name,
        callerPhone: callerPhone ?? "Unknown",
        callStatus: callStatusCode ?? "Disconnected",
        recordingUrl: recordingUri,
      });
    }

    return { ok: true };
  }

  // ---------------- disconnect ----------------
  async disconnect(
    integration: IntegrationRow,
  ): Promise<{ ok: boolean; error?: string }> {
    const clientId = process.env.RINGCENTRAL_CLIENT_ID;
    const clientSecret = process.env.RINGCENTRAL_CLIENT_SECRET;
    const token = integration.access_token;

    // Best-effort revoke. We always clear local state regardless.
    if (token && clientId && clientSecret) {
      try {
        await fetch(`${apiBase()}/restapi/oauth/revoke`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: basicAuthHeader(clientId, clientSecret),
          },
          body: new URLSearchParams({ token }),
        });
      } catch {
        // ignore — local clear is the source of truth
      }
    }

    try {
      await clearIntegrationTokens(PROVIDER);
      const row = await getIntegration(PROVIDER);
      if (row) {
        await updateIntegrationStatus(PROVIDER, {
          webhook_secret: null,
          config: {
            ...(row.config ?? {}),
            webhook_url: WEBHOOK_URL,
            redirect_uri: REDIRECT_URI,
            subscription_id: null,
            last_call_log_cursor: null,
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

  // ---------------- helpers ----------------
  async ensureFreshToken(
    integration: IntegrationRow,
  ): Promise<{ ok: boolean; access_token?: string; error?: string }> {
    const now = Date.now();
    const exp = integration.token_expires_at
      ? new Date(integration.token_expires_at).getTime()
      : null;
    // RingCentral access tokens are ~1h. Refresh proactively at the 60s
    // mark to avoid mid-request expiry.
    const needsRefresh =
      !integration.access_token || (exp !== null && exp - now < 60 * 1000);

    if (!needsRefresh && integration.access_token) {
      return { ok: true, access_token: integration.access_token };
    }

    const r = await this.refreshToken(integration);
    if (!r.ok) return { ok: false, error: r.error };
    const fresh = await getIntegration(PROVIDER);
    if (!fresh?.access_token) {
      return { ok: false, error: "post_refresh_no_token" };
    }
    return { ok: true, access_token: fresh.access_token };
  }
}

// ---------------- module-private helpers ----------------

interface RingCentralCallLogRecord {
  id?: string;
  sessionId?: string;
  startTime?: string;
  duration?: number;
  direction?: string;
  type?: string;
  from?: { phoneNumber?: string; name?: string };
  to?: { phoneNumber?: string; name?: string };
  result?: string;
  recording?: { id?: string; uri?: string; contentUri?: string };
  message?: { transcription?: string };
}

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return (
    "Basic " +
    Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64")
  );
}

function normalizePhone(raw: string | null): string | null {
  if (!raw) return null;
  // RingCentral returns E.164 in most cases. Keep digits + leading + for
  // matching against candidate.phone (which is stored loosely).
  const cleaned = raw.replace(/[^0-9+]/g, "");
  return cleaned || null;
}

async function fetchExtensionEmail(
  accessToken: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `${apiBase()}/restapi/v1.0/account/~/extension/~`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      contact?: { email?: string };
      name?: string;
    };
    return json.contact?.email ?? null;
  } catch {
    return null;
  }
}

async function ensureWebhookSubscription(accessToken: string): Promise<void> {
  // Check for an existing subscription pointing at our webhook URL.
  const listRes = await fetch(`${apiBase()}/restapi/v1.0/subscription`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  }).catch(() => null);

  let existingId: string | null = null;
  if (listRes && listRes.ok) {
    const json = (await listRes.json()) as {
      records?: Array<{
        id?: string;
        deliveryMode?: { address?: string };
        status?: string;
      }>;
    };
    const match = (json.records ?? []).find(
      (r) =>
        r.deliveryMode?.address === WEBHOOK_URL && r.status !== "Disabled",
    );
    if (match?.id) existingId = match.id;
  }
  if (existingId) {
    await updateIntegrationStatus(PROVIDER, {
      config: { subscription_id: existingId, webhook_url: WEBHOOK_URL },
    });
    return;
  }

  // RingCentral lets the client supply a `verificationToken` it then echoes
  // back on every event in the `Verification-Token` header. We generate one
  // here and persist it as integrations.webhook_secret so handleWebhook can
  // verify subsequent posts.
  const verificationToken = randomToken(40);

  const subRes = await fetch(`${apiBase()}/restapi/v1.0/subscription`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      eventFilters: SUBSCRIPTION_EVENT_FILTERS,
      deliveryMode: {
        transportType: "WebHook",
        address: WEBHOOK_URL,
        verificationToken,
      },
      expiresIn: 60 * 60 * 24 * 7, // 7 days — RingCentral max for WebHook
    }),
  });

  if (!subRes.ok) return;
  const json = (await subRes.json()) as { id?: string };
  await updateIntegrationStatus(PROVIDER, {
    webhook_secret: verificationToken,
    config: {
      subscription_id: json.id ?? null,
      webhook_url: WEBHOOK_URL,
    },
  });
}

function randomToken(len: number): string {
  const bytes = Buffer.alloc(len);
  for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
  return bytes.toString("base64url");
}

async function upsertCallLog(
  sb: ReturnType<typeof createServiceClient>,
  rec: RingCentralCallLogRecord,
): Promise<boolean> {
  const ringId = rec.sessionId ?? rec.id;
  if (!ringId) return false;
  if (rec.direction && rec.direction !== "Inbound") return false;

  const phone = normalizePhone(rec.from?.phoneNumber ?? null);
  const callerName = rec.from?.name ?? null;
  const recordingUri = rec.recording?.contentUri ?? rec.recording?.uri ?? null;
  const voicemail = rec.message?.transcription ?? null;

  const match = phone ? await matchPhone(sb, phone) : null;

  const row = {
    ringcentral_id: ringId,
    caller_name: callerName ?? match?.name ?? "Unknown caller",
    caller_phone: phone,
    caller_email: match?.email ?? null,
    called_at: rec.startTime ?? new Date().toISOString(),
    taken_by: null,
    notes: match
      ? `Matched ${match.kind}: ${match.name}`
      : "Imported via RingCentral sync",
    follow_up_status: "new" as const,
    call_direction: "inbound",
    call_status: rec.result ?? null,
    call_duration_seconds: rec.duration ?? null,
    recording_url: recordingUri,
    voicemail_transcription: voicemail,
  };

  const { error } = await sb
    .from("inbound_calls")
    .upsert(row, { onConflict: "ringcentral_id" });
  return !error;
}

type PhoneMatch = {
  kind: "candidate" | "sales_lead";
  name: string;
  email: string | null;
  candidateId: string | null;
  contactId: string | null;
};

async function matchPhone(
  sb: ReturnType<typeof createServiceClient>,
  phone: string,
): Promise<PhoneMatch | null> {
  const last7 = phone.replace(/[^0-9]/g, "").slice(-7);
  if (!last7) return null;

  // Try candidates first (richest context).
  const { data: cand } = await sb
    .from("candidates")
    .select("id, full_name, email, phone")
    .ilike("phone", `%${last7}%`)
    .limit(1)
    .maybeSingle();
  if (cand) {
    return {
      kind: "candidate",
      name: (cand.full_name as string) ?? "Candidate",
      email: (cand.email as string | null) ?? null,
      candidateId: cand.id as string,
      contactId: null,
    };
  }

  // Then sales_leads.
  const { data: lead } = await sb
    .from("sales_leads")
    .select("id, contact_name, email, phone")
    .ilike("phone", `%${last7}%`)
    .limit(1)
    .maybeSingle();
  if (lead) {
    return {
      kind: "sales_lead",
      name: (lead.contact_name as string) ?? "Sales lead",
      email: (lead.email as string | null) ?? null,
      candidateId: null,
      contactId: null,
    };
  }

  return null;
}

async function mirrorCallToInbox(
  sb: ReturnType<typeof createServiceClient>,
  args: {
    candidateId: string | null;
    contactId: string | null;
    callerName: string;
    callerPhone: string;
    callStatus: string;
    recordingUrl: string | null;
  },
): Promise<void> {
  const subject = `Inbound call: ${args.callerName} (${args.callerPhone})`;

  const insertBody: Record<string, unknown> = {
    subject,
    status: "open",
    channel: "phone",
  };
  if (args.candidateId) insertBody.candidate_id = args.candidateId;
  if (args.contactId) insertBody.contact_id = args.contactId;

  const { data: convo } = await sb
    .from("conversations")
    .insert(insertBody)
    .select("id")
    .single();
  if (!convo) return;

  await sb.from("messages").insert({
    conversation_id: convo.id,
    sender_type: "system",
    sender_name: "RingCentral",
    body:
      `${args.callerName} called from ${args.callerPhone}.` +
      `\nCall status: ${args.callStatus}` +
      (args.recordingUrl ? `\nRecording: ${args.recordingUrl}` : ""),
    read: false,
  });
}

export const ringcentralClient = new RingCentralClient();

export { RingCentralClient, REDIRECT_URI, WEBHOOK_URL };