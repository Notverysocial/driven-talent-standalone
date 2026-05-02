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

const NAV: NavEntry[] = [
  { section: "Workspace" },
  { id: "overview", label: "Overview", icon: "home", href: "/dashboard" },
  { id: "roster", label: "Employee Roster", icon: "users", href: "/roster" },
  { id: "candidates", label: "Candidates", icon: "star", href: "/candidates" },
  { section: "People Ops" },
  {
    id: "attendance",
    label: "Attendance",
    icon: "calendar",
    href: "/attendance",
  },
  {
    id: "onboarding",
    label: "Onboarding",
    icon: "clipboard",
    href: "/onboarding",
  },
  { section: "Operations" },
  { id: "timecards", label: "Timecards", icon: "clock", href: "/timecards" },
  { id: "invoices", label: "Invoices", icon: "file", href: "/invoices" },
  {
    id: "reconcile",
    label: "Reconciliation",
    icon: "check",
    href: "/reconciliation",
  },
  { section: "Insights" },
  { id: "reports", label: "Reports", icon: "chart", href: "/dashboard" },
  { id: "clients", label: "Clients", icon: "building", href: "/dashboard" },
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
          <div className="sub">Workforce · Solutions</div>
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
