import "server-only";
import { createServiceClient } from "./supabase/server";
import type { AppRole, Profile } from "./supabase/types";

// Access-management helpers for the /access admin page.
//
// Reads use the service-role client so the admin page sees every
// profile + auth metadata. Writes use the service-role client because
// inviting a user creates a row in auth.users (admin API only) and
// changing a role updates another user's profile row. Role gating
// happens at the page + action layer.
//
// Auth model: Option A — admin sets the initial password directly and
// shares it with the user out-of-band (Signal / text). Zero emails are
// sent. Password resets work the same way: admin generates a new temp
// password, shares it manually. No Supabase invite or reset-email
// round-trips are used anywhere in this file.

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

// Generates a readable 14-char password in the format XXXX-XXXX-XXXX
// using ambiguity-safe alphanumerics. Easy to type out over Signal/text.
export function generateTempPassword(): string {
  // Removed: 0/O, 1/l/I — readable when shared verbally or in a screenshot.
  const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const pick = () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  const block = (n: number) => Array.from({ length: n }, pick).join("");
  return `${block(4)}-${block(4)}-${block(4)}`;
}

export async function inviteAccessUser(
  email: string,
  role: AppRole = "user",
  fullName: string | null = null,
  password?: string,
): Promise<{ userId: string; password: string }> {
  if (!email || !email.includes("@")) {
    throw new Error("A valid email is required.");
  }

  const admin = createServiceClient();
  const finalPassword =
    password && password.trim().length >= 8 ? password.trim() : generateTempPassword();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: finalPassword,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : undefined,
  });
  if (error) throw new Error(error.message);
  const userId = data.user?.id;
  if (!userId) throw new Error("createUser succeeded but no user id returned.");

  // Update profiles row (the post-signup trigger should have created one;
  // we update role + full_name regardless). Service-role bypasses RLS.
  const updates: Partial<Profile> = {};
  if (role !== "user") updates.role = role;
  if (fullName) updates.full_name = fullName;
  if (Object.keys(updates).length > 0) {
    const { error: upErr } = await admin
      .from("profiles")
      .update(updates)
      .eq("id", userId);
    if (upErr) throw new Error(upErr.message);
  }

  return { userId, password: finalPassword };
}

export async function setUserRole(userId: string, role: AppRole): Promise<void> {
  const admin = createServiceClient();
  const { error } = await admin
    .from("profiles")
    .update({ role })
    .eq("id", userId);
  if (error) throw new Error(error.message);
}

// Generates a fresh temp password and writes it onto the user's auth row.
// Returns the new password so the admin UI can display it and the owner
// can share it via Signal/text. No reset email is sent.
export async function resetUserPassword(email: string): Promise<{ userId: string; password: string }> {
  if (!email || !email.includes("@")) {
    throw new Error("A valid email is required.");
  }

  const admin = createServiceClient();

  // Look up the user by email by paging through listUsers (the
  // user count on this app is small).
  let userId: string | null = null;
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const match = data.users.find(
      (u) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
    );
    if (match) {
      userId = match.id;
      break;
    }
    if (data.users.length < 200) break;
  }
  if (!userId) throw new Error(`No user found with email ${email}.`);

  const newPassword = generateTempPassword();
  const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
    password: newPassword,
  });
  if (updErr) throw new Error(updErr.message);

  return { userId, password: newPassword };
}

export async function deleteAccessUser(userId: string): Promise<void> {
  const admin = createServiceClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);
}
