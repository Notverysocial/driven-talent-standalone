import "server-only";
import { createClient } from "./supabase/server";
import { sendEmail, resendConfigured } from "./email/resend.server";
import type { SalesLead } from "./supabase/types";
import { appBaseUrl } from "@/lib/app-url";
import { isQuarantined } from "@/lib/lead-quarantine";

// New-employer-lead email notification (revenue side).
//
// Employer leads arrive from the public site directly into `sales_leads`
// (source='inbound_web'); lead creation happens in the separate marketing-site
// codebase, so there is no in-app insert to hook. Instead this module runs as a
// scheduled sweep (see /api/leads/notify): it finds recent inbound leads that
// have not been emailed yet, sends the team a skimmable notification, and stamps
// `lead_notified_at` so no lead is ever emailed twice.
//
// FAIL-SAFE + DORMANT by design:
//   - Sending is gated on RESEND_API_KEY (the fail-safe sendEmail skips cleanly
//     when it is absent) and on a configured recipient list (LEAD_NOTIFY_TO).
//   - When dormant, NOTHING is stamped, so once the key + recipients are set the
//     recent backlog (within the lookback window) flushes with no code change.
//   - Every DB call is guarded; a hiccup logs and skips. Notifying is best-effort
//     and can never block or roll back a lead being saved (saving happens in the
//     other codebase anyway; this only ever reads + stamps).

