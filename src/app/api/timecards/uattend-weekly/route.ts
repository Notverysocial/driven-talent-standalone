import { NextResponse } from "next/server";
import { importUattendTimecards } from "@/lib/uattend/ingest.server";
import { scheduledPullWindows } from "@/lib/uattend/ingest-policy";
import { getIntegration, updateIntegrationStatus } from "@/lib/integrations/db";

// GET /api/timecards/uattend-weekly
//
// The scheduled uAttend → time cards pull. Until now this pipeline had NO
// schedule of any kind: `importUattendTimecards` was reachable only from the
// "Pull week" button on /reports, so payroll hours arrived when somebody
// remembered to click. When the clicking stopped on 2026-07-02, so did the
// hours, and nothing anywhere said so.
//
// Note this is a DIFFERENT pipeline from /api/integrations/cron. That one runs
// uattendClient.sync(), which pulls raw punches into `timeclock_punches`. This
// one builds the `timecards` rows that payroll and invoicing actually read.
// Conflating the two is what made the outage hard to see.
//
// THREE PROPERTIES THIS JOB MUST HAVE, because a silent scheduled job is the
// bug we are actually fixing:
//
//   1. It never overwrites a time card a human acted on. Runs are `scheduled`,
//      so submitted/approved/rejected cards are skipped and REPORTED.
//      previewInvoicesForPeriod reads approved cards; rewriting one would move
//      an invoice total with nobody asking.
//   2. It records the outcome on EVERY path, including failure. The result
//      lands on integrations.uattend.config.weekly_pull so the UI can show it
//      and staleness is detectable.
//   3. It never widens its own window. Current + previous week only — late
//      punches are normal, three weeks of un-pulled June is a decision for a
//      person, not something a cron quietly sweeps up on its first run.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type WindowResult = {
  weekStart: string;
  ok: boolean;
  timecardsUpserted?: number;
  skippedLocked?: { name: string; status: string; hours: number }[];
  unmatched?: number;
  unassigned?: number;
  error?: string;
};

export async function GET(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = request.headers.get("authorization") ?? "";
    const got = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
    if (got !== expected) {
      // Recorded, not just refused. An unauthorized cron looks exactly like a
      // cron that never fired — which is the failure mode that hid a dead feed
      // for seventeen days — so leave a trace an operator can find.
      await recordOutcome({
        ok: false,
        error: "unauthorized — CRON_SECRET mismatch or missing bearer",
        windows: [],
      }).catch(() => {});
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const windows = scheduledPullWindows(todayIso);
  const results: WindowResult[] = [];

  for (const weekStart of windows) {
    try {
      const summary = await importUattendTimecards({
        weekStart,
        trigger: "scheduled",
      });
      results.push({
        weekStart,
        ok: true,
        timecardsUpserted: summary.timecardsUpserted,
        skippedLocked: summary.skippedLocked,
        unmatched: summary.unmatched.length,
        unassigned: summary.unassigned.length,
      });
    } catch (e) {
      // One bad week must not stop the other. Both outcomes are recorded.
      results.push({
        weekStart,
        ok: false,
        error: e instanceof Error ? e.message : "ingest_threw",
      });
    }
  }

  const allOk = results.every((r) => r.ok);
  await recordOutcome({
    ok: allOk,
    error: allOk ? null : results.find((r) => !r.ok)?.error ?? "ingest_failed",
    windows: results,
  }).catch(() => {
    // Never let bookkeeping turn a successful pull into a 500 — the hours are
    // already written. The staleness check catches a run whose record is
    // missing, because last_run_at simply will not have moved.
  });

  return NextResponse.json(
    { ok: allOk, windows: results },
    { status: allOk ? 200 : 500 },
  );
}

// Persist the run onto the uAttend integration row. Kept in `config` rather
// than last_sync_at/next_sync_at because those belong to the punch feed — two
// pipelines, two independent health records, so a healthy punch feed can never
// make a dead timecard pull look alive.
async function recordOutcome(outcome: {
  ok: boolean;
  error?: string | null;
  windows: WindowResult[];
}): Promise<void> {
  const row = await getIntegration("uattend");
  if (!row) return;
  const config = (row.config ?? {}) as Record<string, unknown>;

  const ranAt = new Date().toISOString();
  const weeks = outcome.windows.map((w) => w.weekStart);
  await updateIntegrationStatus("uattend", {
    config: {
      ...config,
      weekly_pull: {
        last_run_at: ranAt,
        // Kept in the same "A..B" shape the pre-existing hand-maintained
        // last_pull_window key used, so the two are comparable at a glance.
        last_pull_window: weeks.length
          ? `${weeks[0]}..${weeks[weeks.length - 1]}`
          : null,
        ok: outcome.ok,
        error: outcome.error ?? null,
        timecards_upserted: outcome.windows.reduce(
          (s, w) => s + (w.timecardsUpserted ?? 0),
          0,
        ),
        skipped_locked: outcome.windows.flatMap((w) => w.skippedLocked ?? []),
        windows: outcome.windows,
      },
    },
  });
}
