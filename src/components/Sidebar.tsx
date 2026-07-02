"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NavIcon, type IconName } from "./NavIcon";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { logout } from "@/app/login/actions";
import { useT, useDict } from "@/lib/i18n/client";
import type { AppRole } from "@/lib/supabase/types";

type NavLink = {
  id: string;
  // i18n key under the `nav.` namespace (e.g. "dashboard").
  labelKey: string;
  icon: IconName;
  href: string;
  // Minimum role required to see the link. Omit for "any signed-in user".
  minRole?: AppRole;
};
type NavSection = { sectionKey: string; minRole?: AppRole };
type NavEntry = NavLink | NavSection;

export type SidebarViewer = {
  name: string;
  email: string | null;
  role: AppRole;
  initials: string;
};

// Order mirrors the Driven Talent Operations Dashboard v3 demo:
// Overview / Recruiting / HR & Safety / Payroll & Finance / Internal.
// Admin section + a few admin-only pages are role-gated via minRole.
// `sectionKey` / `labelKey` resolve against the `nav.` namespace.
const NAV: NavEntry[] = [
  { sectionKey: "overview" },
  { id: "dashboard",  labelKey: "dashboard",   icon: "home",     href: "/dashboard" },
  { id: "inbox",      labelKey: "inbox",       icon: "message",  href: "/inbox" },

  { sectionKey: "recruiting" },
  { id: "applications", labelKey: "applications", icon: "file",      href: "/applications" },
  { id: "calls",        labelKey: "calls",        icon: "message",   href: "/calls" },
  { id: "candidates",   labelKey: "candidates",   icon: "star",      href: "/candidates" },
  { id: "recruiters",   labelKey: "recruiters",   icon: "users",     href: "/recruiters" },
  { id: "positions",    labelKey: "positions",    icon: "clipboard", href: "/positions" },
  { id: "job-postings", labelKey: "jobPostings",  icon: "file",      href: "/job-postings" },
  { id: "onboarding",   labelKey: "onboarding",   icon: "clipboard", href: "/onboarding" },
  { id: "employees",    labelKey: "employees",    icon: "users",     href: "/roster" },

  { sectionKey: "hrSafety" },
  { id: "attendance", labelKey: "attendance", icon: "calendar", href: "/attendance" },
  { id: "sick-time",  labelKey: "sickTime",   icon: "check",    href: "/sick-time" },
  { id: "loa",        labelKey: "loa",        icon: "file",     href: "/loa" },
  { id: "safety",     labelKey: "safety",     icon: "building", href: "/safety" },
  { id: "terminations", labelKey: "terminations", icon: "clipboard", href: "/terminations" },

  { sectionKey: "payrollFinance" },
  { id: "timecards",  labelKey: "timecards", icon: "clock", href: "/timecards" },
  { id: "payroll",        labelKey: "payroll",        icon: "chart", href: "/payroll" },
  { id: "reports",        labelKey: "reports",        icon: "file",  href: "/reports" },
  { id: "reconciliation", labelKey: "reconciliation", icon: "check", href: "/reconciliation" },
  { id: "invoices",       labelKey: "invoices",       icon: "file",  href: "/invoices" },
  { id: "clients",    labelKey: "clients",   icon: "building", href: "/clients" },
  { id: "bonuses",    labelKey: "bonuses",   icon: "star",  href: "/bonuses" },
  { id: "expenses",   labelKey: "expenses",  icon: "file",  href: "/expenses" },

  { sectionKey: "sales" },
  { id: "pipeline",   labelKey: "pipeline",  icon: "chart", href: "/pipeline" },

  { sectionKey: "internal" },
  { id: "calendar",     labelKey: "calendar",     icon: "calendar", href: "/calendar" },
  { id: "tasks",        labelKey: "tasks",        icon: "check",    href: "/tasks" },
  { id: "notifications",labelKey: "notifications",icon: "message",  href: "/notifications" },
  { id: "contacts",     labelKey: "contacts",     icon: "users",    href: "/contacts" },
  { id: "legal",      labelKey: "legal",     icon: "file",     href: "/legal",     minRole: "admin" },
  { id: "workflows",  labelKey: "workflows", icon: "check",    href: "/workflows", minRole: "admin" },

  { sectionKey: "admin", minRole: "admin" },
  { id: "team",        labelKey: "team",       icon: "users", href: "/team",            minRole: "admin" },
  { id: "terminated",  labelKey: "terminated", icon: "users", href: "/team/terminated", minRole: "admin" },
  { id: "access",      labelKey: "access",     icon: "users", href: "/access",          minRole: "admin" },
  { id: "integrations",labelKey: "integrations",icon: "chart", href: "/integrations",    minRole: "admin" },
  { id: "bug-reports", labelKey: "bugReports", icon: "file",  href: "/bug-reports",     minRole: "admin" },
];

