"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NavIcon, type IconName } from "./NavIcon";

type NavLink = {
  id: string;
  label: string;
  icon: IconName;
  href: string;
};
type NavSection = { section: string };
type NavEntry = NavLink | NavSection;

// Order mirrors the Driven Talent Operations Dashboard v3 demo:
// Overview / Recruiting / HR & Safety / Payroll & Finance / Internal.
const NAV: NavEntry[] = [
  { section: "Overview" },
  { id: "dashboard",  label: "Dashboard",      icon: "home",     href: "/dashboard" },
  { id: "inbox",      label: "Inbox",          icon: "message",  href: "/inbox" },

  { section: "Recruiting" },
  { id: "applications", label: "Applicant Tracking", icon: "file",      href: "/applications" },
  { id: "calls",        label: "Inbound Calls",      icon: "message",   href: "/calls" },
  { id: "candidates",   label: "Candidates",         icon: "star",      href: "/candidates" },
  { id: "positions",    label: "Open Positions",     icon: "clipboard", href: "/positions" },
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

  { section: "Driven Talent Internal" },
  { id: "calendar",   label: "Calendar",        icon: "calendar", href: "/calendar" },
  { id: "workflows",  label: "Workflows",       icon: "check",    href: "/workflows" },
];

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const close = () => setOpen(false);

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
        {NAV.map((entry, i) =>
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
          <div className="av">RV</div>
          <div>
            <div className="who">Roxanna V.</div>
            <div className="role">FOUNDER</div>
          </div>
        </div>
      </aside>
    </>
  );
}
