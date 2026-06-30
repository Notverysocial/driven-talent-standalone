import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/Badge";
import { listMyNotifications } from "@/lib/notifications.server";
import { markAllNotificationsRead, markNotificationRead } from "./actions";

export const dynamic = "force-dynamic";

function fmtStamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function NotificationsPage() {
  const { notifications, unread, viewerName } = await listMyNotifications();

  return (
    <Shell>
      <Topbar
        crumb="WORKSPACE / NOTIFICATIONS"
        scriptWord="Your "
        title="Notifications"
        actions={
          unread > 0 ? (
            <form action={markAllNotificationsRead}>
              <button type="submit" className="dt-btn">
                Mark all read ({unread})
              </button>
            </form>
          ) : undefined
        }
      />

      <div className="dt-card gold-edge">
        <div className="dt-card-head">
          <div>
            <h3>
              {notifications.length} {notifications.length === 1 ? "notification" : "notifications"}
            </h3>
            <div className="sub">
              {viewerName ? `For ${viewerName}` : "Sign in to see your @mentions"}
              {unread > 0 ? ` · ${unread} unread` : ""}
            </div>
          </div>
        </div>

        <div>
          {notifications.map((n) => {
            const isUnread = !n.read_at;
            const taskLabel = (n.meta?.task as string | undefined) ?? null;
            return (
              <div
                key={n.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 14,
                  padding: "14px 22px",
                  borderBottom: "1px solid var(--dt-warm-100)",
                  background: isUnread ? "var(--dt-gold-50)" : "transparent",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                    <span style={{ fontWeight: 500 }}>{n.actor_name ?? "Someone"}</span>{" "}
                    tagged you
                    {taskLabel ? (
                      <>
                        {" "}on <span style={{ fontWeight: 500 }}>{taskLabel}</span>
                      </>
                    ) : null}
                    : <span style={{ color: "var(--dt-warm-700)" }}>{n.body}</span>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}>
                    {isUnread && <Badge tone="gold">New</Badge>}
                    <span className="tab-num" style={{ fontSize: 10.5, color: "var(--dt-warm-500)" }}>
                      {fmtStamp(n.created_at)}
                    </span>
                    {n.link_path && (
                      <Link href={n.link_path} style={{ fontSize: 11.5, color: "var(--dt-gold-deep)" }}>
                        View →
                      </Link>
                    )}
                  </div>
                </div>
                {isUnread && (
                  <form action={markNotificationRead.bind(null, n.id)}>
                    <button type="submit" className="dt-btn dt-btn-ghost tiny">
                      Mark read
                    </button>
                  </form>
                )}
              </div>
            );
          })}

          {notifications.length === 0 && (
            <div
              style={{
                textAlign: "center",
                padding: "48px 22px",
                color: "var(--dt-warm-500)",
                fontStyle: "italic",
              }}
            >
              Nothing here yet. When a teammate @mentions you on an onboarding
              task, it shows up here.
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
