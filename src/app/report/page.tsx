// /report — the PUBLIC feedback + bug intake form.
//
// Replaces "email me a bug" for the Driven Talent team. Deliberately open: no
// sign-in, no account, works from a phone on the warehouse floor. Listed in
// src/proxy.ts isPublicPath so the auth gate never redirects it to /login.
//
// Submissions land in the same `bug_reports` table (migration 0014) that the
// in-app reporter writes to, and show up in the existing /bug-reports triage
// queue. No second schema.

import type { Metadata } from "next";
import { createServiceClient } from "@/lib/supabase/server";
import { BUG_ATTACHMENT_BUCKET, pathOnly } from "@/lib/bug-intake";
import { ReportForm } from "./ReportForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Report an issue — Driven Talent",
  description:
    "Tell the Driven Talent team about a bug, something confusing, or an idea for the app.",
  robots: { index: false, follow: false },
};

/**
 * Is the attachment bucket actually provisioned?
 *
 * This is the guard that keeps us honest. Migrations are NOT auto-applied in
 * this project, so this code can deploy before 0047_bug_attachments.sql has
 * been run. Rather than render an upload control that would throw away the
 * file (the exact pattern behind the resume-loss incident, and behind the
 * "[screenshot attached at submission time but storage is not yet
 * provisioned]" rows already in bug_reports), we ask storage whether the
 * bucket exists and only offer the control if it does.
 *
 * A `list` on a missing bucket errors; on a real one it returns rows (possibly
 * empty).
 *
 * The service role is used for the probe because the bucket is private and its
 * policies grant the anon key INSERT only (migration 0047) — an anon `list`
 * would fail even once the bucket exists. If SUPABASE_SERVICE_ROLE_KEY is not
 * configured the probe fails closed, which is the safe direction: no upload
 * control, honest copy, no discarded files.
 */
async function attachmentsAvailable(): Promise<boolean> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return false;
  try {
    const sb = createServiceClient();
    const { error } = await sb.storage
      .from(BUG_ATTACHMENT_BUCKET)
      .list("", { limit: 1 });
    return !error;
  } catch {
    return false;
  }
}

type ReportPageProps = {
  // ?from=/timecards — set by in-app links so we capture where they came from
  // without asking. ?label= lets a caller pass a friendlier name.
  searchParams?: Promise<{ from?: string; label?: string }>;
};

export default async function ReportPage({ searchParams }: ReportPageProps) {
  const params = (await searchParams) ?? {};
  const capturedPath = pathOnly(params.from ?? "");
  const capturedLabel = (params.label ?? "").trim().slice(0, 160);

  const canAttach = await attachmentsAvailable();

  return (
    <main className="dt-report-screen">
      <div className="dt-report-card">
        <header className="dt-report-brand">
          <div className="name">Driven Talent</div>
          <div className="sub">Tell us what is going on</div>
        </header>

        <h1 className="dt-report-title">Report an issue or share an idea</h1>
        <p className="dt-report-hint">
          Anything at all — something broken, something confusing, or something
          you wish the app did. You do not need an account, and it goes straight
          to the team that can fix it. Takes about a minute.
        </p>

        <ReportForm
          capturedPath={capturedPath}
          capturedLabel={capturedLabel}
          canAttach={canAttach}
        />
      </div>
    </main>
  );
}
