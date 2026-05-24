// POST or GET /api/workflows/tick
//
// Drains pending workflow_scheduled_jobs whose run_at has elapsed. Wired
// from Vercel Cron (or any external scheduler) on a 1-minute cadence —
// no Redis/BullMQ needed. Safe to call by hand from the workflows page
// for testing.
//
// Optional shared-secret check via WORKFLOWS_TICK_SECRET env var (header
// `x-tick-secret`). If unset, the endpoint is open for local dev.

import { NextResponse } from "next/server";
import { processScheduledJobs } from "@/lib/workflows.server";

async function handle(request: Request): Promise<NextResponse> {
  const expected = process.env.WORKFLOWS_TICK_SECRET;
  if (expected) {
    const got = request.headers.get("x-tick-secret");
    if (got !== expected) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

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
