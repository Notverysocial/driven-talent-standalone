import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Build a Supabase client wired to the proxy (Next 16 middleware) request
// and response so the auth cookie can be refreshed on every navigation.
// Mirrors the pattern from @supabase/ssr's official Next.js guide, adapted
// for Next 16's `proxy.ts` file convention.
export function createMiddlewareClient(request: NextRequest) {
  const response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(toSet) {
          for (const { name, value } of toSet) {
            request.cookies.set(name, value);
          }
          for (const { name, value, options } of toSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  return { supabase, response };
}
