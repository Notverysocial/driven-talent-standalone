import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Supabase Auth redirects here after an email link (invite,
// password reset, email confirmation). The `code` query param is
// exchanged for a session cookie that the proxy then trusts on
// subsequent requests.
//
// Public path — see proxy.ts isPublicPath: anything under /auth/ is
// allowed pre-session so the exchange can complete.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const rawNext = url.searchParams.get("next") ?? "/dashboard";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") && rawNext !== "/login"
      ? rawNext
      : "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, url.origin));
    }
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("err", error.message);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.redirect(new URL("/login", url.origin));
}
