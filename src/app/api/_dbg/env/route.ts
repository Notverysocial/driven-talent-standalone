// TEMPORARY diagnostic endpoint - returns the Supabase project URL only (non-secret).
// Used to bootstrap a one-time migration tooling pass. Will be removed in the
// immediate follow-up commit.
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("t");
  if (token !== "dbg-2026-06-09-fffisc") {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  return NextResponse.json({
    supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
    has_anon: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    has_service: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
}
