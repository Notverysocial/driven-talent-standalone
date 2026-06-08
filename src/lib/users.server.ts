import "server-only";
import { createClient, createServiceClient } from "./supabase/server";
import type { AppRole, Profile } from "./supabase/types";

// Access-management helpers for the /access admin page.
//
// Reads use the service-role client so the admin page sees every
// profile + auth metadata. Writes use the service-role client because
// inviting a user creates a row in auth.users (admin API only) and
// changing a role updates another user's profile row. Role gating
// happens at the page + action layer.

export type AccessUser = Profile & {
  last_sign_in_at: string | null;
  invited_at: string | null;
  confirmed_at: string | null;
};

export async function listAccessUsers(): Promise<AccessUser[]> {
  const admin = createServiceClient();

  const { data: profiles, error: profileErr } = await admin
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });
  if (profileErr) throw new Error(profileErr.message);

  const { data: authData, error: authErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (authErr) throw new Error(authErr.message);

  const authById = new Map(authData.users.map((u) => [u.id, u]));

  return (profiles as Profile[]).map((p) => {
    const u = authById.get(p.id);
    return {
      ...p,
      last_sign_in_at: u?.last_sign_in_at ?? null,
      invited_at: u?.invited_at ?? null,
      confirmed_at: u?.confirmed_at ?? null,
    };
  });
}

export async function inviteAccessUser(
  email: string,
  role: AppRole = "user",
  fullName: string | null = null,
): Promise<void> {
  if (!email || !email.includes("@")) {
    throw new Error("A valid email is required.");
  }

  const admin = createServiceClient();
  const redirectTo = inviteRedirect();

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: fullName ? { full_name: fullName } : undefined,
  });
  if (error) throw new Error(error.message);
  const userId = data.user?.id;
  if (!userId) throw new Error("Invite succeeded but no user id returned.");

  if (role !== "user") {
    const { error: upErr } = await admin
      .from("profiles")
      .update({ role, full_name: fullName ?? undefined })
      .eq("id", userId);
    if (upErr) throw new Error(upErr.message);
  } else if (fullName) {
    await admin.from("profiles").update({ full_name: fullName }).eq("id", userId);
  }
}

export async function setUserRole(userId: string, role: AppRole): Promise<void> {
  const admin = createServiceClient();
  const { error } = await admin
    .from("profiles")
    .update({ role })
    .eq("id", userId);
  if (error) throw new Error(error.message);
}

export async function sendPasswordReset(email: string): Promise<void> {
  const sb = await createClient();
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: inviteRedirect(),
  });
  if (error) throw new Error(error.message);
}

export async function deleteAccessUser(userId: string): Promise<void> {
  const admin = createServiceClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);
}

function inviteRedirect(): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return base.replace(/\/$/, "") + "/auth/callback";
}
