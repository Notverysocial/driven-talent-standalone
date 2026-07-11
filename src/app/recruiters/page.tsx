import { redirect } from "next/navigation";

// Change 2 (Leangel 2026-07-08) — the standalone "Recruiter Tabs" page was
// merged into the ATS. Per-recruiter tabs now live on /candidates (All ·
// ⭐ My Candidates · Unassigned · <recruiters> · Available for Rehire · Do Not
// Return), and roster management (add / retire recruiters) moved onto that page
// as an admin-only panel. Redirect the old route + bookmarks into the matching
// ATS tab so nothing 404s (this is the fix for the reported Recruiter-Tabs 404).
export default async function RecruitersRedirect({
  searchParams,
}: {
  searchParams: Promise<{ r?: string; q?: string; pos?: string; client?: string }>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  // Old `?r=<recruiter>` selected a recruiter tab; the ATS uses `?tab=`.
  // "__unassigned__" maps to the ATS "unassigned" tab; "all"/missing → default.
  if (sp.r && sp.r !== "all") {
    params.set("tab", sp.r === "__unassigned__" ? "unassigned" : sp.r);
  }
  if (sp.q) params.set("q", sp.q);
  if (sp.pos) params.set("pos", sp.pos);
  if (sp.client) params.set("client", sp.client);
  const qs = params.toString();
  redirect(qs ? `/candidates?${qs}` : "/candidates");
}
