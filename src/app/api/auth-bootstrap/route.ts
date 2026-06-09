/**
 * One-time owner bootstrap endpoint.
 *
 * POST /api/auth-bootstrap
 *
 * Solves the chicken-and-egg problem of needing an admin/owner account
 * to call /access#invite when no admin/owner exists yet. The endpoint:
 *
 *   1. Requires header `x-bootstrap-secret` to match env BOOTSTRAP_SECRET.
 *   2. Refuses to run if any profile already has role='owner' — the
 *      endpoint is idempotent / no-op once seeded.
 *   3. Creates a Supabase auth user with email_confirm=true (Option A —
 *      no email sent), promotes the matching profile to role='owner',
 *      and returns the temp password in the response body.
 *
 * Once the first owner exists, this endpoint will always return 409.
 * Safe to leave deployed; can be deleted in a follow-up commit.
 *
 * Body: { "email": "...", "fullName": "...", "password"?: "..." }
 *   - password optional; auto-generated if absent.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  generateTempPassword,
} from "@/lib/users.server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const expected = process.env.BOOTSTRAP_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "BOOTSTRAP_SECRET env var not configured." },
      { status: 503 },
    );
  }
  const provided = req.headers.get("x-bootstrap-secret");
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: { email?: string; fullName?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const fullName = (body.fullName ?? "").trim() || null;
  const customPassword = (body.password ?? "").trim() || undefined;

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required." }, { status: 400 });
  }

  const admin = createServiceClient();

  // Idempotency guard: refuse if any owner already exists.
  const { data: existingOwners, error: ownerCheckErr } = await admin
    .from("profiles")
    .select("id, email")
    .eq("role", "owner")
    .limit(1);
  if (ownerCheckErr) {
    return NextResponse.json(
      { error: `Owner check failed: ${ownerCheckErr.message}` },
      { status: 500 },
    );
  }
  if (existingOwners && existingOwners.length > 0) {
    return NextResponse.json(
      {
        error:
          "An owner already exists. Bootstrap is one-shot; use /access to invite further users.",
        existingOwnerEmail: existingOwners[0].email ?? null,
      },
      { status: 409 },
    );
  }

  const finalPassword =
    customPassword && customPassword.length >= 8
      ? customPassword
      : generateTempPassword();

  // Check if the auth user already exists by email — if so, just reset
  // their password and promote them to owner. Otherwise create fresh.
  let userId: string | null = null;
  {
    for (let page = 1; page <= 5; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) {
        return NextResponse.json(
          { error: `listUsers failed: ${error.message}` },
          { status: 500 },
        );
      }
      const match = data.users.find(
        (u) => (u.email ?? "").toLowerCase() === email,
      );
      if (match) {
        userId = match.id;
        break;
      }
      if (data.users.length < 200) break;
    }
  }

  if (userId) {
    // Existing user — just reset the password.
    const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
      password: finalPassword,
      email_confirm: true,
      user_metadata: fullName ? { full_name: fullName } : undefined,
    });
    if (updErr) {
      return NextResponse.json(
        { error: `updateUserById failed: ${updErr.message}` },
        { status: 500 },
      );
    }
  } else {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: finalPassword,
      email_confirm: true,
      user_metadata: fullName ? { full_name: fullName } : undefined,
    });
    if (createErr) {
      return NextResponse.json(
        { error: `createUser failed: ${createErr.message}` },
        { status: 500 },
      );
    }
    userId = created.user?.id ?? null;
    if (!userId) {
      return NextResponse.json(
        { error: "createUser succeeded but returned no user id." },
        { status: 500 },
      );
    }
  }

  // Upsert the profile row (post-signup trigger should have inserted
  // it, but if not, we backfill).
  const { error: upErr } = await admin.from("profiles").upsert(
    {
      id: userId,
      email,
      full_name: fullName,
      role: "owner",
    },
    { onConflict: "id" },
  );
  if (upErr) {
    return NextResponse.json(
      { error: `profiles upsert failed: ${upErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    userId,
    email,
    password: finalPassword,
    note: "Save this password — share with the user via Signal or text. The endpoint will refuse to run again now that an owner exists.",
  });
}
