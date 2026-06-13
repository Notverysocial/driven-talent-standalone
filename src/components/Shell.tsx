import type { ReactNode } from "react";
import { Sidebar, type SidebarViewer } from "./Sidebar";
import { AUTH_ENABLED, getCurrentUser } from "@/lib/auth.server";
import { countRecentNewApplications } from "@/lib/recruiting.server";

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
  // Sidebar badge: number of "new" application intakes from the last 24h.
  // Safe to call without a signed-in viewer; helper returns 0 on any error.
  const newApplicationsCount = viewer ? await countRecentNewApplications() : 0;
  return (
    <div className="dt-screen">
      <Sidebar
        viewer={viewer}
        authEnabled={AUTH_ENABLED}
        newApplicationsCount={newApplicationsCount}
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
