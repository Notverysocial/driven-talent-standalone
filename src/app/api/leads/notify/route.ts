import { NextResponse } from "next/server";
import { checkCronAuth } from "@/lib/cron-auth";
import { notifyNewInboundLeads } from "@/lib/inbound-lead-email.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/leads/notify
 *
 * Emails the Driven Talent team about new employer leads that arrived from the
 * public site (sales_leads, source='inbound_web') so a revenue lead never sits
 * unworked in a silent inbox.
 *
 * Wired to Vercel Cron (vercel.json). When CRON_SECRET is set, Vercel injects it
 * as a Bearer token; we verify it so the endpoint is not publicly triggerable.
 * Also runnable on demand for verification.
 *
 * FAIL-SAFE + DORMANT: with no RESEND_API_KEY / LEAD_NOTIFY_TO, this reports
 * "dormant" and sends nothing. It never throws and never touches lead creation.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const denied = checkCronAuth(request);
  if (denied) return denied as unknown as NextResponse;

  const result = await notifyNewInboundLeads();
  console.log(
    `[lead-notify] configured=${result.configured} considered=${result.considered} sent=${result.sent}` +
      (result.note ? ` note="${result.note}"` : ""),
  );
  return NextResponse.json(result);
}
