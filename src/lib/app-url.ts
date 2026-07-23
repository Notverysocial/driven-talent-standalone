// Where this app lives. One answer, resolved once.
//
// Pure and dependency-free — no "server-only", no Node built-ins — so the Edge
// proxy and the provider modules can both use it, and so the precedence rules
// run in the required CI gate.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS
//
// Every provider hardcoded its own absolute callback and webhook URL:
//
//   calendly.ts:64/66, ringcentral.ts:58/60, pandadoc.ts:48/50, indeed.ts:35/37
//
// and an `appBaseUrl()` helper existed VERBATIM TWICE — in
// inbound-lead-email.server.ts and notifications.server.ts — plus a third
// variant inline in the OAuth callback route. Five providers, eight literals,
// three resolvers, one origin.
//
// Moving the app to its own domain therefore would not break one thing loudly.
// It would break all five integrations quietly and separately, each at whatever
// moment that provider next tried to call home. The webhook half is the worse
// half: an OAuth mismatch fails in the operator's face during Connect, while a
// stale webhook URL just means callbacks stop arriving — the exact silence
// PR #79 was spent learning to recognise.
//
// It matters for the RECONNECT flow in particular. Re-registering a Calendly
// subscription writes our callback URL into the vendor's records; doing that
// while WEBHOOK_URL still points at the old origin bakes a wrong address in on
// their side, where we cannot see or grep it.
//
// ---------------------------------------------------------------------------
// TWO CONSTRAINTS THAT SHAPE THE PRECEDENCE
//
// 1. A redirect_uri must EXACTLY match the value registered in the provider's
//    OAuth app. That rules out anything that varies per deploy — see the
//    VERCEL_URL note below.
//
// 2. A request origin is derived from the Host header, which is caller-supplied.
//    It is therefore the LAST resort before the legacy constant, never
//    preferred over configuration. If it were preferred, a spoofed Host on the
//    authorize step could point a redirect_uri somewhere else. Providers reject
//    unregistered redirect URIs, so this is defence in depth rather than the
//    only control — but the ordering is deliberate, not incidental.
//
// The operational upshot: set NEXT_PUBLIC_SITE_URL (or NEXT_PUBLIC_APP_URL) in
// the deployment env and neither caveat is ever exercised.
// ---------------------------------------------------------------------------

/** The origin every provider used to hardcode. Kept as the final fallback so
 *  this change is a strict no-op for the current deployment. THIS IS THE ONLY
 *  PLACE IN THE APP ALLOWED TO NAME IT — asserted by app-base-url.spec.ts. */
export const LEGACY_PRODUCTION_ORIGIN =
  "https://driven-talent-standalone.vercel.app";

/** Trim, drop trailing slashes, and add a scheme when one is missing (the
 *  Vercel-provided vars are bare hostnames). */
function normalise(raw: string | undefined | null): string | null {
  const v = raw?.trim();
  if (!v) return null;
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  return withScheme.replace(/\/+$/, "");
}

export type AppUrlEnv = {
  NEXT_PUBLIC_SITE_URL?: string;
  NEXT_PUBLIC_APP_URL?: string;
  /** Vercel's STABLE production domain. Safe: constant across deploys. */
  VERCEL_PROJECT_PRODUCTION_URL?: string;
  /** Vercel's PER-DEPLOY URL. Deliberately unused — see below. */
  VERCEL_URL?: string;
};

/**
 * Resolve the app's public base URL, without a trailing slash.
 *
 * Precedence:
 *   1. NEXT_PUBLIC_SITE_URL            explicit, wins
 *   2. NEXT_PUBLIC_APP_URL             explicit, legacy name still in use
 *   3. VERCEL_PROJECT_PRODUCTION_URL   stable production domain
 *   4. requestOrigin                   last resort — see constraint 2 above
 *   5. LEGACY_PRODUCTION_ORIGIN        preserves today's behaviour exactly
 *
 * VERCEL_URL is NOT consulted at any point. It changes on every deploy, so a
 * redirect_uri built from it can never match what is registered with the
 * provider, and a webhook registered against it points at a deployment that
 * will not be the live one for long.
 */
export function resolveAppBaseUrl(
  env: AppUrlEnv,
  requestOrigin?: string | null,
): string {
  return (
    normalise(env.NEXT_PUBLIC_SITE_URL) ??
    normalise(env.NEXT_PUBLIC_APP_URL) ??
    normalise(env.VERCEL_PROJECT_PRODUCTION_URL) ??
    normalise(requestOrigin) ??
    LEGACY_PRODUCTION_ORIGIN
  );
}

/** Module-scope convenience for callers with no request in hand (the provider
 *  modules build their URLs at import time). */
export function appBaseUrl(requestOrigin?: string | null): string {
  return resolveAppBaseUrl(
    process.env as AppUrlEnv,
    requestOrigin,
  );
}

/** Must match src/app/api/integrations/oauth/[provider]/callback/route.ts. */
export function oauthCallbackUrl(base: string, provider: string): string {
  return `${base}/api/integrations/oauth/${provider}/callback`;
}

/** Must match webhook-paths.ts — asserted by app-base-url.spec.ts, because a
 *  disagreement here reintroduces the PR #79 outage as a path typo. */
export function webhookUrl(base: string, provider: string): string {
  return `${base}/api/integrations/webhook/${provider}`;
}
