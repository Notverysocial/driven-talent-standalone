// POST or GET /api/workflows/tick
//
// Drains pending workflow_scheduled_jobs whose run_at has elapsed.
//
// AUTH — FAILS CLOSED, like every other scheduled endpoint (lib/cron-auth.ts).
//
// This route used its own check instead:
//
//     const expected = process.env.WORKFLOWS_TICK_SECRET;
//     if (expected) { ...compare x-tick-secret... }
//
// — "if unset, the endpoint is open", in its own words. WORKFLOWS_TICK_SECRET
// was never set in production, and the path is allowlisted in proxy.ts
// isPublicPath, so this was a public, unauthenticated URL that drained scheduled
// jobs for anyone who found it. It is exactly the `if (expected)` no-op that
// cron-auth.ts's header says was replaced on every cron route in PR #68; this
// one was missed because it is not in vercel.json, so nothing listed it as a
// cron.
//
// It mattered more after 2026-09-11. processScheduledJobs moved to the
// service-role client (it has no user session to run as), and migration 0051
// closes the anon RLS policies that would otherwise have limited it. An open URL
// in front of a service-role writer is the one combination that must not ship.
//
// Now: checkCronAuth — Authorization: Bearer $CRON_SECRET, which Vercel Cron
// sends automatically. CRON_SECRET is already set. No secret configured means
// 503, not "run for anyone".
//
// NOT SCHEDULED: this path is deliberately absent from vercel.json, so no cron
// calls it today. The admin "Run scheduled jobs" button on /workflows does not
// go through HTTP — it calls processScheduledJobs directly behind
// assertRole("admin") (app/workflows/actions.ts tickScheduledJobs) — so closing
// this route does not affect it. To schedule it, add it to vercel.json AND
// lib/cron-paths.ts; e2e/logic/cron-registration.spec.ts enforces the pairing.

import { NextResponse } from "next/server";
import { checkCronAuth } from "@/lib/cron-auth";
import { processScheduledJobs } from "@/lib/workflows.server";

async function handle(request: Request): Promise<Response> {
  const denied = checkCronAuth(request);
  if (denied) return denied;

  try {
    const result = await processScheduledJobs({ limit: 50 });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
