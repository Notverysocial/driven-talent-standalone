// The one list of inbound webhook endpoints. Read by BOTH the proxy allowlist
// and the gated test that diffs this against the provider implementations.
//
// WHY: this is the INBOUND twin of cron-paths.ts. With AUTH_ENABLED=true, a
// provider's callback carries no session, so any path not in the proxy's public
// list is 307-redirected to /login by the middleware BEFORE the route handler
// runs. The handler never executes, nothing is logged, nothing is written — the
// webhook simply does not exist.
//
// That is exactly what happened to /api/integrations/webhook/*: 307 on every
// callback since AUTH_ENABLED went on. Measured against production 2026-07-22:
//
//   /api/integrations/webhook/calendly → 307 → /login   (not allowlisted)
//   /api/integrations/cron             → 401            (allowlisted, own secret)
//   /api/intake/application            → 204            (allowlisted)
//
// It read as "Calendly isn't sending anything" — the reported symptom was an
// expired access token, which was a red herring: integration-truth.ts already
// treats an expired access token with a live refresh token as HEALTHY, and
// ensureFreshToken() mints a new one on demand. The bookings were being sent;
// the proxy was bouncing them at the door.
//
// PR #68 fixed the cron half of this and added a CI diff so a new cron could
// not silently go dark. Webhooks were never covered. They are now: adding a
// provider webhook without registering its path fails CI instead of failing
// silently in production.
//
// This module is imported by the Edge-runtime proxy: keep it dependency-free
// and free of any "server-only" import. That is also why the list is written
// out by hand rather than derived from the provider registry — importing the
// registry would pull every provider's server-only client into the Edge bundle.
// e2e/logic/webhook-registration.spec.ts is what keeps the hand-written list
// honest, by diffing it against the files that actually implement handleWebhook.

export const WEBHOOK_BASE = "/api/integrations/webhook";

/** The public path a provider's callbacks arrive on. */
export function webhookPathFor(provider: string): string {
  return `${WEBHOOK_BASE}/${provider}`;
}

// Only providers that actually implement handleWebhook. `prismhr` is a real
// provider but scaffold-only, so it is deliberately absent — allowlisting a
// path with nothing behind it is an endpoint exposed past the auth gate for no
// reason.
export const WEBHOOK_PATHS: readonly string[] = [
  // Booking + cancellation callbacks (invitee.created / invitee.canceled).
  // This is the path that was dark.
  webhookPathFor("calendly"),
  // Inbound call events (telephony session updates).
  webhookPathFor("ringcentral"),
  // Punch events pushed from the clock.
  webhookPathFor("uattend"),
  // E-signature document status changes.
  webhookPathFor("pandadoc"),
  // Indeed Apply applicant submissions.
  webhookPathFor("indeed"),
];

// Exact membership, never a prefix test. A prefix match would open everything
// under the segment — including traversal-shaped paths — past the auth gate.
// An unknown provider stays gated rather than reaching the route's own 404,
// which costs nothing and keeps the public surface exactly this list.
const WEBHOOK_PATH_SET = new Set(WEBHOOK_PATHS);

export function isWebhookPath(pathname: string): boolean {
  return WEBHOOK_PATH_SET.has(pathname);
}
