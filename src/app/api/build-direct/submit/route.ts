/**
 * Build Direct submission endpoint.
 *
 * Place at: src/app/api/build-direct/submit/route.ts
 *
 * Receives a POST from the <BuildDirect /> widget and inserts a row into
 * the in-app `bug_reports` table. The submission is then surfaced on the
 * /bug-reports triage queue (severity-sorted, status: new -> in_progress
 * -> resolved). The widget receives the bug_reports row UUID as `ticketId`.
 *
 * History:
 *   - Previously fanned out to ClickUp (DT Live Fix Queue list 901714336938)
 *     + a Resend notification email to Antonio.
 *   - Both of those side-effects were intentionally REMOVED in favor of the
 *     in-app /bug-reports queue, which is now the canonical destination.
 *   - CLICKUP_API_TOKEN, CLICKUP_FIX_QUEUE_LIST, RESEND_API_KEY,
 *     BUILD_DIRECT_NOTIFY_EMAIL, BUILD_DIRECT_FROM_EMAIL can stay set in
 *     Vercel; they are simply no longer read by this route.
 *
 * Required env vars (already present for the rest of the app):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * Security:
 *   - Hard cap on payload size (10MB) so attackers can't blast huge base64 screenshots
 *   - Title and description are trimmed and length-capped server-side too
 *   - The endpoint never echoes user-supplied content into the response except the ticket ID
 *   - bug_reports RLS policy is "open" (matches the rest of the internal app), so
 *     the standard anon-key createClient() can write rows.
 *
 * Screenshot handling:
 *   - The widget may POST a base64 data URL in `screenshot` (<=5MB).
 *   - Vercel Blob is not yet provisioned on this project, so we DO NOT persist
 *     the binary. We log that a screenshot was attached and add a footer line
 *     to the description so triage knows to ask for it directly.
 *   - A follow-up task will wire Vercel Blob and set `attachment_path`.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_TITLE_LEN = 120;
const MAX_DESC_LEN = 2000;
const MAX_UA_LEN = 500;
const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10MB cap

type SubmitBody = {
  title?: string;
  description?: string;
  severity?: "low" | "normal" | "high";
  pageUrl?: string;
  userAgent?: string;
  screenshot?: string | null; // data:image/...;base64,...
};

type BugSeverity = "low" | "medium" | "high" | "critical";

function clamp(s: string | undefined | null, max: number): string {
  return (s ?? "").toString().trim().slice(0, max);
}

function mapSeverity(s: SubmitBody["severity"]): BugSeverity {
  // Widget exposes low/normal/high; bug_reports enum is low/medium/high/critical.
  // Widget has no "critical" affordance, so we only ever emit low/medium/high here.
  switch (s) {
    case "low":
      return "low";
    case "high":
      return "high";
    case "normal":
    default:
      return "medium";
  }
}

function pathFromUrl(u: string | undefined): string | null {
  if (!u) return null;
  try {
    return new URL(u).pathname;
  } catch {
    // Not a fully-qualified URL — fall back to the raw value (capped).
    return clamp(u, 500) || null;
  }
}

export async function POST(req: NextRequest) {
  // Cap payload size early — content-length is advisory but cheap to check.
  const lenHeader = req.headers.get("content-length");
  if (lenHeader && Number(lenHeader) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  let body: SubmitBody;
  try {
    body = (await req.json()) as SubmitBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = clamp(body.title, MAX_TITLE_LEN);
  const desc = clamp(body.description, MAX_DESC_LEN);

  if (!desc) {
    return NextResponse.json(
      { error: "description is required" },
      { status: 400 },
    );
  }

  // The widget UI shows title + description as distinct fields. We collapse
  // them into the single bug_reports.description column with a blank-line
  // separator so the triage queue surfaces both. Page URL goes in a footer
  // so the path column stays clean for indexing/sort.
  const pageUrlFooter = body.pageUrl
    ? `\n\n---\nReported from: ${clamp(body.pageUrl, 500)}`
    : "";

  const screenshotFooter = body.screenshot
    ? "\n\n[screenshot attached at submission time but storage is not yet provisioned — ask reporter to re-share via direct message if needed]"
    : "";

  const combinedDescription =
    (title ? `${title}\n\n${desc}` : desc) + pageUrlFooter + screenshotFooter;

  if (body.screenshot) {
    // Log only — do not persist the binary yet (Vercel Blob not provisioned).
    console.info(
      "[build-direct] screenshot received but skipped (storage not provisioned)",
      { bytes: body.screenshot.length },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bug_reports")
    .insert({
      description: combinedDescription,
      severity: mapSeverity(body.severity),
      // status defaults to 'new' per migration 0014; omitting lets the DB
      // default win so we don't drift if that default ever changes.
      page_path: pathFromUrl(body.pageUrl),
      user_agent: clamp(body.userAgent, MAX_UA_LEN) || null,
      // reporter_name / reporter_email / steps_to_reproduce intentionally
      // left null — the Build Direct widget does not collect them.
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[build-direct] bug_reports insert failed:", error);
    return NextResponse.json(
      { error: "Server failed to record the report" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ticketId: data.id,
    triageUrl: `/bug-reports?id=${data.id}`,
  });
}
