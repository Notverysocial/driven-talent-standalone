// GET /api/bug-reports/attachment?path=<attachment_path>
//
// Resolves a bug_reports.attachment_path into something a triager can open,
// and redirects there. NOT public — it is deliberately absent from
// src/proxy.ts isPublicPath, so the auth gate applies and requireUser() is the
// second lock.
//
// Two shapes live in that column:
//   1. A storage key in the private `bug_attachments` bucket, written by the
//      public form at /report (e.g. "public-intake/<uuid>.png"). The bucket is
//      private, so we mint a short-lived signed URL with the service role.
//   2. A plain http(s) URL, from older rows that stored a link. Passed through
//      unchanged.
//
// Why this exists: /bug-reports previously rendered `href={attachment_path}`
// directly, which produces a dead relative link for anything that is a storage
// key rather than a URL.

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth.server";
import { createServiceClient } from "@/lib/supabase/server";
import { BUG_ATTACHMENT_BUCKET } from "@/lib/bug-intake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIGNED_URL_TTL_SECONDS = 300;

export async function GET(req: NextRequest) {
  await requireUser();

  const path = req.nextUrl.searchParams.get("path") ?? "";
  if (!path) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  // Legacy rows that stored a full URL.
  if (/^https?:\/\//i.test(path)) {
    return NextResponse.redirect(path);
  }

  // Storage key. Confine it to the bucket prefix this app writes — no
  // traversal, no reading arbitrary objects by crafting the query string.
  if (path.includes("..") || !path.startsWith("public-intake/")) {
    return NextResponse.json({ error: "Invalid attachment path" }, { status: 400 });
  }

  const sb = createServiceClient();
  const { data, error } = await sb.storage
    .from(BUG_ATTACHMENT_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    console.error("[bug-reports] signed URL failed", error);
    return NextResponse.json(
      { error: "Could not open that attachment." },
      { status: 404 },
    );
  }

  return NextResponse.redirect(data.signedUrl);
}
