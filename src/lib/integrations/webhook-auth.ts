// The fail-closed gate every provider's handleWebhook must pass before it
// trusts a request body.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS
//
// Until the webhook paths were allowlisted (webhook-paths.ts), the proxy 307'd
// every provider callback to /login. That outage was also, accidentally, the
// only thing protecting these endpoints — because every provider verified like
// this:
//
//     const secret = integration?.webhook_secret ?? null;
//     if (secret) { ...verify HMAC... }
//
// which does NOTHING when the secret is unset. indeed.ts stated it outright:
// "If we have no secret stored, skip verification (dev / pre-go-live)".
//
// Public + unset = an unauthenticated write endpoint. These handlers create
// candidates, punch events and time cards, so that is not a theoretical
// exposure. Allowlisting the paths without this gate would have made the system
// strictly worse than the outage it fixed.
//
// This is the same fix, in the same shape, as evaluateCronAuth() — which exists
// because PR #68 hit this exact hazard on the cron side one step earlier.
//
// A missing secret is a CONFIGURATION error, not an authentication failure: it
// means the provider was connected before the subscription was registered, or
// the signing-key stash failed (calendly.ts marks that step "non-fatal"). It
// surfaces as its own error code so a 401 in the logs can be told apart from a
// genuinely forged request.
// ---------------------------------------------------------------------------

export type WebhookAuthVerdict =
  | { ok: true; secret: string }
  | { ok: false; error: string };

/**
 * Refuse unless a usable signing secret is configured.
 *
 * Returns the secret VERBATIM on success — deliberately untrimmed. Trimming
 * would silently change the HMAC input, and every signature would then fail as
 * "invalid_signature", pointing at the provider instead of at our own config.
 */
export function requireWebhookSecret(
  secret: string | null | undefined,
): WebhookAuthVerdict {
  if (secret == null || secret.trim() === "") {
    return { ok: false, error: "webhook_secret_unset" };
  }
  return { ok: true, secret };
}
