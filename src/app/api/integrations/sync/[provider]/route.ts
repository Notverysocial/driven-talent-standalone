import { NextResponse } from "next/server";
import { assertRole } from "@/lib/auth.server";
import { getClient } from "@/lib/integrations/registry";
import { isIntegrationProvider } from "@/lib/integrations/types";
import {
  getIntegration,
  recordSyncEnd,
  recordSyncStart,
} from "@/lib/integrations/db";

// POST /api/integrations/sync/<provider>
//
// Manual sync trigger from the /integrations admin page. Gated to
// owner/admin via assertRole. Runs the same recordSyncStart -> sync
// -> recordSyncEnd lifecycle the cron uses, but ignores
// next_sync_at — admins can force a sync any time.

export async function POST(
  _request: Request,
  context: { params: Promise<{ provider: string }> },
): Promise<NextResponse> {
  try {
    await assertRole("admin");
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Forbidden" },
      { status: 403 },
    );
  }

  const { provider } = await context.params;
  if (!isIntegrationProvider(provider)) {
    return NextResponse.json(
      { ok: false, error: "unknown_provider" },
      { status: 404 },
    );
  }

  const row = await getIntegration(provider);
  if (!row) {
    return NextResponse.json(
      { ok: false, error: "integration_row_missing" },
      { status: 404 },
    );
  }
  if (row.status === "disconnected") {
    return NextResponse.json(
      { ok: false, error: "not_connected" },
      { status: 409 },
    );
  }

  const client = getClient(provider);

  await recordSyncStart(provider);
  try {
    const result = await client.sync(row);
    await recordSyncEnd(
      provider,
      result.ok,
      result.count ?? 0,
      result.ok ? null : (result.error ?? "sync_failed"),
    );
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "sync_threw";
    await recordSyncEnd(provider, false, 0, msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