const ROLE_RANK: Record<AppRole, number> = { user: 0, admin: 1, owner: 2 };
function roleAtLeast(role: AppRole | undefined, minimum: AppRole | undefined): boolean {
  if (!minimum) return true;
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export function Sidebar({
  viewer,
  authEnabled = true,
  newApplicationsCount = 0,
  unreadNotifications = 0,
}: {
  viewer: SidebarViewer | null;
  // When false, the global AUTH_ENABLED flag is off — hide the Sign out
  // button so the user is never sent to /login.
  authEnabled?: boolean;
  // Number of application intakes with status "new" from the last 24h.
  // Rendered as "Applications (N new)" inline on the nav row.
  newApplicationsCount?: number;
  // Unread @mention notifications for the viewer. Rendered as a count badge
  // on the Notifications nav row so mentions are visible without opening it.
  unreadNotifications?: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const t = useT();
  const dict = useDict();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const close = () => setOpen(false);

  // Filter out sections (and their items) the viewer can't access. A
  // section is shown only if at least one item below it is visible.
  const visibleEntries: NavEntry[] = [];
  for (let i = 0; i < NAV.length; i++) {
    const entry = NAV[i];
    if ("sectionKey" in entry) {
      if (!roleAtLeast(viewer?.role, entry.minRole)) continue;
      // Look ahead to see if any item in this section is visible.
      let hasVisible = false;
      for (let j = i + 1; j < NAV.length; j++) {
        const peek = NAV[j];
        if ("sectionKey" in peek) break;
        if (roleAtLeast(viewer?.role, peek.minRole)) {
          hasVisible = true;
          break;
        }
      }
      if (!hasVisible) continue;
      visibleEntries.push(entry);
    } else {
      if (!roleAtLeast(viewer?.role, entry.minRole)) continue;
      visibleEntries.push(entry);
    }
  }

  const roleLabel = viewer?.role
    ? (dict.roles[viewer.role] ?? viewer.role).toUpperCase()
    : t("nav.guest");

  return (
    <>
      <button
        className="dt-mobile-toggle"
        aria-label={t("nav.dashboard")}
        onClick={() => setOpen(true)}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        >
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>
      <div
        className={"dt-mobile-overlay" + (open ? " open" : "")}
        onClick={close}
      />
      <aside className={"dt-sidebar" + (open ? " open" : "")}>
        <div className="dt-brand">
          <div className="name">{t("nav.brandName")}</div>
          <div className="sub">{t("nav.brandSub")}</div>
        </div>
        {visibleEntries.map((entry, i) =>
          "sectionKey" in entry ? (
            <div key={"s" + i} className="dt-nav-section">
              {t(`nav.${entry.sectionKey}`)}
            </div>
          ) : (
            <Link
              key={entry.id}
              href={entry.href}
              className={
                "dt-nav-item" +
                (pathname === entry.href ||
                (entry.href !== "/dashboard" && pathname.startsWith(entry.href))
                  ? " active"
                  : "")
              }
              onClick={close}
            >
              <span className="ico">
                <NavIcon name={entry.icon} />
              </span>
              <span>
                {t(`nav.${entry.labelKey}`)}
                {entry.id === "applications" && newApplicationsCount > 0 && (
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 10.5,
                      fontWeight: 600,
                      letterSpacing: "0.05em",
                      color: "#0a0a0a",
                      background: "#F5C518",
                      padding: "2px 6px",
                      borderRadius: 3,
                      verticalAlign: "middle",
                    }}
                  >
                    {newApplicationsCount} new
                  </span>
                )}
                {entry.id === "notifications" && unreadNotifications > 0 && (
                  <span
                    aria-label={`${unreadNotifications} unread notifications`}
                    style={{
                      marginLeft: 8,
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: "0.05em",
                      color: "#fff",
                      background: "var(--dt-danger, #b23a3a)",
                      padding: "2px 6px",
                      borderRadius: 999,
                      verticalAlign: "middle",
                    }}
                  >
                    {unreadNotifications > 99 ? "99+" : unreadNotifications}
                  </span>
                )}
              </span>
            </Link>
          )
        )}
        <div className="dt-nav-foot">
          <div className="av">{viewer?.initials ?? "DT"}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="who" title={viewer?.email ?? undefined}>
              {viewer?.name ?? t("nav.signedOut")}
            </div>
            <div className="role">{roleLabel}</div>
            <LanguageSwitcher />
            {viewer ? (
              <Link
                href="/account"
                className="dt-logout"
                onClick={close}
                style={{
                  display: "block",
                  textAlign: "center",
                  textDecoration: "none",
                  marginTop: 8,
                }}
              >
                {t("nav.account")}
              </Link>
            ) : null}
            {viewer && authEnabled ? (
              <form action={logout}>
                <button type="submit" className="dt-logout">
                  {t("nav.signOut")}
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </aside>
    </>
  );
}
