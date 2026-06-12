import { NextResponse } from "next/server";
import { getClient } from "@/lib/integrations/registry";
import { isIntegrationProvider } from "@/lib/integrations/types";

// GET /api/integrations/oauth/<provider>/callback?code=...&state=...
//
// Provider redirects here after the user authorizes. We look up the
// provider's client from the registry and call exchangeOAuthCode.
// The client is responsible for storing the tokens (via
// storeOAuthTokens in db.ts) — we only handle routing here.

export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> },
): Promise<NextResponse> {
  const { provider } = await context.params;
  const url = new URL(request.url);
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? url.origin;

  if (!isIntegrationProvider(provider)) {
    return NextResponse.redirect(`${origin}/integrations?error=unknown_provider`);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const providerError = url.searchParams.get("error");

  if (providerError) {
    return NextResponse.redirect(
      `${origin}/integrations?error=${encodeURIComponent(provider)}&reason=${encodeURIComponent(providerError)}`,
    );
  }
  if (!code) {
    return NextResponse.redirect(
      `${origin}/integrations?error=${encodeURIComponent(provider)}&reason=missing_code`,
    );
  }

  const client = getClient(provider);
  if (!client.exchangeOAuthCode) {
    return NextResponse.redirect(
      `${origin}/integrations?error=${encodeURIComponent(provider)}&reason=oauth_not_supported`,
    );
  }

  try {
    const result = await client.exchangeOAuthCode(code, state);
    if (!result.ok) {
      return NextResponse.redirect(
        `${origin}/integrations?error=${encodeURIComponent(provider)}&reason=${encodeURIComponent(result.error ?? "exchange_failed")}`,
      );
    }
    return NextResponse.redirect(
      `${origin}/integrations?connected=${encodeURIComponent(provider)}`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "exchange_failed";
    return NextResponse.redirect(
      `${origin}/integrations?error=${encodeURIComponent(provider)}&reason=${encodeURIComponent(msg)}`,
    );
  }
}
