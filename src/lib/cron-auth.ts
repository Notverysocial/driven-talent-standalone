// Shared CRON_SECRET enforcement for every scheduled endpoint.
//
// WHY THIS REPLACED THE PER-ROUTE COPIES: all five cron routes had the same
// snippet —
//
//     const expected = process.env.CRON_SECRET;
//     if (expected) { ...check bearer... }
//
// — which does NOTHING when CRON_SECRET is unset. That was survivable only
// because the proxy was 307-redirecting these paths to /login, so an
// unauthenticated caller never reached the handler anyway. The middleware
// bounce was accidentally the only thing protecting them.
//
// Allowlisting the paths (which is what makes the crons actually run) removes
// that accidental protection. So the secret check has to become real: this
// FAILS CLOSED. No secret configured means the endpoint refuses to run, rather
// than running for anyone who finds the URL.

export type CronAuthVerdict =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string };

/**
 * Pure core, so the fail-closed rule is testable without a server.
 *
 * @param secret     process.env.CRON_SECRET
 * @param authHeader the request's Authorization header
 */
export function evaluateCronAuth(
  secret: string | undefined | null,
  authHeader: string | null | undefined,
): CronAuthVerdict {
  if (!secret || secret.trim() === "") {
    // Fail closed. Previously this branch meant "no check at all".
    return {
      ok: false,
      status: 503,
      error:
        "CRON_SECRET is not configured — refusing to run a scheduled job on an unauthenticated endpoint.",
    };
  }

  const header = authHeader ?? "";
  if (!header.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  const got = header.slice("Bearer ".length);
  if (!constantTimeEquals(got, secret)) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  return { ok: true };
}

// Length-independent comparison. Not the strongest primitive available, but it
// avoids the early-exit of === on a secret compare and works on every runtime
// this repo deploys to (Edge included) without a node:crypto import.
function constantTimeEquals(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/**
 * Route-handler helper. Returns null when the caller is authorised, otherwise
 * the Response to return immediately.
 *
 *     const denied = checkCronAuth(request);
 *     if (denied) return denied;
 */
export function checkCronAuth(request: Request): Response | null {
  const verdict = evaluateCronAuth(
    process.env.CRON_SECRET,
    request.headers.get("authorization"),
  );
  if (verdict.ok) return null;
  return Response.json(
    { ok: false, error: verdict.error },
    { status: verdict.status },
  );
}
