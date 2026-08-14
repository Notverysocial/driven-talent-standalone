// The ordered set of applicants the reviewer is looking at.
//
// Extracted out of src/app/applications/page.tsx so the DETAIL page can rebuild
// the exact same filtered, sorted, grouped set and page through it. If this
// lived only in the list page, "Next" on the detail view would be a second,
// drifting definition of the same list — see review-queue.ts.

import { textMatches } from "@/lib/filters";
import {
  INTAKE_STATUSES,
  type ApplicationIntake,
  type ApplicationIntakeStatus,
} from "@/lib/recruiting";

export type ApplicationFilters = {
  q: string;
  month: string;
  day: string;
  status: ApplicationIntakeStatus | null;
  source: string;
  position: string;
  city: string;
  /** Raw string so an empty box and "0" stay distinguishable in the URL. */
  minExp: string;
  sort: "oldest" | "newest";
};

export type ApplicationSearchParams = {
  q?: string;
  month?: string;
  day?: string;
  status?: string;
  source?: string;
  position?: string;
  city?: string;
  minExp?: string;
  sort?: string;
};

export function monthKey(d: string): string {
  return d.slice(0, 7);
}

export function readApplicationFilters(
  sp: ApplicationSearchParams,
): ApplicationFilters {
  const statusRaw = (sp.status ?? "").trim();
  return {
    q: (sp.q ?? "").trim(),
    month: (sp.month ?? "").trim(),
    day: (sp.day ?? "").trim(),
    status: INTAKE_STATUSES.some((s) => s.id === statusRaw)
      ? (statusRaw as ApplicationIntakeStatus)
      : null,
    source: (sp.source ?? "").trim(),
    position: (sp.position ?? "").trim(),
    city: (sp.city ?? "").trim(),
    minExp: (sp.minExp ?? "").trim(),
    // Waiting-age sort (card cf34006d). DEFAULT is oldest-first so the longest-
    // waiting applicants surface at the top of the New queue.
    sort: sp.sort === "newest" ? "newest" : "oldest",
  };
}

/** Every filter that defines the set, as a querystring. Defaults are omitted so
 *  links stay readable. This is what travels to the detail view. */
export function applicationContextParams(f: ApplicationFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.month) p.set("month", f.month);
  if (f.day) p.set("day", f.day);
  if (f.status) p.set("status", f.status);
  if (f.source) p.set("source", f.source);
  if (f.position) p.set("position", f.position);
  if (f.city) p.set("city", f.city);
  if (f.minExp) p.set("minExp", f.minExp);
  if (f.sort !== "oldest") p.set("sort", f.sort);
  return p;
}

export function applicationListHref(f: ApplicationFilters): string {
  const qs = applicationContextParams(f).toString();
  return `/applications${qs ? `?${qs}` : ""}`;
}

export function anyApplicationFilter(f: ApplicationFilters): boolean {
  return Boolean(
    f.q || f.month || f.day || f.status || f.source || f.position || f.city || f.minExp,
  );
}

export type ApplicationGroups = {
  /** Everything matching the filters, unsorted/ungrouped. */
  filtered: ApplicationIntake[];
  newIntakes: ApplicationIntake[];
  reviewed: ApplicationIntake[];
  promoted: ApplicationIntake[];
  /** The three sections concatenated in the order they are rendered — i.e.
   *  exactly the order a reviewer's eye (and the Next button) travels. */
  queue: ApplicationIntake[];
};

export function groupApplications(
  all: ApplicationIntake[],
  f: ApplicationFilters,
): ApplicationGroups {
  const minExp = f.minExp ? Number(f.minExp) : null;
  const searchLower = f.q.toLowerCase();

  const filtered = all.filter((i) => {
    if (f.month && (!i.created_at || monthKey(i.created_at) !== f.month)) return false;
    if (f.day && (!i.created_at || i.created_at.slice(0, 10) !== f.day)) return false;
    if (f.status && i.status !== f.status) return false;
    if (f.source && i.source !== f.source) return false;
    // Standardized position match: case-insensitive substring (shared with
    // candidates + recruiters via src/lib/filters.ts) instead of exact match.
    if (!textMatches(i.position_of_interest, f.position)) return false;
    if (f.city && i.city !== f.city) return false;
    if (minExp !== null && !Number.isNaN(minExp)) {
      if (i.experience_years == null || i.experience_years < minExp) return false;
    }
    if (searchLower) {
      const hay =
        `${i.full_name ?? ""} ${i.position_of_interest ?? ""} ${i.email ?? ""}`.toLowerCase();
      if (!hay.includes(searchLower)) return false;
    }
    return true;
  });

  const byAge = (a: ApplicationIntake, b: ApplicationIntake) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return f.sort === "oldest" ? ta - tb : tb - ta;
  };

  const newIntakes = filtered.filter((i) => i.status === "new").sort(byAge);
  const reviewed = filtered.filter(
    (i) => i.status !== "new" && i.status !== "promoted",
  );
  const promoted = filtered.filter((i) => i.status === "promoted");

  return {
    filtered,
    newIntakes,
    reviewed,
    promoted,
    queue: [...newIntakes, ...reviewed, ...promoted],
  };
}
