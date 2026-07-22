import { NextResponse, type NextRequest } from "next/server";
import { createMiddlewareClient } from "@/lib/supabase/middleware";
import { isCronPath } from "@/lib/cron-paths";
import { isWebhookPath } from "@/lib/webhook-paths";

// Wave 3.1 — Next 16 calls this file `proxy.ts` (it was `middleware.ts`
// in Next 15). The function/config shape is unchanged.
//
// Purpose: optimistic auth gate + Supabase session refresh on every
// request. Edge-side, cookie-only check — the authoritative role check
// happens in `requireUser` / `requireRole` (src/lib/auth.server.ts) at
// the page and action layer.
//
// AUTH_ENABLED feature flag (default OFF): when unset the proxy is a
// pass-through — no /login redirect, no Supabase session refresh, no
// auth cookies touched. Matches the v1 "open" UX. Flip to "true" to
// activate the full Wave 3.1 gate. Kept inline (not imported from
// auth.server.ts) because middleware runs on the Edge runtime and must
// not pull in "server-only" modules.
const AUTH_ENABLED = process.env.AUTH_ENABLED === "true";

// Public paths that should NEVER be gated. Includes /login and the
// auth callback routes, the bug-report writer API (used by the public
// site), the workflow tick endpoint (called by Vercel Cron with its
// own shared-secret), the external applicant-intake API (used by
// driven-talent.com with its own shared-secret), the read-only
// site-traffic analytics proxy (aggregate data only, no PII; safe to
// expose so the dashboard can fetch it via a server-side `fetch`), and
// the Build Direct submission endpoint (a write-only feedback intake
// that creates a ClickUp ticket; submitters are not necessarily logged
// in, so gating it 307-redirected the widget's fetch to /login and
// broke submits).
function isPublicPath(pathname: string): boolean {
  if (pathname === "/login") return true;
  if (pathname.startsWith("/auth/")) return true;
  if (pathname === "/api/intake/application") return true;
  if (pathname === "/api/workflows/tick") return true;
  if (pathname === "/api/analytics/site-traffic") return true;
  if (pathname === "/api/build-direct/submit") return true;
  // Every Vercel Cron endpoint. These carry no session, so gating them here
  // 307s them to /login and the handler never runs — no log line, no database
  // write, no trace. /api/leads/notify used to be the only one listed, which is
  // why it was the only cron that worked; the other three were dead for weeks.
  // The list lives in cron-paths.ts and is diffed against vercel.json by
  // e2e/logic/cron-registration.spec.ts, so this cannot silently drift again.
  //
  // Being public here does NOT make these endpoints open: each one enforces
  // CRON_SECRET itself via checkCronAuth, which fails closed when the secret
  // is unset (src/lib/cron-auth.ts).
  if (isCronPath(pathname)) return true;
  // Every inbound provider webhook. Same failure mode as the cron block above,
  // one step further in: a provider callback carries no session, so gating it
  // here 307s it to /login and the handler never runs. Calendly bookings were
  // being delivered and bounced at the door — invisible, because a webhook that
  // never arrives looks exactly like a provider that never sent one.
  //
  // Same caveat as the cron block: public here means "not session-gated", not
  // "unprotected". Each provider's handleWebhook verifies its own signature
  // against integrations.webhook_secret and now REFUSES when that secret is
  // unset (src/lib/integrations/webhook-auth.ts) — because allowlisting these
  // paths removes the accidental protection the 307 was providing, and
  // "public + unset secret" is an open write endpoint.
  //
  // The list lives in webhook-paths.ts and is diffed against the providers that
  // actually implement handleWebhook by
  // e2e/logic/webhook-registration.spec.ts, so this cannot silently drift.
  if (isWebhookPath(pathname)) return true;
  // Public bug/feedback intake — the form at /report and its write endpoint.
  // Both must be open: the whole point is that someone who is not signed in
  // (or cannot sign in, because the thing they are reporting IS the login)
  // can still tell us. Gating either one would 307 to /login and the report
  // would be lost.
  //
  // Same caveat as the cron block: public here means "not session-gated", not
  // "unprotected". /api/report/submit does its own validation, honeypot, spam
  // scoring, and rate limiting in the handler, none of which depend on
  // AUTH_ENABLED. The resolver at /api/bug-reports/attachment is deliberately
  // NOT listed — but it does not lean on that either, because both this proxy
  // and requireUser() no-op on the same AUTH_ENABLED flag; its real control is
  // a must-exist-in-bug_reports check. See that file's header.
  if (pathname === "/report") return true;
  if (pathname === "/api/report/submit") return true;
  return false;
}

export async function proxy(request: NextRequest) {
  if (!AUTH_ENABLED) return NextResponse.next();

  const { supabase, response } = createMiddlewareClient(request);

  // Refresh the session cookie if needed. getUser() validates against
  // the Supabase Auth server; getSession() alone is not enough because
  // it trusts the cookie without verification.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;
  const isPublic = isPublicPath(pathname);

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    // Preserve the original destination so the login form can bounce
    // the user back after a successful sign-in.
    if (pathname !== "/" && pathname !== "/login") {
      url.searchParams.set("next", pathname + (search || ""));
    }
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

// Skip Next.js internals and static assets — auth gating runs on every
// real page + API request.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map)$).*)",
  ],
};
