// Indeed integration — XML job feed + Indeed Apply webhook + (optional) Employer API analytics.
//
// Indeed's automation-grade flow without paid Sponsor Jobs:
//
//   1. XML feed   — public GET at /api/integrations/indeed/feed. We emit one
//                   <job> entry per row in `positions` where status='Open'.
//                   Indeed crawls the URL on a schedule (every ~6h).
//   2. Indeed Apply webhook — Indeed POSTs applicant JSON to
//                   /api/integrations/webhook/indeed when someone applies on
//                   Indeed.  We map the payload to `application_intakes` and
//                   mirror to contacts + conversations the same way the
//                   public-site careers form does.
//   3. sync()     — best-effort pull of Employer API analytics. The free /
//                   standard tier doesn't expose this; we degrade gracefully
//                   and stash `Account tier does not include Employer API…`
//                   in last_error so the admin UI is honest.
//
// Auth mode is "api_key" in types.ts.  Antonio will paste the Employer API
// token via the /integrations Connect modal once Leangel's developer-portal
// app is registered (see dashboard setup checklist in the report).

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { registerClient } from "../registry";
import {
  getIntegration,
  updateIntegrationStatus,
  clearIntegrationTokens,
} from "../db";
import type { IntegrationClient, IntegrationRow } from "../types";

const FEED_URL =
  "https://driven-talent-standalone.vercel.app/api/integrations/indeed/feed";
const WEBHOOK_URL =
  "https://driven-talent-standalone.vercel.app/api/integrations/webhook/indeed";

class IndeedClient implements IntegrationClient {
  // Indeed uses API-key auth (Employer API token).  Skip OAuth.
  // getOAuthAuthorizeUrl / exchangeOAuthCode / refreshToken intentionally
  // not implemented — see types.ts INTEGRATION_AUTH_MODE.indeed = "api_key".

  // ---------------- sync ----------------
  async sync(
    integration: IntegrationRow,
  ): Promise<{ ok: boolean; count?: number; error?: string }> {
    // Persist the feed URL on every sync so the admin card stays self-
    // documenting even if the row was reset.
    const configPatch: Record<string, unknown> = {
      ...(integration.config ?? {}),
      feed_url: FEED_URL,
      webhook_url: WEBHOOK_URL,
    };

    const token = integration.access_token;
    if (!token) {
      // No Employer API token — feed-only mode is the expected steady state
      // until Antonio pastes one.  Don't fail; just record it.
      await updateIntegrationStatus("indeed", {
        config: {
          ...configPatch,
          last_pull_stats: null,
          mode: "feed_only",
        },
      });
      return {
        ok: false,
        count: 0,
        error:
          "Account tier does not include Employer API; using feed-only mode",
      };
    }

    // Attempt Employer API stats pull.  Indeed's Employer API is OAuth-
    // protected and most free accounts can't issue a long-lived bearer; if
    // the token works, great — if not, we degrade.
    try {
      const res = await fetch(
        "https://apis.indeed.com/employer/v1/jobs/stats",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        },
      );

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        await updateIntegrationStatus("indeed", {
          config: {
            ...configPatch,
            last_pull_stats: null,
            mode: "feed_only",
          },
        });
        return {
          ok: false,
          count: 0,
          error: `Indeed Employer API ${res.status}: ${body.slice(0, 200) || "no body"}`,
        };
      }

      const json = (await res.json()) as Record<string, unknown>;
      const jobs = Array.isArray(
        (json as { jobs?: unknown[] }).jobs,
      )
        ? ((json as { jobs: unknown[] }).jobs as Record<string, unknown>[])
        : [];

      const stats = {
        fetched_at: new Date().toISOString(),
        job_count: jobs.length,
        total_impressions: sumField(jobs, "impressions"),
        total_clicks: sumField(jobs, "clicks"),
        total_applications: sumField(jobs, "applications"),
        total_spend: sumField(jobs, "spend"),
      };

      await updateIntegrationStatus("indeed", {
        config: {
          ...configPatch,
          last_pull_stats: stats,
          mode: "employer_api",
        },
      });

