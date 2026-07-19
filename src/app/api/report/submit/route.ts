// POST /api/report/submit — PUBLIC bug/feedback intake.
//
// This is the write endpoint behind /report, the public form that replaces
// "email me a bug" for the Driven Talent team. No auth: that is the entire
// point. It must be listed in src/proxy.ts isPublicPath or the proxy 307s the
// fetch to /login and the submit silently fails (same trap the Build Direct
// widget hit).
//
// WHAT THIS REUSES
//   - The `bug_reports` table from migration 0014 — same columns, same enums,
//     same 'new' status default. No second schema. Rows land in the existing
//     /bug-reports triage queue alongside the in-app reporter's rows.
//   - The anon `createClient()` write path proven by
//     src/app/api/build-direct/submit/route.ts. bug_reports RLS is the "open"
//     policy, so the anon key can insert; no service-role secret needed.
//   - All decision logic lives in src/lib/bug-intake.ts and is covered by
//     e2e/logic/bug-intake.spec.ts in the required CI gate. This file is a
//     thin shell: parse -> normalize -> validate -> spam -> upload -> insert.
//
// ATTACHMENTS
//   Screenshots are stored for real, in the private `bug_attachments` Supabase
//   Storage bucket (supabase/migrations/0047_bug_attachments.sql), and the key
//   is written to bug_reports.attachment_path.
//
//   If that bucket does not exist yet, /report does not render a file input at
//   all, and this endpoint REFUSES a submission that carries a file rather than
//   accepting it and dropping the bytes. The old Build Direct behaviour —
//   accept the screenshot, discard it, append "[screenshot attached at
//   submission time but storage is not yet provisioned]" to the description —
//   is exactly the silent-discard pattern that caused the resume-loss incident.
//   It is not repeated here. On upload failure the caller gets a 502 with
//   `canRetryWithoutAttachment: true` so the reporter can knowingly submit the
//   text alone; nothing is written until we know where the file went.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  normalizeIntake,
  validateIntake,
  scoreSpam,
  buildBugReportRow,
  attachmentKey,
  isAllowedAttachmentType,
  BUG_ATTACHMENT_BUCKET,
  LIMITS,
  type RawIntake,
} from "@/lib/bug-intake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Best-effort per-instance rate limit. Serverless means each lambda has its own
// map, so this is a speed bump for a naive flood, not a real limiter — the
// honeypot and content scoring do the actual anti-spam work. Deliberately
// generous: a supervisor filing three things in a row after a bad morning is
// the behaviour we want, not the behaviour we block.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 8;
const hits = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  // Opportunistic cleanup so the map cannot grow without bound on a warm
  // instance that serves a lot of distinct IPs.
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
    }
  }
  return recent.length > MAX_PER_WINDOW;
}

