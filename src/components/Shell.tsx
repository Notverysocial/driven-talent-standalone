import type { ReactNode } from "react";
import { Sidebar, type SidebarViewer } from "./Sidebar";
import { AUTH_ENABLED, getCurrentUser } from "@/lib/auth.server";
import { getNewIntakeBacklog } from "@/lib/recruiting.server";
import { countUnreadNotifications } from "@/lib/notifications.server";
import { countNewInboundLeads } from "@/lib/inbound-leads.server";

export async function Shell({ children }: { children: ReactNode }) {
  const me = await getCurrentUser();
  const viewer: SidebarViewer | null = me
    ? {
        name: me.profile.full_name ?? me.email ?? "Driven Talent",
        email: me.email,
        role: me.profile.role,
        initials: initialsFor(me.profile.full_name ?? me.email ?? "DT"),
      }
    : null;
  // Sidebar badge: the TRUE unreviewed application-intake backlog + how old the
  // oldest one is (card 1cb60f5c). Previously this counted only the last 24h,
  // hiding a multi-week backlog. Safe without a signed-in viewer; returns zeros
  // on any error so it never breaks navigation.
  const intakeBacklog = viewer
    ? await getNewIntakeBacklog()
    : { count: 0, oldestDays: 0, over7: 0, over30: 0 };
  // Sidebar badge: unread @mention notifications for the signed-in user.
  // Count-only + error-safe (returns 0), so it never breaks a page render.
  const unreadNotifications = viewer ? await countUnreadNotifications() : 0;
  // Sidebar badge: inbound employer leads (website staffing requests) still
  // untriaged. Error-safe (returns 0), so it never breaks a page render.
  const newLeadsCount = viewer ? await countNewInboundLeads() : 0;
  return (
    <div className="dt-screen">
      <Sidebar
        viewer={viewer}
        authEnabled={AUTH_ENABLED}
        newApplicationsCount={intakeBacklog.count}
        newApplicationsOldestDays={intakeBacklog.oldestDays}
        newLeadsCount={newLeadsCount}
        unreadNotifications={unreadNotifications}
      />
      <div className="dt-main">{children}</div>
    </div>
  );
}

function initialsFor(label: string): string {
  const cleaned = label.includes("@") ? label.split("@")[0] : label;
  const parts = cleaned.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "DT";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
