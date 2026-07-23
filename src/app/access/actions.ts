"use server";

import { revalidatePath } from "next/cache";
import { assertRole, requireUser } from "@/lib/auth.server";
import {
  deleteAccessUser,
  inviteAccessUser,
  resetUserPassword,
  setUserRole,
} from "@/lib/users.server";
import type { AppRole } from "@/lib/supabase/types";

function asRole(input: FormDataEntryValue | null): AppRole {
  const v = typeof input === "string" ? input : "";
  if (v === "owner" || v === "admin" || v === "user") return v;
  return "user";
}

export type InviteState = {
  error?: string;
  ok?: string;
  // Auth Option A — admin sees the temp password to share out-of-band.
  tempPassword?: string;
  email?: string;
};

export async function inviteUser(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  try {
    await assertRole("admin");
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const fullName = String(formData.get("full_name") ?? "").trim() || null;
    const role = asRole(formData.get("role"));
    const customPassword =
      String(formData.get("password") ?? "").trim() || undefined;

    // Only owners can mint other owners; admins can invite users + admins.
    if (role === "owner") {
      await assertRole("owner");
    }

    const { password } = await inviteAccessUser(email, role, fullName, customPassword);
    revalidatePath("/access");
    return {
      ok: `Account created for ${email}`,
      tempPassword: password,
      email,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invite failed";
    return { error: msg };
  }
}

export async function changeUserRole(formData: FormData): Promise<void> {
  await assertRole("admin");
  const userId = String(formData.get("user_id") ?? "");
  const role = asRole(formData.get("role"));
  if (!userId) throw new Error("Missing user id");

  // Only owners can promote anyone to owner, or change an existing owner.
  if (role === "owner") {
    await assertRole("owner");
  }

  // Guardrail: a user cannot demote themselves out of owner. Prevents
  // the only-owner-locks-themselves-out failure mode.
  const me = await requireUser();
  if (me && me.id === userId && me.profile.role === "owner" && role !== "owner") {
    throw new Error("You cannot demote yourself out of owner.");
  }

  await setUserRole(userId, role);
  revalidatePath("/access");
}

export type ResetState = {
  error?: string;
  ok?: string;
  tempPassword?: string;
  email?: string;
};

export async function resetPassword(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  try {
    await assertRole("admin");
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    if (!email) throw new Error("Missing email");
    const { password } = await resetUserPassword(email);
    revalidatePath("/access");
    return {
      ok: `Password reset for ${email}`,
      tempPassword: password,
      email,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Reset failed";
    return { error: msg };
  }
}

export async function removeUser(formData: FormData): Promise<void> {
  await assertRole("admin");
  const userId = String(formData.get("user_id") ?? "");
  if (!userId) throw new Error("Missing user id");

  // Cannot remove yourself.
  const me = await requireUser();
  if (me && me.id === userId) {
    throw new Error("You cannot remove your own account from /access.");
  }

  await deleteAccessUser(userId);
  revalidatePath("/access");
}
