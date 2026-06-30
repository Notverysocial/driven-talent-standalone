"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth.server";

export async function markNotificationRead(id: string) {
  const sb = await createClient();
  const { error } = await sb
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .is("read_at", null);
  if (error) throw new Error(error.message);
  revalidatePath("/notifications");
}

// Mark every unread notification addressed to the current user as read.
export async function markAllNotificationsRead() {
  const me = await getCurrentUser();
  const viewerName = me?.profile.full_name ?? me?.email ?? "";
  const teamMemberId = me?.profile.team_member_id ?? null;
  if (!teamMemberId && !viewerName) return;

  const sb = await createClient();
  const now = new Date().toISOString();
  let query = sb.from("notifications").update({ read_at: now }).is("read_at", null);
  query = teamMemberId
    ? query.or(
        `recipient_team_member_id.eq.${teamMemberId},recipient_name.ilike.${viewerName}`,
      )
    : query.ilike("recipient_name", viewerName);
  const { error } = await query;
  if (error) throw new Error(error.message);
  revalidatePath("/notifications");
}
