import { NextResponse } from "next/server";
import {
  runApplicantIntegrityAudit,
  saveAuditSnapshot,
  getPreviousFlagCount,
} from "@/lib/integrity/applicant-audit.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/integrity/applicant-audit
 *
 * Recurring data-integrity audit for the applicant pipeline (card 1322c60e).
 * Runs every seam check (unreviewed backlog + aging, the never-promoted/never-
 * rejected drop seam, duplicate emails, unresolved imports, orphan references),
 * records a dated snapshot, logs a one-line summary (so an aging backlog is
 * visible in the run logs / alerting), and returns the full report as JSON.
 *
 * Wired to Vercel Cron (vercel.json) on a daily schedule. When CRON_SECRET is
 * set, Vercel injects it as a Bearer token; we verify it so the endpoint is not
 * publicly triggerable. Also runnable on demand for verification.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = request.headers.get("authorization") ?? "";
    const got = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
    if (got !== expected) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  const previousFlags = await getPreviousFlagCount();
  const report = await runApplicantIntegrityAudit();
  await saveAuditSnapshot(report);

  const delta =
    previousFlags == null ? "" : ` (was ${previousFlags} last run)`;
  const summary =
    `[integrity-audit] applicant pipeline: ${report.alarms} ALARM(s), ${report.tracked} tracked${delta} — ` +
    `${report.backlog.unreviewed} unreviewed ` +
    `(${report.backlog.over7} >7d, ${report.backlog.over30} >30d, oldest ${report.backlog.oldestDays}d), ` +
    `${report.stuck.count} stuck, ${report.duplicateEmails.count} dup-email, ` +
    `${report.unresolvedImports.total} unresolved-import, ` +
    `${report.orphans.danglingPromotedCandidate + report.orphans.promotedWithoutCandidateId + report.orphans.danglingPromotedEmployee} orphan(s), ` +
    `${report.seedRows.unexcluded} unexcluded-seed, ` +
    `${report.duplicateCandidates.records} duplicate-person record(s) in ${report.duplicateCandidates.groups} group(s), ` +
    `${report.duplicateIntakes.records} duplicate-intake record(s) in ${report.duplicateIntakes.groups} group(s), ` +
    `integrations: ${report.integrations.alarm} not working${report.integrations.broken.length ? ` (${report.integrations.broken.join("/")})` : ""}, ${report.integrations.stale} stale`;
  console.log(summary);

  return NextResponse.json({
    ok: true,
    previousFlags,
    summary,
    report,
  });
}