function clientKey(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(req: NextRequest) {
  const lenHeader = req.headers.get("content-length");
  if (lenHeader && Number(lenHeader) > LIMITS.bodyBytes) {
    return NextResponse.json(
      { error: "That submission is too large. Try a smaller screenshot." },
      { status: 413 },
    );
  }

  if (rateLimited(clientKey(req))) {
    return NextResponse.json(
      {
        error:
          "That is a lot of reports in a short time. Give it a few minutes, or email us if it is urgent.",
      },
      { status: 429 },
    );
  }

  // The form posts multipart/form-data (it may carry a file). JSON is also
  // accepted so the endpoint stays scriptable and testable with curl.
  let raw: RawIntake;
  let file: File | null = null;
  const contentType = req.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const fd = await req.formData();
      const obj: Record<string, unknown> = {};
      for (const [k, v] of fd.entries()) {
        if (typeof v === "string") obj[k] = v;
      }
      raw = obj as RawIntake;
      const candidate = fd.get("attachment");
      if (candidate && typeof candidate !== "string" && candidate.size > 0) {
        file = candidate as File;
      }
    } else {
      raw = (await req.json()) as RawIntake;
    }
  } catch {
    return NextResponse.json(
      { error: "We could not read that submission. Please try again." },
      { status: 400 },
    );
  }

  // Server-side truth. The client mirrors these rules, but nothing the client
  // claims is trusted: everything below re-derives from the raw payload.
  const intake = normalizeIntake({
    ...raw,
    // user_agent is taken from the request header, not the body, so it cannot
    // be spoofed into a storage-bloating string by a hand-rolled POST.
    userAgent: req.headers.get("user-agent") ?? "",
  });

  const fieldErrors = validateIntake(intake);
  if (fieldErrors.length > 0) {
    return NextResponse.json({ fieldErrors }, { status: 400 });
  }

  const spam = scoreSpam(intake);
  if (spam.action === "drop") {
    // Honeypot tripped. Respond as if it succeeded so the bot does not learn
    // what caught it; write nothing. A real person never reaches this branch —
    // the field is hidden, aria-hidden, and tabindex=-1.
    console.info("[report] dropped by honeypot", { reasons: spam.reasons });
    return NextResponse.json({ ok: true, ticketId: null });
  }
  if (spam.action === "reject") {
    console.info("[report] rejected as spam", {
      score: spam.score,
      reasons: spam.reasons,
    });
    return NextResponse.json(
      {
        error:
          "Our spam filter blocked this one. If you are a real person (sorry!), remove any links and try again, or email the team directly.",
      },
      { status: 422 },
    );
  }

  const supabase = await createClient();

  // ----- attachment: store it, or refuse it. Never accept-and-discard. -----
  let attachmentPath: string | null = null;

  if (file) {
    if (!isAllowedAttachmentType(file.type)) {
      return NextResponse.json(
        { error: "Screenshots only, please — PNG, JPG, GIF, or WEBP." },
        { status: 415 },
      );
    }
    if (file.size > LIMITS.attachmentBytes) {
      return NextResponse.json(
        { error: "That screenshot is over 5 MB. Please attach a smaller one." },
        { status: 413 },
      );
    }

    const key = attachmentKey(randomUUID(), file.name || "screenshot.png");
    const { error: upErr } = await supabase.storage
      .from(BUG_ATTACHMENT_BUCKET)
      .upload(key, file, {
        contentType: file.type,
        upsert: false,
      });

    if (upErr) {
      // Hard stop. We do NOT insert the report and pretend the screenshot is
      // somewhere — the reporter gets told, and gets the choice.
      console.error("[report] attachment upload failed", upErr);
      return NextResponse.json(
        {
          error:
            "We could not save your screenshot, so we did not file the report — we did not want to lose your file quietly. You can submit again without the screenshot.",
          canRetryWithoutAttachment: true,
        },
        { status: 502 },
      );
    }
    attachmentPath = key;
  }

  const row = buildBugReportRow(intake, { attachmentPath });

  const { data, error } = await supabase
    .from("bug_reports")
    .insert(row)
    .select("id")
    .single();

  if (error || !data) {
    console.error("[report] bug_reports insert failed", error);
    // The screenshot is now orphaned in storage. Clean it up so a failed
    // submit does not leave unreferenced bytes in the bucket.
    if (attachmentPath) {
      try {
        // Service role: the bucket grants the anon key INSERT only (migration
        // 0047), deliberately, so a submitter cannot delete attachments.
        await createServiceClient()
          .storage.from(BUG_ATTACHMENT_BUCKET)
          .remove([attachmentPath]);
      } catch {
        // Best effort — an orphaned object is a housekeeping problem, not a
        // reason to change what we tell the reporter.
      }
    }
    return NextResponse.json(
      {
        error:
          "Something went wrong on our end and the report was not saved. Please try again in a moment.",
      },
      { status: 500 },
    );
  }

  // The reference the reporter sees. Short, readable over the phone, and it
  // really does point at the row — the triage queue filters on it.
  return NextResponse.json({
    ok: true,
    ticketId: data.id,
    reference: String(data.id).slice(0, 8).toUpperCase(),
  });
}
