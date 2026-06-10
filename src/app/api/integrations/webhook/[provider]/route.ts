import { NextResponse } from "next/server";
import { getClient } from "@/lib/integrations/registry";
import { isIntegrationProvider } from "@/lib/integrations/types";

// POST /api/integrations/webhook/<provider>
//
// Public endpoint. The provider client is responsible for verifying
// the signature header — we just route. Returning ok=false from the
// client surfaces as 401; ok=true responds 200.

export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> },
): Promise<NextResponse> {
  const { provider } = await context.params;

  if (!isIntegrationProvider(provider)) {
    return NextResponse.json(
      { ok: false, error: "unknown_provider" },
      { status: 404 },
    );
  }

  const client = getClient(provider);
  if (!client.handleWebhook) {
    return NextResponse.json(
      { ok: false, error: "webhook_not_supported" },
      { status: 404 },
    );
  }

  try {
    const result = await client.handleWebhook(request);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error ?? "webhook_rejected" },
        { status: 401 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "webhook_threw";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// Some providers (Calendly, others) verify the endpoint exists by
// hitting GET first. Reply 200 so the registration succeeds.
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true });
}
