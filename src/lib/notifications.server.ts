import "server-only";
import { createClient } from "./supabase/server";
import { getCurrentUser } from "./auth.server";
import type { AppNotification } from "./supabase/types";

// In-app notifications (migration 0034). Backs the team-tagging (@mention)
// feature — an @mention inside an onboarding task writes a notification row
// for the mentioned teammate.

// Mentions attached to a set of onboarding checklist items, grouped by item id
// so each ItemRow can render its own inline thread. Oldest-first within an item.
export async function listItemMentions(
  itemIds: string[],
): Promise<Map<string, AppNotification[]>> {
  const byItem = new Map<string, AppNotification[]>();
  if (itemIds.length === 0) return byItem;

  const sb = await createClient();
  const { data, error } = await sb
    .from("notifications")
    .select("*")
    .eq("entity_type", "onboarding_checklist_item")
    .in("entity_id", itemIds)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  for (const n of (data ?? []) as AppNotification[]) {
    if (!n.entity_id) continue;
    const arr = byItem.get(n.entity_id) ?? [];
    arr.push(n);
    byItem.set(n.entity_id, arr);
  }
  return byItem;
}

// The signed-in user's notification feed. Matches on the linked team_member_id
// when the profile has one, otherwise falls back to a name match (covers the
// auth-off / shared-login case). Most-recent first.
export async function listMyNotifications(): Promise<{
  notifications: AppNotification[];
  unread: number;
  viewerName: string;
}> {
  const me = await getCurrentUser();
  const viewerName = me?.profile.full_name ?? me?.email ?? "";
  const teamMemberId = me?.profile.team_member_id ?? null;

  const sb = await createClient();
  let query = sb.from("notifications").select("*");
  if (teamMemberId) {
    query = query.or(
      `recipient_team_member_id.eq.${teamMemberId},recipient_name.ilike.${viewerName}`,
    );
  } else if (viewerName) {
    query = query.ilike("recipient_name", viewerName);
  } else {
    return { notifications: [], unread: 0, viewerName };
  }
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const notifications = (data ?? []) as AppNotification[];
  const unread = notifications.filter((n) => !n.read_at).length;
  return { notifications, unread, viewerName };
}

// Lightweight unread count for the sidebar badge. Count-only (head:true, no
// rows fetched) and error-safe — returns 0 on any failure (missing table, no
// viewer) so the Shell never breaks a page over a notification lookup. Mirrors
// the recipient matching in listMyNotifications().
export async function countUnreadNotifications(): Promise<number> {
  try {
    const me = await getCurrentUser();
    const viewerName = me?.profile.full_name ?? me?.email ?? "";
    const teamMemberId = me?.profile.team_member_id ?? null;
    if (!teamMemberId && !viewerName) return 0;

    const sb = await createClient();
    let query = sb
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .is("read_at", null);
    if (teamMemberId) {
      query = query.or(
        `recipient_team_member_id.eq.${teamMemberId},recipient_name.ilike.${viewerName}`,
      );
    } else {
      query = query.ilike("recipient_name", viewerName);
    }
    const { count, error } = await query;
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}
