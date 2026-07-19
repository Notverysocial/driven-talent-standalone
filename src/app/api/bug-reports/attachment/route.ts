// GET /api/bug-reports/attachment?path=<attachment_path>
//
// Resolves a bug_reports.attachment_path into something a triager can open.
// Two shapes live in that column: storage keys in the private
// `bug_attachments` bucket (written by the public form at /report), and plain
// URLs from older rows.
//
// ---------------------------------------------------------------------------
// WHY THIS ROUTE DOES NOT RELY ON THE MIDDLEWARE BOUNCE
//
// The obvious design — leave it out of proxy.ts isPublicPath and call
// requireUser() — looks protected and is not, because BOTH of those layers
// no-op on the same flag:
//
//   proxy.ts:52          if (!AUTH_ENABLED) return NextResponse.next();
//   auth.server.ts:96    if (!AUTH_ENABLED) return SYNTHETIC_OWNER;   // role: owner
//
// AUTH_ENABLED defaults to OFF. So with it unset there is no gate at all, and
// an earlier version of this file was verified open by hand: it returned
// `307 -> https://example.com` for an unauthenticated request. Two independent-
// looking checks, one switch, zero enforcement.
//
// So the real control here is NOT authentication. It is that the requested
// value must actually appear in the `bug_reports.attachment_path` column. That
// holds whatever AUTH_ENABLED is set to, and it is what makes the redirect
// non-arbitrary: a caller cannot name an object, or a destination, that the
// app did not itself record. requireUser() is kept on top because it does
// enforce in production (where auth is on), but it is defence in depth, not
// the load-bearing check.
//
// The prior version was also an OPEN REDIRECT: any value matching
// /^https?:\/\//i was handed to NextResponse.redirect, so
// ?path=https://evil.example bounced visitors off the app's own domain. Both
// the scheme filter and the must-exist-in-the-table check close that.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth.server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  BUG_ATTACHMENT_BUCKET,
  classifyAttachmentRef,
} from "@/lib/bug-intake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIGNED_URL_TTL_SECONDS = 300;

// Deliberately identical for "no such row", "malformed", and "not eligible".
// A distinguishable error here would confirm which attachment keys exist.
const NOT_FOUND = { error: "Could not open that attachment." };

export async function GET(req: NextRequest) {
  // Enforces in production. A no-op when AUTH_ENABLED is off — see the header.
  await requireUser();

  const raw = req.nextUrl.searchParams.get("path") ?? "";
  const ref = classifyAttachmentRef(raw);

  if (ref.kind === "invalid") {
    console.warn("[bug-reports] rejected attachment ref", { reason: ref.reason });
    return NextResponse.json(NOT_FOUND, { status: 404 });
  }

  // THE control. The value must be one this app recorded on a real report.
  // Without this, `path` is attacker-chosen and the route becomes both an
  // arbitrary-object reader and an open redirect.
  //
  // If the service role is not configured we cannot run that check, so we
  // refuse rather than fall through to the redirect. Stated explicitly: the
  // unconfigured case previously surfaced as a 500 from an unhandled throw,
  // which happened to be safe. Safe-by-accident is how the cron routes stayed
  // broken behind a 307 for weeks.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      "[bug-reports] SUPABASE_SERVICE_ROLE_KEY unset — refusing to resolve attachments",
    );
    return NextResponse.json(NOT_FOUND, { status: 503 });
  }

  const sb = createServiceClient();
  const { data: owner, error: lookupErr } = await sb
    .from("bug_reports")
    .select("id")
    .eq("attachment_path", raw.trim())
    .limit(1)
    .maybeSingle();

  if (lookupErr) {
    console.error("[bug-reports] attachment lookup failed", lookupErr);
    return NextResponse.json(NOT_FOUND, { status: 502 });
  }
  if (!owner) {
    console.warn("[bug-reports] attachment ref not present on any report");
    return NextResponse.json(NOT_FOUND, { status: 404 });
  }

  // Legacy row that stored a link. Verified above to be https AND to be a
  // value this app recorded, so it is not an open redirect.
  if (ref.kind === "external") {
    return NextResponse.redirect(ref.url);
  }

  const { data, error } = await sb.storage
    .from(BUG_ATTACHMENT_BUCKET)
    .createSignedUrl(ref.key, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    console.error("[bug-reports] signed URL failed", error);
    return NextResponse.json(NOT_FOUND, { status: 404 });
  }

  return NextResponse.redirect(data.signedUrl);
}
