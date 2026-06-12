// PandaDoc integration — OAuth 2.0 + document-status webhook + onboarding-doc send.
//
// Flow:
//
//   1. OAuth     — admin clicks Connect on /integrations → /pandadoc card.
//                  We bounce through PandaDoc's authorize URL, exchange the
//                  returned code for an access + refresh token, store both
//                  on the integrations row via storeOAuthTokens().
//   2. Send doc  — operator clicks "Send Onboarding Doc" on a candidate at
//                  stage='offer'. Server action calls PandaDoc /documents
//                  with `template_uuid = integration.config.onboarding_template_id`
//                  and pre-fills {{candidate_name}} / {{candidate_email}}.
//                  The returned document.id is stashed on candidates.pandadoc_document_id
//                  so the webhook can map back to the candidate.
//   3. Webhook   — PandaDoc POSTs status updates to
//                  /api/integrations/webhook/pandadoc. We verify the
//                  HMAC-SHA256 X-Signature against integrations.webhook_secret,
//                  parse the event array, and on `document_state_changed →
//                  document.completed` flip the matching candidate from
//                  stage='offer' → 'hired'. On `document.declined` we surface
//                  the doc to /inbox as a conversation for the operator.
//   4. sync()    — best-effort 24h delta pull of recent documents to catch
//                  any webhook drops. Updates the same candidate rows.
//
// Auth mode is "oauth" in types.ts.  PANDADOC_CLIENT_ID + PANDADOC_CLIENT_SECRET
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
import type { IntegrationClient, IntegrationRow } from "../types";

const PROVIDER = "pandadoc" as const;

const AUTHORIZE_URL = "https://app.pandadoc.com/oauth2/authorize";
const TOKEN_URL = "https://api.pandadoc.com/oauth2/access_token";
const API_BASE = "https://api.pandadoc.com";

const REDIRECT_URI =
  "https://driven-talent-standalone.vercel.app/api/integrations/oauth/pandadoc/callback";
const WEBHOOK_URL =
  "https://driven-talent-standalone.vercel.app/api/integrations/webhook/pandadoc";

// PandaDoc requires `read+write` scope to create + send docs and to receive
// webhooks for status changes.
const SCOPES = "read+write";

class PandaDocClient implements IntegrationClient {
  // ---------------- OAuth ----------------
  getOAuthAuthorizeUrl(state: string): string {
    const clientId = process.env.PANDADOC_CLIENT_ID ?? "";
    // PandaDoc's authorize URL expects scope=read+write as a literal + (URL
    // builders would double-encode it as %2B — we build the string manually
    // for that reason).
    const params = [
      `client_id=${encodeURIComponent(clientId)}`,
      `redirect_uri=${encodeURIComponent(REDIRECT_URI)}`,
      `scope=${SCOPES}`,
      `response_type=code`,
      `state=${encodeURIComponent(state)}`,
    ].join("&");
    return `${AUTHORIZE_URL}?${params}`;
  }