      return { ok: true, count: stats.job_count };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "indeed_sync_threw";
      await updateIntegrationStatus("indeed", {
        config: {
          ...configPatch,
          last_pull_stats: null,
          mode: "feed_only",
        },
      });
      return { ok: false, count: 0, error: msg };
    }
  }

  // ---------------- webhook ----------------
  // Indeed Apply POSTs a JSON document with `applicant` + `job` keys when a
  // candidate applies on Indeed.  We:
  //   1. verify HMAC-SHA1 signature against integrations.webhook_secret
  //   2. map to application_intakes (preserving full raw payload)
  //   3. mirror to contacts + conversations + messages
  async handleWebhook(
    request: Request,
  ): Promise<{ ok: boolean; error?: string }> {
    const raw = await request.text();

    // Signature verification.  Indeed sends an HMAC-SHA1 hex digest in
    // X-Indeed-Signature using the shared secret as the key.  If we have no
    // secret stored, skip verification (dev / pre-go-live) but log it.
    const integration = await getIntegration("indeed");
    const secret = integration?.webhook_secret ?? null;
    if (secret) {
      const sigHeader =
        request.headers.get("x-indeed-signature") ??
        request.headers.get("x-indeed-apply-signature") ??
        "";
      if (!sigHeader) {
        return { ok: false, error: "missing_signature" };
      }
      const expected = createHmac("sha1", secret).update(raw).digest("hex");
      const a = Buffer.from(expected, "hex");
      // Indeed's header may be hex or base64 depending on version; try both.
      const candidates = [
        Buffer.from(sigHeader.replace(/^sha1=/, ""), "hex"),
        Buffer.from(sigHeader.replace(/^sha1=/, ""), "base64"),
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

    const applicant = (payload.applicant ?? {}) as Record<string, unknown>;
    const job = (payload.job ?? {}) as Record<string, unknown>;

    const full_name =
      str(applicant.fullName) ??
      str(applicant.name) ??
      [str(applicant.firstName), str(applicant.lastName)]
        .filter(Boolean)
        .join(" ") ||
      null;
    const email = str(applicant.email);
    const phone = str(applicant.phoneNumber) ?? str(applicant.phone);
    const positionTitle = str(job.jobTitle) ?? str(job.title);
    const city = str(job.jobLocation) ?? str(job.location) ?? str(job.city);

    if (!full_name || (!email && !phone)) {
      return { ok: false, error: "missing_applicant_fields" };
    }

    const sb = createServiceClient();

    const { data: intake, error: intakeErr } = await sb
      .from("application_intakes")
      .insert({
        full_name,
        email,
        phone,
        city,
        position_of_interest: positionTitle,
        source: "indeed",
        intake_payload: payload,
        status: "new",
      })
      .select("id")
      .single();

    if (intakeErr) {
      return {
        ok: false,
        error: `intake_insert_failed: ${intakeErr.message}`,
      };
    }

    // Mirror to inbox (contact + conversation + message), matching the
    // pattern in /api/intake/application/route.ts.
    const { data: contact } = await sb
      .from("contacts")
      .insert({
        full_name,
        email,
        phone,
        type: "job_seeker",
        source: "Indeed Apply",
        notes: positionTitle ? `Applied via Indeed for: ${positionTitle}` : null,
      })
      .select("id")
      .single();

    if (contact) {
      const { data: conv } = await sb
        .from("conversations")
        .insert({
          contact_id: contact.id,
          subject: positionTitle
            ? `Indeed Application: ${positionTitle}`
            : "Indeed Application",
          status: "open",
          channel: "application",
        })
        .select("id")
        .single();

      if (conv) {
        const body =
          `New Indeed application from ${full_name}.` +
          (positionTitle ? `\nApplied for: ${positionTitle}` : "") +
          (email ? `\nEmail: ${email}` : "") +
          (phone ? `\nPhone: ${phone}` : "") +
          (city ? `\nLocation: ${city}` : "");
        await sb.from("messages").insert({
          conversation_id: conv.id,
          sender_type: "visitor",
          sender_name: full_name,
          body,
          read: false,
        });
        await sb
          .from("application_intakes")
          .update({ conversation_id: conv.id })
          .eq("id", intake.id);
      }
    }

    return { ok: true };
  }

  // ---------------- disconnect ----------------
  async disconnect(
    _integration: IntegrationRow,
  ): Promise<{ ok: boolean; error?: string }> {
    // No remote revoke for API-key mode — db.ts clearIntegrationTokens
    // handles status flip; we additionally preserve the feed_url note so
    // a re-connect doesn't lose the dashboard URL.
    try {
      await clearIntegrationTokens("indeed");
      // Re-stamp feed_url in config so the row keeps documenting itself.
      const row = await getIntegration("indeed");
      if (row) {
        await updateIntegrationStatus("indeed", {
          config: {
            ...(row.config ?? {}),
            feed_url: FEED_URL,
            webhook_url: WEBHOOK_URL,
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

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

function sumField(
  rows: Record<string, unknown>[],
  key: string,
): number {
  let total = 0;
  for (const r of rows) {
    const v = r[key];
    if (typeof v === "number" && Number.isFinite(v)) total += v;
    else if (typeof v === "string") {
      const n = Number(v);
      if (Number.isFinite(n)) total += n;
    }
  }
  return total;
}

registerClient("indeed", new IndeedClient());

export { IndeedClient, FEED_URL, WEBHOOK_URL };