// Recipients come from env, never hardcoded. Comma or semicolon separated.
function recipientList(): string[] {
  const raw = process.env.LEAD_NOTIFY_TO ?? "";
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Only consider leads created within this many days, so activating the key does
// not blast the entire historical backlog — only genuinely recent leads.
function lookbackDays(): number {
  const n = Number(process.env.LEAD_NOTIFY_LOOKBACK_DAYS);
  return Number.isFinite(n) && n > 0 ? n : 3;
}


function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sourceLabel(detail: string | null): string {
  if (detail === "public-site-call-request") return "Call request";
  if (detail === "public-site-employers-form") return "Employer form";
  return detail ?? "Website";
}

// Skimmable email — the point is someone reads it on a phone and picks up the
// call. Structured fields first, then the full requirements/notes body. Note:
// the public form packs positions / service type / target start into the notes
// body (there are no dedicated columns), so the notes are surfaced prominently.
function buildLeadEmail(lead: SalesLead): { subject: string; html: string; text: string } {
  const company = lead.company_name?.trim() || "New employer lead";
  const headcount =
    lead.estimated_headcount != null ? String(lead.estimated_headcount) : null;
  const url = `${appBaseUrl()}/pipeline/${lead.id}`;

  const subject =
    `New employer lead: ${company}` +
    (headcount ? ` · ${headcount} workers` : "") +
    " · Driven Talent";

  // Ordered, skimmable rows. Blank values are dropped so the email stays tight.
  const rows: [string, string | null][] = [
    ["Company", lead.company_name],
    ["Industry", lead.industry],
    ["Contact", lead.contact_name],
    ["Title", lead.contact_title],
    ["Email", lead.contact_email],
    ["Phone", lead.contact_phone],
    ["City", lead.city],
    ["Workers needed", headcount],
    ["Request type", sourceLabel(lead.source_detail)],
    ["Received", new Date(lead.created_at).toLocaleString("en-US")],
  ];
  const present = rows.filter(([, v]) => v && String(v).trim() !== "");

  const htmlRows = present
    .map(
      ([k, v]) =>
        `<tr>` +
        `<td style="padding:4px 12px 4px 0;color:#888;white-space:nowrap;vertical-align:top">${escapeHtml(k)}</td>` +
        `<td style="padding:4px 0;color:#1a1a1a;font-weight:600">${escapeHtml(String(v))}</td>` +
        `</tr>`,
    )
    .join("");

  const notesBlock = lead.notes?.trim()
    ? `<p style="margin:18px 0 6px;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:0.08em">Positions / requirements</p>
       <div style="padding:12px 14px;border-left:3px solid #C9A227;background:#faf7ef;color:#333;white-space:pre-wrap">${escapeHtml(lead.notes.trim())}</div>`
    : "";

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.5;max-width:560px">
      <p style="font-size:16px;margin:0 0 4px"><strong>New employer lead</strong></p>
      <p style="margin:0 0 16px;color:#555">A staffing request just came in from the website. Reach out while it is warm.</p>
      <table style="border-collapse:collapse;font-size:14px">${htmlRows}</table>
      ${notesBlock}
      <p style="margin-top:20px">
        <a href="${url}" style="display:inline-block;background:#C9A227;color:#0a0a0a;text-decoration:none;font-weight:600;padding:9px 16px;border-radius:4px">Open lead in Driven Talent</a>
      </p>
      ${
        lead.contact_email?.trim()
          ? `<p style="margin-top:10px;font-size:13px">Or reply straight to the contact: <a href="mailto:${escapeHtml(lead.contact_email.trim())}">${escapeHtml(lead.contact_email.trim())}</a></p>`
          : ""
      }
    </div>`;

  const text =
    `New employer lead from the website. Reach out while it is warm.\n\n` +
    present.map(([k, v]) => `${k}: ${v}`).join("\n") +
    (lead.notes?.trim() ? `\n\nPositions / requirements:\n${lead.notes.trim()}` : "") +
    `\n\nOpen lead: ${url}\n`;

  return { subject, html, text };
}

export type LeadNotifyResult = {
  ok: boolean;
  configured: boolean; // key + recipients present
  considered: number; // un-notified in-window leads found
  sent: number;
  note?: string;
};

/**
 * Sweep recent un-notified inbound employer leads and email the team about each.
 * Idempotent (stamps lead_notified_at only on a successful send) and fail-safe
 * (never throws). Returns a summary the cron route serializes to JSON.
 */
export async function notifyNewInboundLeads(): Promise<LeadNotifyResult> {
  const configured = resendConfigured() && recipientList().length > 0;

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return { ok: false, configured, considered: 0, sent: 0, note: "db_unavailable" };
  }

  const sinceIso = new Date(
    Date.now() - lookbackDays() * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Hot query: recent inbound leads not yet notified, oldest first, capped.
  const { data, error } = await supabase
    .from("sales_leads")
    .select("*")
    .eq("source", "inbound_web")
    .is("lead_notified_at", null)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true })
    .limit(25);

  if (error) {
    // Most likely the migration has not been applied yet (unknown column) — stay
    // dormant and quiet rather than erroring the cron.
    console.warn("[lead-notify] query failed (staying dormant):", error.message);
    return { ok: true, configured, considered: 0, sent: 0, note: "query_failed" };
  }

  // Belt and braces on the spam quarantine. A quarantined lead is filed under
  // source='other' precisely so the query above cannot see it, but this sweep is
  // the one surface where a mistake actually reaches a person's inbox — so the
  // marker is checked here too. If someone edits a lead's source back to
  // inbound_web without clearing the marker, it still does not get emailed;
  // restoring properly (the "Not spam" button on the lead) clears both.
  const leads = ((data ?? []) as SalesLead[]).filter((l) => !isQuarantined(l));
  if (leads.length === 0) {
    return { ok: true, configured, considered: 0, sent: 0 };
  }

  // Dormant: no key or no recipients. Do NOT stamp, so these flush when the key
  // is set (as long as they are still within the lookback window).
  if (!configured) {
    return {
      ok: true,
      configured: false,
      considered: leads.length,
      sent: 0,
      note: "dormant: set RESEND_API_KEY and LEAD_NOTIFY_TO to activate",
    };
  }

  const to = recipientList();
  let sent = 0;
  for (const lead of leads) {
    try {
      const { subject, html, text } = buildLeadEmail(lead);
      const res = await sendEmail({
        to,
        subject,
        html,
        text,
        // Let the team hit reply and reach the employer directly when possible.
        replyTo: lead.contact_email?.trim() || undefined,
      });
      if (res.ok) {
        // Stamp only on a real send so a transient failure retries next run.
        const { error: upErr } = await supabase
          .from("sales_leads")
          .update({ lead_notified_at: new Date().toISOString() })
          .eq("id", lead.id);
        if (upErr) {
          console.error("[lead-notify] stamp failed:", upErr.message);
        } else {
          sent += 1;
        }
      }
    } catch (e) {
      console.error(
        "[lead-notify] send threw (non-fatal):",
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  return { ok: true, configured: true, considered: leads.length, sent };
}
