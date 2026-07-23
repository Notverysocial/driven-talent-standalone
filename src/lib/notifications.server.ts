import "server-only";
import { createClient } from "./supabase/server";
import { getCurrentUser } from "./auth.server";
import { sendEmail } from "./email/resend.server";
import type { AppNotification } from "./supabase/types";
import { appBaseUrl } from "@/lib/app-url";

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

// ---- Email notification (Resend) ----------------------------------------
// Sends a real email when a teammate is mentioned/notified, so they're alerted
// without living in the app. FAIL-SAFE end to end: skips cleanly if there's no
// recipient email or no RESEND_API_KEY, and never throws (delegates to the
// fail-safe sendEmail). Call this on notification CREATION only — never batch
// over existing rows.


function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendMentionEmail(args: {
  toEmail: string | null | undefined;
  toName: string;
  actorName: string;
  message: string;
  taskLabel?: string | null;
  linkPath: string;
}): Promise<void> {
  const to = (args.toEmail ?? "").trim();
  if (!to) return; // no email on file → skip silently

  try {
    const path = args.linkPath.startsWith("/")
      ? args.linkPath
      : `/${args.linkPath}`;
    const url = `${appBaseUrl()}${path}`;
    const ctx = args.taskLabel ? ` on “${args.taskLabel}”` : "";
    const subject = `${args.actorName} mentioned you${ctx} · Driven Talent`;

    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.5">
        <p><strong>${escapeHtml(args.actorName)}</strong> mentioned you${
          args.taskLabel ? ` on <strong>${escapeHtml(args.taskLabel)}</strong>` : ""
        }:</p>
        <blockquote style="margin:12px 0;padding:10px 14px;border-left:3px solid #C9A227;background:#faf7ef;color:#333">
          ${escapeHtml(args.message)}
        </blockquote>
        <p style="margin-top:18px">
          <a href="${url}" style="display:inline-block;background:#C9A227;color:#0a0a0a;text-decoration:none;font-weight:600;padding:9px 16px;border-radius:4px">Open in Driven Talent →</a>
        </p>
        <p style="margin-top:16px;font-size:12px;color:#888">
          You’re receiving this because you were tagged in the Driven Talent dashboard.
        </p>
      </div>`;

    const text =
      `${args.actorName} mentioned you${ctx}:\n\n` +
      `"${args.message}"\n\n` +
      `Open in Driven Talent: ${url}\n`;

    // sendEmail is itself fail-safe; the extra try/catch guarantees this can
    // never bubble up and break the notification insert.
    await sendEmail({ to, subject, html, text });
  } catch (e) {
    console.error(
      "[notifications] sendMentionEmail failed (non-fatal):",
      e instanceof Error ? e.message : String(e),
    );
  }
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
