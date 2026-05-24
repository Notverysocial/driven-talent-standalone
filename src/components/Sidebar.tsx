"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NavIcon, type IconName } from "./NavIcon";
import { logout } from "@/app/login/actions";
import type { AppRole } from "@/lib/supabase/types";

type NavLink = {
  id: string;
  label: string;
  icon: IconName;
  href: string;
  // Minimum role required to see the link. Omit for "any signed-in user".
  minRole?: AppRole;
};
type NavSection = { section: string; minRole?: AppRole };
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
const NAV: NavEntry[] = [
  { section: "Overview" },
  { id: "dashboard",  label: "Dashboard",      icon: "home",     href: "/dashboard" },
  { id: "inbox",      label: "Inbox",          icon: "message",  href: "/inbox" },

  { section: "Recruiting" },
  { id: "applications", label: "Applicant Tracking", icon: "file",      href: "/applications" },
  { id: "calls",        label: "Inbound Calls",      icon: "message",   href: "/calls" },
  { id: "candidates",   label: "Candidates",         icon: "star",      href: "/candidates" },
  { id: "positions",    label: "Open Positions",     icon: "clipboard", href: "/positions" },
  { id: "job-postings", label: "Job Postings",       icon: "file",      href: "/job-postings" },
  { id: "onboarding",   label: "Onboarding",         icon: "clipboard", href: "/onboarding" },
  { id: "employees",    label: "Active Employees",   icon: "users",     href: "/roster" },

  { section: "HR & Safety" },
  { id: "attendance", label: "Attendance",       icon: "calendar", href: "/attendance" },
  { id: "sick-time",  label: "Sick Time",        icon: "check",    href: "/sick-time" },
  { id: "loa",        label: "Leave of Absence", icon: "file",     href: "/loa" },
  { id: "safety",     label: "Safety / Warnings", icon: "building", href: "/safety" },

  { section: "Payroll & Finance" },
  { id: "timecards",  label: "Timecards",       icon: "clock", href: "/timecards" },
  { id: "payroll",    label: "Payroll",         icon: "chart", href: "/payroll" },
  { id: "invoices",   label: "Invoices",        icon: "file",  href: "/invoices" },
  { id: "bonuses",    label: "Bonuses",         icon: "star",  href: "/bonuses" },
  { id: "expenses",   label: "Expenses",        icon: "file",  href: "/expenses" },

  { section: "Sales" },
  { id: "pipeline",   label: "Sales Pipeline",  icon: "chart",    href: "/pipeline" },

  { section: "Driven Talent Internal" },
  { id: "calendar",   label: "Calendar",        icon: "calendar", href: "/calendar" },
  { id: "tasks",      label: "Tasks",           icon: "check",    href: "/tasks" },
  { id: "contacts",   label: "Contacts",        icon: "users",    href: "/contacts" },
  { id: "legal",      label: "Legal · Notices", icon: "file",     href: "/legal",     minRole: "admin" },
  { id: "workflows",  label: "Workflows",       icon: "check",    href: "/workflows", minRole: "admin" },

  { section: "Admin", minRole: "admin" },
  { id: "team",        label: "Team Members",     icon: "users", href: "/team",            minRole: "admin" },
  { id: "terminated",  label: "Terminated / DNR", icon: "users", href: "/team/terminated", minRole: "admin" },
  { id: "bug-reports", label: "Bug Reports",      icon: "file",  href: "/bug-reports",     minRole: "admin" },
];

const ROLE_RANK: Record<AppRole, number> = { user: 0, admin: 1, owner: 2 };
function roleAtLeast(role: AppRole | undefined, minimum: AppRole | undefined): boolean {
  if (!minimum) return true;
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export function Sidebar({ viewer }: { viewer: SidebarViewer | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const close = () => setOpen(false);

  // Filter out sections (and their items) the viewer can't access. A
  // section is shown only if at least one item below it is visible.
  const visibleEntries: NavEntry[] = [];
  for (let i = 0; i < NAV.length; i++) {
    const entry = NAV[i];
    if ("section" in entry) {
      if (!roleAtLeast(viewer?.role, entry.minRole)) continue;
      // Look ahead to see if any item in this section is visible.
      let hasVisible = false;
      for (let j = i + 1; j < NAV.length; j++) {
        const peek = NAV[j];
        if ("section" in peek) break;
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

  return (
    <>
      <button
        className="dt-mobile-toggle"
        aria-label="Open navigation"
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
          <div className="name">Driven Talent</div>
          <div className="sub">Operations · Dashboard</div>
        </div>
        {visibleEntries.map((entry, i) =>
          "section" in entry ? (
            <div key={"s" + i} className="dt-nav-section">
              {entry.section}
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
              <span>{entry.label}</span>
            </Link>
          )
        )}
        <div className="dt-nav-foot">
          <div className="av">{viewer?.initials ?? "DT"}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="who" title={viewer?.email ?? undefined}>
              {viewer?.name ?? "Signed out"}
            </div>
            <div className="role">{(viewer?.role ?? "guest").toUpperCase()}</div>
            {viewer ? (
              <form action={logout}>
                <button type="submit" className="dt-logout">
                  Sign out
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </aside>
    </>
  );
}
