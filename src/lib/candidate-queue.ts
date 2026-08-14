// The ordered set of candidates the reviewer is looking at.
//
// Extracted out of src/app/candidates/page.tsx so the DETAIL page can rebuild
// the exact same tab + search + stage-filtered set and page through it with
// Prev/Next. See review-queue.ts for why the set is recomputed rather than
// snapshotted into the URL.

import { textMatches, idMatches } from "@/lib/filters";
import { partitionBySendBar } from "@/lib/candidate-eligibility";
import type { Candidate, CandidateStatus } from "@/lib/supabase/types";

export type CandidateFilters = {
  q: string;
  pos: string;
  client: string;
  tab: string;
  status: string;
  /** "1" reveals candidates barred from being sent, on the ready-to-send tabs
   *  where they are hidden by default. */
  barred: boolean;
};

export type CandidateSearchParams = {
  q?: string;
  pos?: string;
  client?: string;
  tab?: string;
  status?: string;
  barred?: string;
};

/** My Candidates is the default on login for a real recruiter; managers / the
 *  auth-off synthetic owner default to All (they see everyone). The detail page
 *  resolves this identically so a URL with no explicit tab still describes the
 *  same set on both sides. */
export function resolveCandidateFilters(
  sp: CandidateSearchParams,
  opts: { isRealRecruiter: boolean },
): CandidateFilters {
  return {
    q: (sp.q ?? "").trim(),
    pos: (sp.pos ?? "").trim(),
    client: (sp.client ?? "").trim(),
    tab: (sp.tab ?? (opts.isRealRecruiter ? "mine" : "all")).trim(),
    status: (sp.status ?? "").trim(),
    barred: sp.barred === "1",
  };
}

/** Everything that defines the set, as a querystring. The "all" tab and empty
 *  values are omitted so links stay clean. */
export function candidateContextParams(f: CandidateFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.pos) p.set("pos", f.pos);
  if (f.client) p.set("client", f.client);
  if (f.tab && f.tab !== "all") p.set("tab", f.tab);
  if (f.status) p.set("status", f.status);
  if (f.barred) p.set("barred", "1");
  return p;
}

export function candidateListHref(f: CandidateFilters): string {
  const qs = candidateContextParams(f).toString();
  return `/candidates${qs ? `?${qs}` : ""}`;
}

function eqi(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** THE READY-TO-SEND TABS. Estefany described these as the candidates "ready to
 *  send out at any time" — the shortlist a recruiter pulls from when a client
 *  needs somebody now, so barred people are held out of them by default. The
 *  DNR lifecycle tab is excluded: looking at the DNR list is how you see barred
 *  people on purpose. */
export function isReadyToSendTab(tab: string): boolean {
  return tab === "screening_approved" || tab === "on_hold";
}

export function isLifecycleTab(tab: string): boolean {
  return tab === "available_for_rehire" || tab === "do_not_return";
}

export type CandidateSelection = {
  /** Tab + text/client context, before the stage filter. Drives the stage-tile
   *  counts so those counts don't change when a tile is selected. */
  matched: Candidate[];
  /** Held back on the ready-to-send tabs because they must not go to a client. */
  barredRows: Candidate[];
  /** matched, minus anyone held back (unless the reviewer opted to see them). */
  candidates: Candidate[];
  /** The rows actually shown in the table — narrowed by the clicked stage tile.
   *  This IS the set Prev/Next walks. */
  visible: Candidate[];
};

export function selectCandidates(
  all: Candidate[],
  f: CandidateFilters,
  viewerName: string | null,
): CandidateSelection {
  function matchesTab(c: Candidate): boolean {
    switch (f.tab) {
      case "all": return true;
      case "mine": return eqi(c.recruiter, viewerName) || eqi(c.claimed_by, viewerName);
      case "unassigned": return !c.recruiter && !c.claimed_by;
      case "screening_approved": return c.screening_status === "approved";
      case "on_hold": return c.screening_status === "on_hold";
      case "available_for_rehire": return c.lifecycle_status === "available_for_rehire";
      case "do_not_return": return c.lifecycle_status === "do_not_return";
      default: return eqi(c.recruiter, f.tab) || eqi(c.claimed_by, f.tab);
    }
  }

  // Filter the pipeline by candidate name + position (case-insensitive
  // substring, standardized in src/lib/filters.ts) and by client (exact
  // client_id). All three compose with AND.
  const matched = all.filter(
    (c) =>
      textMatches(c.full_name, f.q) &&
      textMatches(c.applied_for, f.pos) &&
      idMatches(c.client_id, f.client) &&
      matchesTab(c),
  );

  // On the ready-to-send tabs, hold back anyone barred from being sent. The
  // count is kept and REPORTED by the caller — a list that quietly drops people
  // is its own kind of wrong.
  const readyToSend = isReadyToSendTab(f.tab);
  const { sendable, barred: barredRows } = readyToSend
    ? partitionBySendBar(matched)
    : { sendable: matched, barred: [] as Candidate[] };
  const candidates = readyToSend && !f.barred ? sendable : matched;

  const visible = f.status
    ? candidates.filter((c) => c.status === (f.status as CandidateStatus))
    : candidates;

  return { matched, barredRows, candidates, visible };
}
