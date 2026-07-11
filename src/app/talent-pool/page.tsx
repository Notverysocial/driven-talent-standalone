import { redirect } from "next/navigation";

// Change 2 (Leangel 2026-07-08) — Talent Pool was merged into the ATS. The
// "Available for Rehire" and "Do Not Return" lifecycle tabs (with the ported
// Reactivate action) now live on /candidates. Redirect the old route + any
// bookmarks into the rehire-pool tab so nothing 404s.
export default async function TalentPoolRedirect({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  // Map the old lifecycle tab straight onto the ATS tab of the same key; any
  // other/missing tab lands on the rehire pool. (The old free-text `q` searched
  // skills/location/history, which the ATS name filter doesn't replicate, so we
  // drop it rather than surface a surprising empty result.)
  const tab =
    sp.tab === "do_not_return"
      ? "do_not_return"
      : sp.tab === "in_process"
        ? "all"
        : "available_for_rehire";
  redirect(`/candidates?tab=${tab}`);
}
