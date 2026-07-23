// Calendly integration — OAuth 2.0 + scheduled-event webhook + embedded
// public-site InlineWidget on /contact.
//
// Flow:
//
//   1. OAuth     — admin clicks Connect on /integrations → /calendly card.
//                  We bounce through Calendly's authorize URL, exchange the
//                  returned code for an access + refresh token, store both
//                  on the integrations row via storeOAuthTokens(). We also
//                  pull `/users/me` to discover the connected user's
//                  scheduling_url and stash it in integration.config so the
//                  public site can render the InlineWidget against it.
//   2. Webhook   — Calendly POSTs scheduled-event lifecycle events to
//                  /api/integrations/webhook/calendly. We verify the
//                  HMAC-SHA256 Calendly-Webhook-Signature header against
//                  integrations.webhook_secret (the per-subscription
//                  signing_key returned by /webhook_subscriptions) and on
//                  `invitee.created` look up a candidate or contact by
//                  invitee email — if found, log the booking in /inbox; if
//                  not, create a fresh contact + conversation. On
//                  `invitee.canceled` we surface the cancellation in the
//                  same conversation.
//   3. sync()    — best-effort 24h delta pull of scheduled events to catch
//                  any webhook drops. Same email-keyed reconciliation as
//                  the webhook path.
//
// Embedded widget — the PUBLIC site (driven-talent-site) renders Calendly's
// InlineWidget on /contact pointing at integration.config.scheduling_url.
// The widget itself is plain markup:
//
//   <div className="calendly-inline-widget" data-url={url} style={{minWidth:320, height:700}} />
//   <Script src="https://assets.calendly.com/assets/external/widget.js" strategy="afterInteractive" />
//
// The booking happens on Calendly's side and we receive a webhook.
//
// Auth mode is "oauth" in types.ts.  CALENDLY_CLIENT_ID + CALENDLY_CLIENT_SECRET
// must be set in Vercel (see dashboard setup checklist in the report).

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import {
  getIntegration,
  storeOAuthTokens,
  updateIntegrationStatus,
  clearIntegrationTokens,
} from "../db";
import { describeError } from "../describe-error";
import { requireWebhookSecret } from "../webhook-auth";
import type { IntegrationClient, IntegrationRow } from "../types";
import {
  decideInterviewWriteback,
  type InterviewWritebackDecision,
} from "../calendly-interview";
import { normalizeEmail } from "@/lib/duplicates";
import { appBaseUrl, oauthCallbackUrl, webhookUrl } from "@/lib/app-url";

// Built from the one base-URL source (src/lib/app-url.ts) rather than typed
// out here. A domain switch used to mean editing eight literals across five
// provider files, and forgetting one broke that integration silently.
const APP_BASE_URL = appBaseUrl();

const PROVIDER = "calendly" as const;

const AUTHORIZE_URL = "https://auth.calendly.com/oauth/authorize";
const TOKEN_URL = "https://auth.calendly.com/oauth/token";
const API_BASE = "https://api.calendly.com";

const REDIRECT_URI = oauthCallbackUrl(APP_BASE_URL, "calendly");
const WEBHOOK_URL = webhookUrl(APP_BASE_URL, "calendly");

