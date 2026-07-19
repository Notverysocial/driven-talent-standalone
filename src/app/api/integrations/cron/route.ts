import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getClient } from "@/lib/integrations/registry";
import { isIntegrationProvider } from "@/lib/integrations/types";
import type { IntegrationRow } from "@/lib/integrations/types";
import { recordSyncEnd, recordSyncStart } from "@/lib/integrations/db";

// GET /api/integrations/cron
//
// Vercel Cron hits this every 15 minutes (see vercel.json). Verifies
// the request originates from Vercel Cron via Authorization: Bearer
// <CRON_SECRET> (Vercel auto-injects this when the env var is set
// for the cron job). Drains every connected integration whose
// next_sync_at is due.
//
// Status filter: 'connected' AND 'error' rows are drained. Rows in
// 'syncing' are skipped (in-flight elsewhere).
//
// The 'error' half is a FIX, not a nicety (2026-07-19). This comment
// previously claimed error rows were "picked up again on their
// next_sync_at" while the query filtered .eq('status','connected') —
// the comment described the intent, the code did the opposite. Any
// single failed run therefore removed an integration from the cron
// PERMANENTLY: recordSyncEnd set status='error', and nothing ever
// selected it again. uAttend hit that on 2026-07-02 and went silent
// for seventeen days. recordSyncEnd does reschedule next_sync_at on
// failure, so honouring it here is all that was ever missing.

export async function GET(request: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = request.headers.get("authorization") ?? "";
    const got = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
    if (got !== expected) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 },
      );
    }
  }

  const sb = createServiceClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await sb
    .from("integrations")
    .select("*")
    .in("status", ["connected", "error"])
    .or(`next_sync_at.is.null,next_sync_at.lte.${nowIso}`);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as IntegrationRow[];
  const results: Array<{
    provider: string;
    ok: boolean;
    count?: number;
    error?: string;
  }> = [];

  for (const row of rows) {
    if (!isIntegrationProvider(row.provider)) {
      results.push({
        provider: row.provider,
        ok: false,
        error: "unknown_provider",
      });
      continue;
    }
    const client = getClient(row.provider);
    await recordSyncStart(row.provider);
    try {
      const r = await client.sync(row);
      await recordSyncEnd(
        row.provider,
        r.ok,
        r.count ?? 0,
        r.ok ? null : (r.error ?? "sync_failed"),
        r.warning ?? null,
      );
      results.push({ provider: row.provider, ...r });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "sync_threw";
      await recordSyncEnd(row.provider, false, 0, msg);
      results.push({ provider: row.provider, ok: false, error: msg });
    }
  }

  return NextResponse.json({ ok: true, ran: results.length, results });
}
