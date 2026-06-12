import { NextResponse } from "next/server";
import { getClient } from "@/lib/integrations/registry";
import { isIntegrationProvider } from "@/lib/integrations/types";

// POST /api/integrations/webhook/<provider>
//
// Public endpoint. The provider client is responsible for verifying
// the signature header — we just route. Returning ok=false from the
// client surfaces as 401; ok=true responds 200.
//
// RingCentral subscription-validation handshake: RingCentral sends an
// initial POST with a `Validation-Token` header that must be echoed back
// in the response within 5 seconds. We detect that header at the route
// layer (before invoking the provider client) and respond immediately so
// the subscription registration succeeds. The detection is generic — any
// future provider using the same handshake pattern picks it up for free.

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

  // Validation-Token echo (RingCentral). Must short-circuit BEFORE any
  // body consumption so the provider client can still read the body on
  // subsequent real events.
  const validationToken = request.headers.get("validation-token");
  if (validationToken) {
    return new NextResponse(null, {
      status: 200,
      headers: { "Validation-Token": validationToken },
    });
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