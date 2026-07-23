"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth.server";
import { createClient } from "@/lib/supabase/server";

// /account server actions — let a signed-in user edit their own
// full_name and rotate their own password. Both run as the user (the
// cookie-bound supabase client), NOT the service role. RLS allows a
// user to UPDATE their own row in `profiles`, and `auth.updateUser`
// runs against the user's own session, not admin escalation.
//
// The password flow re-authenticates with the current password before
// updating — required even though Supabase will accept the update
// against an already-signed-in session. Without it, anyone who walks
// up to an unlocked browser could silently take the account over.

export type ProfileState = { error?: string; ok?: string };
export type PasswordState = { error?: string; ok?: string };

const FULL_NAME_MAX = 200;

export async function updateProfile(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const me = await requireUser();
  if (!me) return { error: "Not signed in." };

  const raw = String(formData.get("full_name") ?? "");
  const fullName = raw.trim();
  if (!fullName) return { error: "Name is required." };
  if (fullName.length > FULL_NAME_MAX) {
    return { error: `Name must be ${FULL_NAME_MAX} characters or fewer.` };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", me.id);

  if (error) return { error: error.message };

  revalidatePath("/account");
  return { ok: "Profile updated." };
}

export async function changePassword(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const me = await requireUser();
  if (!me) return { error: "Not signed in." };
  if (!me.email) {
    return {
      error:
        "Your account has no email on file — contact your administrator.",
    };
  }

  const currentPassword = String(formData.get("current_password") ?? "");
  const newPassword = String(formData.get("new_password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { error: "All three password fields are required." };
  }
  if (newPassword.length < 8) {
    return { error: "New password must be at least 8 characters." };
  }
  if (newPassword !== confirmPassword) {
    return { error: "New password and confirmation don't match." };
  }
  if (newPassword === currentPassword) {
    return { error: "New password must be different from the current one." };
  }

  const supabase = await createClient();

  // Re-authenticate against the current password. This calls Supabase
  // Auth with the user's email + the password they typed; if it fails
  // we refuse the update. signInWithPassword on success replaces the
  // current session with a fresh one for the same user — that's fine,
  // the updateUser call below will still work.
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: me.email,
    password: currentPassword,
  });
  if (signInError) {
    return { error: "Current password is incorrect." };
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });
  if (updateError) return { error: updateError.message };

  return { ok: "Password changed. You'll stay signed in." };
}
