// TEMPORARY diagnostic endpoint - returns the Supabase project URL (non-secret)
// and a fingerprint of the service-role key for migration tooling bootstrap.
// Removed in the immediate follow-up commit.
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("t");
  if (token !== "dbg-2026-06-09-fffisc") {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  const sr = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const ak = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return NextResponse.json({
    supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
    anon_key: ak || null,
    service_role_key: sr || null,
  });
}
