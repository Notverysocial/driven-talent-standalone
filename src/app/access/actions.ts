"use server";

import { revalidatePath } from "next/cache";
import { assertRole, getCurrentUser } from "@/lib/auth.server";
import {
  deleteAccessUser,
  inviteAccessUser,
  sendPasswordReset,
  setUserRole,
} from "@/lib/users.server";
import type { AppRole } from "@/lib/supabase/types";

function asRole(input: FormDataEntryValue | null): AppRole {
  const v = typeof input === "string" ? input : "";
  if (v === "owner" || v === "admin" || v === "user") return v;
  return "user";
}

export type InviteState = { error?: string; ok?: string };

export async function inviteUser(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  try {
    await assertRole("admin");
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const fullName = String(formData.get("full_name") ?? "").trim() || null;
    const role = asRole(formData.get("role"));

    // Only owners can mint other owners; admins can invite users + admins.
    if (role === "owner") {
      await assertRole("owner");
    }

    await inviteAccessUser(email, role, fullName);
    revalidatePath("/access");
    return { ok: `Invite sent to ${email}` };
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
  const me = await getCurrentUser();
  if (me && me.id === userId && me.profile.role === "owner" && role !== "owner") {
    throw new Error("You cannot demote yourself out of owner.");
  }

  await setUserRole(userId, role);
  revalidatePath("/access");
}

export async function resendInvite(formData: FormData): Promise<void> {
  await assertRole("admin");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) throw new Error("Missing email");
  await sendPasswordReset(email);
  revalidatePath("/access");
}

export async function removeUser(formData: FormData): Promise<void> {
  await assertRole("admin");
  const userId = String(formData.get("user_id") ?? "");
  if (!userId) throw new Error("Missing user id");

  // Cannot remove yourself.
  const me = await getCurrentUser();
  if (me && me.id === userId) {
    throw new Error("You cannot remove your own account from /access.");
  }

  await deleteAccessUser(userId);
  revalidatePath("/access");
}
