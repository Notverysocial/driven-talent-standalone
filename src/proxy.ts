import { NextResponse, type NextRequest } from "next/server";
import { createMiddlewareClient } from "@/lib/supabase/middleware";

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
// driven-talent.com with its own shared-secret), and the one-time
// owner-bootstrap endpoint (gated by its own BOOTSTRAP_SECRET header).
function isPublicPath(pathname: string): boolean {
  if (pathname === "/login") return true;
  if (pathname.startsWith("/auth/")) return true;
  if (pathname === "/api/intake/application") return true;
  if (pathname === "/api/workflows/tick") return true;
  if (pathname === "/api/auth-bootstrap") return true;
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