class CalendlyClient implements IntegrationClient {
  // ---------------- OAuth ----------------
  getOAuthAuthorizeUrl(state: string): string {
    const clientId = process.env.CALENDLY_CLIENT_ID ?? "";
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: REDIRECT_URI,
      state,
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  async exchangeOAuthCode(
    code: string,
    _state: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const clientId = process.env.CALENDLY_CLIENT_ID;
    const clientSecret = process.env.CALENDLY_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return { ok: false, error: "missing_client_credentials" };
    }

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: REDIRECT_URI,
    });

    try {
      const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return {
          ok: false,
          error: `calendly_token_${res.status}: ${text.slice(0, 200)}`,
        };
      }

      const json = (await res.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        token_type?: string;
        owner?: string;
        organization?: string;
      };

      if (!json.access_token) {
        return { ok: false, error: "no_access_token_in_response" };
      }

      const me = await fetchCurrentUser(json.access_token).catch(() => null);

      await storeOAuthTokens(PROVIDER, {
        access_token: json.access_token,
        refresh_token: json.refresh_token ?? null,
        expires_in_seconds: json.expires_in ?? null,
        account_email: me?.email ?? null,
        config_patch: {
          webhook_url: WEBHOOK_URL,
          redirect_uri: REDIRECT_URI,
          scheduling_url: me?.scheduling_url ?? null,
          user_uri: json.owner ?? me?.uri ?? null,
          organization_uri:
            json.organization ?? me?.current_organization ?? null,
        },
      });

      // Best-effort: create the webhook subscription if we don't already
      // have one. Calendly returns a `signing_key` once per subscription;
      // we stash it on integrations.webhook_secret. Failures non-fatal.
      await ensureWebhookSubscription(
        json.access_token,
        json.organization ?? me?.current_organization ?? null,
        json.owner ?? me?.uri ?? null,
      ).catch(() => null);

      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        error: describeError(e, "exchange_threw"),
      };
    }
  }

  async refreshToken(
    integration: IntegrationRow,
  ): Promise<{ ok: boolean; error?: string }> {
    const refresh = integration.refresh_token;
    if (!refresh) return { ok: false, error: "no_refresh_token" };
    const clientId = process.env.CALENDLY_CLIENT_ID;
    const clientSecret = process.env.CALENDLY_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return { ok: false, error: "missing_client_credentials" };
    }

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refresh,
    });

    try {
      const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        await updateIntegrationStatus(PROVIDER, {
          status: "expired",
          last_error: `calendly_refresh_${res.status}: ${text.slice(0, 200)}`,
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
        error: describeError(e, "refresh_threw"),
      };
    }
  }

  // ---------------- sync ----------------
  async sync(
    integration: IntegrationRow,
  ): Promise<{ ok: boolean; count?: number; error?: string }> {
    const token = await this.ensureFreshToken(integration);
    if (!token.ok || !token.access_token) {
      return { ok: false, count: 0, error: token.error ?? "no_token" };
    }

    const cfg = (integration.config ?? {}) as Record<string, unknown>;
    let userUri = typeof cfg.user_uri === "string" ? cfg.user_uri : null;
    if (!userUri) {
      const me = await fetchCurrentUser(token.access_token).catch(() => null);
      if (me?.uri) {
        userUri = me.uri;
        await updateIntegrationStatus(PROVIDER, {
          config: {
            ...cfg,
            webhook_url: WEBHOOK_URL,
            user_uri: me.uri,
            organization_uri: me.current_organization,
            scheduling_url: me.scheduling_url ?? cfg.scheduling_url ?? null,
          },
        });
      } else {
        return { ok: false, count: 0, error: "missing_user_uri" };
      }
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    try {
      const url =
        `${API_BASE}/scheduled_events?` +
        new URLSearchParams({
          user: userUri,
          min_start_time: since,
          count: "100",
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
          error: `calendly_list_${res.status}: ${text.slice(0, 200)}`,
        };
      }

      const json = (await res.json()) as {
        collection?: Array<{
          uri?: string;
          name?: string;
          status?: string;
          start_time?: string;
          end_time?: string;
        }>;
      };
      const events = json.collection ?? [];
      let reconciled = 0;

      const sb = createServiceClient();
      for (const evt of events) {
        if (!evt.uri) continue;
        const invRes = await fetch(`${evt.uri}/invitees?count=10`, {
          headers: {
            Authorization: `Bearer ${token.access_token}`,
            Accept: "application/json",
          },
        });
        if (!invRes.ok) continue;
        const invJson = (await invRes.json()) as {
          collection?: Array<{
            email?: string;
            name?: string;
            status?: string;
          }>;
        };
        const invitees = invJson.collection ?? [];
        for (const inv of invitees) {
          if (!inv.email) continue;
          const logged = await reconcileBooking(sb, {
            email: inv.email,
            inviteeName: inv.name ?? inv.email,
            eventName: evt.name ?? "Calendly booking",
            startTime: evt.start_time ?? null,
            endTime: evt.end_time ?? null,
            status: inv.status ?? evt.status ?? "active",
            source: "sync",
          });
          if (logged) reconciled++;
        }
      }

      await updateIntegrationStatus(PROVIDER, {
        config: {
          ...(integration.config ?? {}),
          webhook_url: WEBHOOK_URL,
          last_sync_window_start: since,
          last_sync_events_seen: events.length,
        },
      });

      return { ok: true, count: reconciled };
    } catch (e) {
      return {
        ok: false,
        count: 0,
        error: describeError(e, "calendly_sync_threw"),
      };
    }
  }

  // ---------------- webhook ----------------
  async handleWebhook(
    request: Request,
  ): Promise<{ ok: boolean; error?: string }> {
    const raw = await request.text();

    const integration = await getIntegration(PROVIDER);

    // Fail closed. This path is allowlisted in the proxy, so an unset secret
    // would make it an open write endpoint — see webhook-auth.ts.
    const gate = requireWebhookSecret(integration?.webhook_secret);
    if (!gate.ok) return { ok: false, error: gate.error };
    const secret = gate.secret;

    const sigHeader =
      request.headers.get("calendly-webhook-signature") ??
      request.headers.get("Calendly-Webhook-Signature") ??
      "";
    if (!sigHeader) {
      return { ok: false, error: "missing_signature" };
    }
    const parts: Record<string, string> = {};
    for (const p of sigHeader.split(",")) {
      const eq = p.indexOf("=");
      if (eq === -1) continue;
      const k = p.slice(0, eq).trim();
      const v = p.slice(eq + 1).trim();
      if (k) parts[k] = v;
    }
    const t = parts["t"];
    const v1 = parts["v1"];
    if (!t || !v1) {
      return { ok: false, error: "malformed_signature" };
    }
    const expected = createHmac("sha256", secret)
      .update(`${t}.${raw}`)
      .digest("hex");
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(v1, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, error: "invalid_signature" };
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { ok: false, error: "invalid_json" };
    }

    const event = str(payload.event);
    const data = (payload.payload ?? {}) as Record<string, unknown>;
    if (!event) return { ok: true };

    const inviteeEmail = str(data.email);
    const inviteeName = str(data.name) ?? inviteeEmail ?? "Unknown invitee";
    const status = str(data.status);
    const scheduledEvent = (data.scheduled_event ?? {}) as Record<
      string,
      unknown
    >;
    const eventName = str(scheduledEvent.name) ?? "Calendly booking";
    const startTime = str(scheduledEvent.start_time);
    const endTime = str(scheduledEvent.end_time);
    const cancelReason = str(
      (data.cancellation as Record<string, unknown> | undefined)?.reason,
    );

    if (!inviteeEmail) return { ok: true };

    const sb = createServiceClient();

    if (event === "invitee.created") {
      await reconcileBooking(sb, {
        email: inviteeEmail,
        inviteeName,
        eventName,
        startTime,
        endTime,
        status: status ?? "active",
        source: "webhook",
      });
      // Write-back the interview onto the matched candidate (runbook Phase A).
      await applyInterviewWriteback(sb, {
        email: inviteeEmail,
        eventType: "created",
        incomingStart: startTime,
      });
    } else if (event === "invitee.canceled") {
      await reconcileCancellation(sb, {
        email: inviteeEmail,
        inviteeName,
        eventName,
        startTime,
        reason: cancelReason,
      });
      await applyInterviewWriteback(sb, {
        email: inviteeEmail,
        eventType: "canceled",
        incomingStart: startTime,
      });
    }

    return { ok: true };
  }

  // ---------------- disconnect ----------------
  async disconnect(
    _integration: IntegrationRow,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      await clearIntegrationTokens(PROVIDER);
      const row = await getIntegration(PROVIDER);
      if (row) {
        const cfg = (row.config ?? {}) as Record<string, unknown>;
        await updateIntegrationStatus(PROVIDER, {
          config: {
            ...cfg,
            webhook_url: WEBHOOK_URL,
            redirect_uri: REDIRECT_URI,
            user_uri: null,
            organization_uri: null,
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

  // ---------------- helpers ----------------
  async ensureFreshToken(
    integration: IntegrationRow,
  ): Promise<{ ok: boolean; access_token?: string; error?: string }> {
    const now = Date.now();
    const exp = integration.token_expires_at
      ? new Date(integration.token_expires_at).getTime()
      : null;
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

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

async function fetchCurrentUser(
  accessToken: string,
): Promise<{
  uri: string;
  email: string;
  scheduling_url: string;
  current_organization: string;
} | null> {
  try {
    const res = await fetch(`${API_BASE}/users/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      resource?: {
        uri?: string;
        email?: string;
        scheduling_url?: string;
        current_organization?: string;
      };
    };
    const r = json.resource;
    if (!r?.uri || !r.email) return null;
    return {
      uri: r.uri,
      email: r.email,
      scheduling_url: r.scheduling_url ?? "",
      current_organization: r.current_organization ?? "",
    };
  } catch {
    return null;
  }
}

async function ensureWebhookSubscription(
  accessToken: string,
  organization: string | null,
  user: string | null,
): Promise<void> {
  if (!organization) return;
  const listUrl =
    `${API_BASE}/webhook_subscriptions?` +
    new URLSearchParams({
      organization,
      scope: "organization",
      count: "100",
    }).toString();
  const existing = await fetch(listUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  }).catch(() => null);
  if (existing && existing.ok) {
    const json = (await existing.json()) as {
      collection?: Array<{ callback_url?: string; uri?: string }>;
    };
    const already = (json.collection ?? []).some(
      (s) => s.callback_url === WEBHOOK_URL,
    );
    if (already) return;
  }

  const body: Record<string, unknown> = {
    url: WEBHOOK_URL,
    events: ["invitee.created", "invitee.canceled"],
    organization,
    scope: "organization",
  };
  if (user) body.user = user;

  const res = await fetch(`${API_BASE}/webhook_subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return;
  const json = (await res.json()) as {
    resource?: { signing_key?: string; uri?: string };
  };
  const signingKey = json.resource?.signing_key;
  if (signingKey) {
    await updateIntegrationStatus(PROVIDER, {
      webhook_secret: signingKey,
    });
  }
}

async function reconcileBooking(
  sb: ReturnType<typeof createServiceClient>,
  args: {
    email: string;
    inviteeName: string;
    eventName: string;
    startTime: string | null;
    endTime: string | null;
    status: string;
    source: "webhook" | "sync";
  },
): Promise<boolean> {
  const { data: candidate } = await sb
    .from("candidates")
    .select("id, full_name, email, status")
    .eq("email", args.email)
    .maybeSingle();

  let contactId: string | null = null;
  if (!candidate) {
    const { data: contact } = await sb
      .from("contacts")
      .select("id")
      .eq("email", args.email)
      .maybeSingle();
    if (contact) {
      contactId = contact.id as string;
    } else {
      const { data: created } = await sb
        .from("contacts")
        .insert({
          full_name: args.inviteeName,
          email: args.email,
          phone: null,
          type: "lead",
          source: "Calendly",
          notes: `Booked via Calendly: ${args.eventName}`,
        })
        .select("id")
        .single();
      contactId = (created?.id as string | undefined) ?? null;
    }
  }

  const subject = `Meeting Scheduled: ${args.eventName}`;
  const startStr = args.startTime
    ? new Date(args.startTime).toUTCString()
    : "TBD";
  const body =
    `${args.inviteeName} booked "${args.eventName}" via Calendly.\n` +
    `Start: ${startStr}` +
    (args.endTime ? `\nEnd: ${new Date(args.endTime).toUTCString()}` : "") +
    (candidate ? `\nMatched candidate: ${candidate.full_name}` : "") +
    `\nStatus: ${args.status}` +
    `\nSource: ${args.source}`;

  let convoQuery = sb
    .from("conversations")
    .select("id")
    .eq("subject", subject)
    .limit(1);
  if (candidate) {
    convoQuery = convoQuery.eq("candidate_id", candidate.id);
  } else if (contactId) {
    convoQuery = convoQuery.eq("contact_id", contactId);
  }
  const { data: existingConvo } = await convoQuery.maybeSingle();

  let convoId: string | null = (existingConvo?.id as string | undefined) ?? null;
  if (!convoId) {
    const insertBody: Record<string, unknown> = {
      subject,
      status: "open",
      channel: "application",
    };
    if (candidate) insertBody.candidate_id = candidate.id;
    if (contactId) insertBody.contact_id = contactId;
    const { data: created } = await sb
      .from("conversations")
      .insert(insertBody)
      .select("id")
      .single();
    convoId = (created?.id as string | undefined) ?? null;
  }

  if (!convoId) return false;

  // sender_type must be a valid message_sender_type enum value
  // ('visitor' | 'agent' | 'bot'). "system" is NOT in the enum, so this insert
  // failed silently and the Calendly conversation appeared in the Inbox with an
  // empty thread (staff could open the chat but saw no messages). Use 'bot' for
  // system-generated notes. (DT feedback fix 2026-06-15)
  await sb.from("messages").insert({
    conversation_id: convoId,
    sender_type: "bot",
    sender_name: "Calendly",
    body,
    read: false,
  });

  return true;
}

// Write-back the interview schedule onto the matched candidate (runbook Phase A).
// Sets ONLY interview_scheduled + interview_at, never the human-judgment fields.
// All guards live in decideInterviewWriteback (pure, unit-tested). Fail-safe:
// any error is logged and swallowed so the webhook never 500s a booking.
async function applyInterviewWriteback(
  sb: ReturnType<typeof createServiceClient>,
  args: { email: string; eventType: "created" | "canceled"; incomingStart: string | null },
): Promise<InterviewWritebackDecision> {
  try {
    // Match on the NORMALIZED email (migration 0046) so records that differ only
    // by case/spacing are recognized as the same human. Before this, text
    // equality was case-sensitive, so a booking matched exactly one of a
    // duplicated pair and silently wrote to it while the twin stayed blank — a
    // split-brain nobody could see. Now such a booking is correctly ambiguous
    // and is refused loudly instead of guessing a twin.
    //
    // Falls back to exact match when the normalized column isn't there yet
    // (migrations are applied by hand, so this code can be live before 0046).
    const normalized = normalizeEmail(args.email);
    let rows: { id: string; interview_at: string | null }[] | null = null;
    if (normalized) {
      const { data, error } = await sb
        .from("candidates")
        .select("id, interview_at")
        .eq("email_normalized", normalized);
      if (!error) rows = (data ?? []) as { id: string; interview_at: string | null }[];
    }
    if (rows === null) {
      const { data } = await sb
        .from("candidates")
        .select("id, interview_at")
        .eq("email", args.email);
      rows = (data ?? []) as { id: string; interview_at: string | null }[];
    }

    const decision = decideInterviewWriteback({
      eventType: args.eventType,
      matchCount: rows.length,
      currentInterviewAt: rows.length === 1 ? rows[0].interview_at : null,
      incomingStart: args.incomingStart,
    });

    if (decision.action === "skip") {
      console.log(
        `[calendly-writeback] skip (${decision.reason}) for ${args.email} matches=${rows.length}`,
      );
      // MAKE THE SILENT SKIP LOUD. An ambiguous match means a real booking
      // produced no interview record. Previously that vanished into stdout.
      // Record it on EVERY matched candidate's Change Log so a recruiter opening
      // either twin sees why their interview never appeared.
      if (decision.reason === "ambiguous_email_match" && rows.length > 1) {
        for (const r of rows) {
          try {
            await sb.from("activity_log").insert({
              subject_type: "candidate",
              subject_id: r.id,
              actor_id: null,
              actor_name: "calendly-webhook",
              action: "interview_sync_blocked_duplicate",
              summary: `Calendly booking could not be applied: ${rows.length} candidate records share this email, so the interview was not written to avoid updating the wrong person. Merge the duplicates to re-enable interview sync.`,
              field: "interview_at",
              old_value: null,
              new_value: null,
              meta: {
                source: "calendly-webhook",
                reason: decision.reason,
                match_count: rows.length,
                duplicate_candidate_ids: rows.map((x) => x.id),
              },
            });
          } catch (logErr) {
            console.error("[calendly-writeback] duplicate-skip log failed:", logErr);
          }
        }
      }
      return decision;
    }

    const candidateId = rows[0].id;
    const oldValue = rows[0].interview_at;
    const patch =
      decision.action === "set"
        ? { interview_scheduled: true, interview_at: decision.interviewAt }
        : { interview_scheduled: false, interview_at: null };

    const { error: updErr } = await sb
      .from("candidates")
      .update(patch)
      .eq("id", candidateId);
    if (updErr) {
      console.error("[calendly-writeback] update failed:", updErr.message);
      return { action: "skip", reason: "update_failed" };
    }

    // Guard 3 — log every write to activity_log with actor 'calendly-webhook'.
    // Best-effort: a logging failure must not undo the write or break the hook.
    try {
      await sb.from("activity_log").insert({
        subject_type: "candidate",
        subject_id: candidateId,
        actor_id: null,
        actor_name: "calendly-webhook",
        action: decision.action === "set" ? "interview_scheduled" : "interview_canceled",
        summary:
          decision.action === "set"
            ? `Calendly booking set the interview to ${new Date(decision.interviewAt).toLocaleString("en-US")}`
            : "Calendly cancellation cleared the interview",
        field: "interview_at",
        old_value: oldValue,
        new_value: decision.action === "set" ? decision.interviewAt : null,
        meta: { source: "calendly-webhook" },
      });
    } catch (logErr) {
      console.error("[calendly-writeback] activity_log insert threw:", logErr);
    }

    return decision;
  } catch (e) {
    console.error(
      "[calendly-writeback] threw (non-fatal):",
      e instanceof Error ? e.message : String(e),
    );
    return { action: "skip", reason: "exception" };
  }
}

async function reconcileCancellation(
  sb: ReturnType<typeof createServiceClient>,
  args: {
    email: string;
    inviteeName: string;
    eventName: string;
    startTime: string | null;
    reason: string | null;
  },
): Promise<void> {
  const subject = `Meeting Scheduled: ${args.eventName}`;
  const { data: convo } = await sb
    .from("conversations")
    .select("id")
    .eq("subject", subject)
    .limit(1)
    .maybeSingle();
  if (!convo) return;
  // 'system' is not a valid message_sender_type enum value -> insert would fail
  // silently and the cancellation note would never show. (DT feedback fix)
  await sb.from("messages").insert({
    conversation_id: convo.id,
    sender_type: "bot",
    sender_name: "Calendly",
    body:
      `${args.inviteeName} CANCELED "${args.eventName}".` +
      (args.reason ? `\nReason: ${args.reason}` : "") +
      (args.startTime
        ? `\nOriginally scheduled: ${new Date(args.startTime).toUTCString()}`
        : ""),
    read: false,
  });
}

export const calendlyClient = new CalendlyClient();

export { CalendlyClient, REDIRECT_URI, WEBHOOK_URL };