  async exchangeOAuthCode(
    code: string,
    _state: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const clientId = process.env.PANDADOC_CLIENT_ID;
    const clientSecret = process.env.PANDADOC_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return {
        ok: false,
        error: "missing_client_credentials",
      };
    }

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      scope: "read write",
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
          error: `pandadoc_token_${res.status}: ${text.slice(0, 200)}`,
        };
      }

      const json = (await res.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        scope?: string;
      };

      if (!json.access_token) {
        return { ok: false, error: "no_access_token_in_response" };
      }

      // Best-effort: pull the account email so the /integrations card shows
      // who's connected. Failures here are non-fatal.
      const accountEmail = await fetchAccountEmail(json.access_token).catch(
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
        },
      });

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
    const clientId = process.env.PANDADOC_CLIENT_ID;
    const clientSecret = process.env.PANDADOC_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return { ok: false, error: "missing_client_credentials" };
    }

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refresh,
      scope: "read write",
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
          last_error: `pandadoc_refresh_${res.status}: ${text.slice(0, 200)}`,
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
  // Best-effort delta poll: pull documents modified in the last 24h and
  // reconcile candidate stages. Webhooks are the primary signal; this is
  // the safety net for missed events.
  async sync(
    integration: IntegrationRow,
  ): Promise<{ ok: boolean; count?: number; error?: string }> {
    const token = await this.ensureFreshToken(integration);
    if (!token.ok || !token.access_token) {
      return { ok: false, count: 0, error: token.error ?? "no_token" };
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    try {
      const url =
        `${API_BASE}/public/v1/documents?` +
        new URLSearchParams({
          status_modified_gte: since,
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
          error: `pandadoc_list_${res.status}: ${text.slice(0, 200)}`,
        };
      }

      const json = (await res.json()) as {
        results?: Array<{
          id?: string;
          status?: string;
          name?: string;
          date_status_changed?: string;
        }>;
      };
      const results = json.results ?? [];

      const sb = createServiceClient();
      let reconciled = 0;

      for (const doc of results) {
        if (!doc.id || !doc.status) continue;
        const candUpdate = candidateUpdateForStatus(doc.status);
        if (!candUpdate) continue;
        const { data: cand } = await sb
          .from("candidates")
          .select("id, status")
          .eq("pandadoc_document_id", doc.id)
          .maybeSingle();
        if (!cand) continue;
        if (
          candUpdate.status === "hired" &&
          cand.status !== "offer" &&
          cand.status !== "hired"
        ) {
          continue;
        }
        await sb
          .from("candidates")
          .update({
            status: candUpdate.status,
            pandadoc_document_status: doc.status,
          })
          .eq("id", cand.id);
        reconciled++;
      }

      await updateIntegrationStatus(PROVIDER, {
        config: {
          ...(integration.config ?? {}),
          webhook_url: WEBHOOK_URL,
          last_sync_window_start: since,
          last_sync_docs_seen: results.length,
        },
      });

      return { ok: true, count: reconciled };
    } catch (e) {
      return {
        ok: false,
        count: 0,
        error: e instanceof Error ? e.message : "pandadoc_sync_threw",
      };
    }
  }

  // ---------------- webhook ----------------
  // PandaDoc payloads are arrays of events. Signature header is
  // X-Signature (or x-pandadoc-signature) = HMAC-SHA256(webhook_secret, raw_body)
  // hex-encoded. If no secret is configured, we skip verification (dev mode)
  // but still process — the route handler won't reach this path during
  // production once the secret is set.
  async handleWebhook(
    request: Request,
  ): Promise<{ ok: boolean; error?: string }> {
    const raw = await request.text();

    const integration = await getIntegration(PROVIDER);
    const secret = integration?.webhook_secret ?? null;
    if (secret) {
      const sigHeader =
        request.headers.get("x-signature") ??
        request.headers.get("x-pandadoc-signature") ??
        "";
      if (!sigHeader) {
        return { ok: false, error: "missing_signature" };
      }
      const expected = createHmac("sha256", secret).update(raw).digest("hex");
      const a = Buffer.from(expected, "hex");
      const candidates = [
        Buffer.from(sigHeader.replace(/^sha256=/, ""), "hex"),
        Buffer.from(sigHeader.replace(/^sha256=/, ""), "base64"),
      ];
      const valid = candidates.some(
        (c) => c.length === a.length && timingSafeEqual(c, a),
      );
      if (!valid) return { ok: false, error: "invalid_signature" };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return { ok: false, error: "invalid_json" };
    }

    const events: Array<Record<string, unknown>> = Array.isArray(payload)
      ? (payload as Array<Record<string, unknown>>)
      : [payload as Record<string, unknown>];

    const sb = createServiceClient();

    for (const evt of events) {
      const event = str(evt.event);
      const data = (evt.data ?? {}) as Record<string, unknown>;
      const docId = str(data.id);
      const docStatus = str(data.status);
      const docName = str(data.name);
      if (!docId) continue;

      const { data: cand } = await sb
        .from("candidates")
        .select("id, full_name, email, status")
        .eq("pandadoc_document_id", docId)
        .maybeSingle();

      if (cand && docStatus) {
        await sb
          .from("candidates")
          .update({ pandadoc_document_status: docStatus })
          .eq("id", cand.id);
      }

      if (
        cand &&
        (event === "document_state_changed" || event === "document_completed") &&
        docStatus === "document.completed"
      ) {
        if (cand.status === "offer") {
          await sb
            .from("candidates")
            .update({ status: "hired" })
            .eq("id", cand.id);
        }
      }

      if (
        cand &&
        ((event === "document_state_changed" && docStatus === "document.declined") ||
          event === "document_declined")
      ) {
        await mirrorDeclineToInbox(sb, {
          candidateId: cand.id,
          fullName: cand.full_name,
          email: cand.email,
          docName,
        });
      }
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
        await updateIntegrationStatus(PROVIDER, {
          config: {
            ...(row.config ?? {}),
            webhook_url: WEBHOOK_URL,
            redirect_uri: REDIRECT_URI,
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

  // Public helper used by the candidate-page server action.
  async createOnboardingDocFromTemplate(args: {
    candidateId: string;
    candidateName: string;
    candidateEmail: string;
  }): Promise<{ ok: boolean; document_id?: string; error?: string }> {
    const integration = await getIntegration(PROVIDER);
    if (!integration || integration.status !== "connected") {
      return { ok: false, error: "not_connected" };
    }
    const templateId =
      (integration.config as { onboarding_template_id?: string })
        ?.onboarding_template_id ?? null;
    if (!templateId) {
      return {
        ok: false,
        error: "missing_template_id_set_in_integrations_pandadoc",
      };
    }
    const token = await this.ensureFreshToken(integration);
    if (!token.ok || !token.access_token) {
      return { ok: false, error: token.error ?? "no_token" };
    }

    const nameParts = args.candidateName.split(" ").filter(Boolean);
    const firstName =
      nameParts.length > 1 ? nameParts.slice(0, -1).join(" ") : args.candidateName;
    const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : "";

    const body = {
      name: `Onboarding Offer — ${args.candidateName}`,
      template_uuid: templateId,
      recipients: [
        {
          email: args.candidateEmail,
          first_name: firstName,
          last_name: lastName,
          role: "Candidate",
        },
      ],
      tokens: [
        { name: "candidate_name", value: args.candidateName },
        { name: "candidate_email", value: args.candidateEmail },
      ],
      metadata: { candidate_id: args.candidateId },
    };

    try {
      const createRes = await fetch(`${API_BASE}/public/v1/documents`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!createRes.ok) {
        const text = await createRes.text().catch(() => "");
        return {
          ok: false,
          error: `pandadoc_create_${createRes.status}: ${text.slice(0, 300)}`,
        };
      }
      const created = (await createRes.json()) as {
        id?: string;
        status?: string;
      };
      const docId = created.id;
      if (!docId) return { ok: false, error: "no_document_id_in_response" };

      // Documents start as document.uploaded — PandaDoc processes them
      // asynchronously into document.draft, then we can /send. Short wait
      // covers most templates; failures surface to the operator and they
      // can manually send from PandaDoc's UI.
      await sleep(1500);

      const sendRes = await fetch(
        `${API_BASE}/public/v1/documents/${docId}/send`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token.access_token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            silent: false,
            subject: `Your offer from Driven Talent — ${args.candidateName}`,
            message:
              "Please review and sign your onboarding offer at the link below.",
          }),
        },
      );

      if (!sendRes.ok) {
        const text = await sendRes.text().catch(() => "");
        return {
          ok: false,
          document_id: docId,
          error: `pandadoc_send_${sendRes.status}: ${text.slice(0, 300)}`,
        };
      }

      return { ok: true, document_id: docId };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "pandadoc_send_threw",
      };
    }
  }
}

// ---------------- module-private helpers ----------------

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function candidateUpdateForStatus(
  docStatus: string,
): { status: "hired" } | null {
  if (docStatus === "document.completed") return { status: "hired" };
  return null;
}

async function fetchAccountEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/public/v1/members/current`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { email?: string };
    return json.email ?? null;
  } catch {
    return null;
  }
}

async function mirrorDeclineToInbox(
  sb: ReturnType<typeof createServiceClient>,
  args: {
    candidateId: string;
    fullName: string;
    email: string | null;
    docName: string | null;
  },
): Promise<void> {
  const { data: contact } = await sb
    .from("contacts")
    .insert({
      full_name: args.fullName,
      email: args.email,
      phone: null,
      type: "job_seeker",
      source: "PandaDoc",
      notes: "Declined onboarding offer document",
    })
    .select("id")
    .single();

  if (!contact) return;

  const { data: conv } = await sb
    .from("conversations")
    .insert({
      contact_id: contact.id,
      subject: args.docName
        ? `Offer Declined: ${args.docName}`
        : "Offer Declined",
      status: "open",
      channel: "application",
    })
    .select("id")
    .single();

  if (!conv) return;

  await sb.from("messages").insert({
    conversation_id: conv.id,
    sender_type: "visitor",
    sender_name: args.fullName,
    body:
      `${args.fullName} declined the onboarding offer` +
      (args.docName ? ` (${args.docName}).` : ".") +
      `\nCandidate ID: ${args.candidateId}`,
    read: false,
  });
}

export const pandadocClient = new PandaDocClient();

export { PandaDocClient, REDIRECT_URI, WEBHOOK_URL };
