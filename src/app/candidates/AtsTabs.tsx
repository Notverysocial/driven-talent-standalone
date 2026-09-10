import Link from "next/link";

// The ATS tab bar — the single navigation surface for everyone in the funnel.
//
// Estefany asked (2026-07-06) for "one unified Candidates section that holds
// everyone", with where they came from reduced to a Source field. PR #42 did
// half of it: Talent Pool and Recruiter Tabs stopped being their own nav items
// and became tabs, with their routes kept alive as redirects. Applicant
// Tracking and Inbound Calls were left behind as separate sidebar entries, so
// the team still had three doors into the same funnel.
//
// This bar closes that. Applicants and Inbound Calls are now the first two
// tabs, and the bar renders on all three pages, so /applications and /calls
// read as places inside the ATS rather than destinations beside it.
//
// Their ROUTES are deliberately untouched. They hold real, different surfaces —
// intake triage with claim/promote/reject, and a call log with follow-up
// statuses — and collapsing those tables into the candidates table would lose
// function DT uses daily. One section does not have to mean one table.

export type AtsTabKey = string;

/** Candidate-table tabs. `key` is the ?tab= value on /candidates. */
export const ATS_TABS: { key: AtsTabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "mine", label: "⭐ My Candidates" },
  { key: "unassigned", label: "Unassigned" },
  { key: "Rocio", label: "Rocio" },
  { key: "Estefany", label: "Estefany" },
  { key: "Rodrigo", label: "Rodrigo" },
  { key: "Priscila", label: "Priscila" },
  { key: "Nathalia", label: "Nathalia" },
  { key: "screening_approved", label: "✅ Screening Approved" },
  { key: "on_hold", label: "⏸ On Hold" },
  { key: "available_for_rehire", label: "Available for Rehire" },
  { key: "do_not_return", label: "Do Not Return" },
];

/**
 * Sibling surfaces that live inside the ATS but keep their own route.
 * `match` is the pathname prefix that makes the tab read as active.
 */
export const ATS_SECTIONS: {
  key: string;
  label: string;
  href: string;
  match: string;
}[] = [
  { key: "applicants", label: "Applicants", href: "/applications", match: "/applications" },
  { key: "calls", label: "Inbound Calls", href: "/calls", match: "/calls" },
];

export function AtsTabs({
  /** Active candidate tab, when rendering on /candidates. */
  activeTab,
  /** Active sibling section key, when rendering on /applications or /calls. */
  activeSection,
  /**
   * Builds the href for a candidate tab. Supplied by /candidates so tab links
   * preserve its search/status context; the sibling pages just link to
   * /candidates?tab=… because they have no candidate-table context to keep.
   */
  hrefForTab,
  /** Unreviewed-intake backlog, shown on the Applicants tab. */
  newApplicationsCount = 0,
  newApplicationsOldestDays = 0,
}: {
  activeTab?: string;
  activeSection?: string;
  hrefForTab?: (key: string) => string;
  newApplicationsCount?: number;
  newApplicationsOldestDays?: number;
}) {
  const tabHref = hrefForTab ?? ((key: string) => `/candidates?tab=${encodeURIComponent(key)}`);
  const aging = newApplicationsOldestDays > 7;

  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        flexWrap: "wrap",
        marginBottom: 18,
        borderBottom: "1px solid var(--dt-warm-150)",
        paddingBottom: 10,
      }}
    >
      {ATS_SECTIONS.map((s) => {
        const active = activeSection === s.key;
        return (
          <Link
            key={s.key}
            href={s.href}
            className={"dt-btn" + (active ? " dt-btn-gold" : " dt-btn-ghost")}
            style={{ fontSize: 12, padding: "5px 12px" }}
          >
            {s.label}
            {s.key === "applicants" && newApplicationsCount > 0 && (
              // The unreviewed-backlog badge moves here with the nav item it
              // used to sit on. Losing it in the merge would have hidden the
              // exact pile card 1cb60f5c exists to keep visible.
              <span
                title={
                  `${newApplicationsCount} unreviewed applicant${newApplicationsCount === 1 ? "" : "s"}` +
                  (newApplicationsOldestDays > 0
                    ? ` · oldest waiting ${newApplicationsOldestDays} day${newApplicationsOldestDays === 1 ? "" : "s"}`
                    : "")
                }
                aria-label={
                  `${newApplicationsCount} unreviewed applicant intakes` +
                  (aging ? `, oldest waiting ${newApplicationsOldestDays} days` : "")
                }
                style={{
                  marginLeft: 7,
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  color: aging ? "#fff" : "#0a0a0a",
                  background: aging ? "#B23A3A" : "#F5C518",
                  padding: "1px 5px",
                  borderRadius: 3,
                  verticalAlign: "middle",
                }}
              >
                {newApplicationsCount}
              </span>
            )}
          </Link>
        );
      })}

      <span aria-hidden style={{ width: 1, alignSelf: "stretch", background: "var(--dt-warm-150)", margin: "0 4px" }} />

      {ATS_TABS.map((t) => {
        const active = activeTab === t.key;
        return (
          <Link
            key={t.key}
            href={tabHref(t.key)}
            className={"dt-btn" + (active ? " dt-btn-gold" : " dt-btn-ghost")}
            style={{ fontSize: 12, padding: "5px 12px" }}
          >
            {active ? <span>{t.label}</span> : t.label}
          </Link>
        );
      })}
    </div>
  );
}
