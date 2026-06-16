import type { BadgeTone } from "@/components/Badge";
import type {
  Candidate,
  CandidateLifecycleStatus,
} from "@/lib/supabase/types";

// Tab order mirrors the spec: New Applicants | In Process | Placed |
// Available For Rehire | Do Not Return.
export const LIFECYCLE_STATUSES: {
  id: CandidateLifecycleStatus;
  label: string;
  tone: BadgeTone;
}[] = [
  { id: "new_applicant",        label: "New Applicants",       tone: "warm" },
  { id: "in_process",           label: "In Process",           tone: "gold" },
  { id: "placed",               label: "Placed",               tone: "green" },
  { id: "available_for_rehire", label: "Available For Rehire", tone: "amber" },
  { id: "do_not_return",        label: "Do Not Return",        tone: "red" },
];

export function lifecycleLabel(id: CandidateLifecycleStatus): string {
  return LIFECYCLE_STATUSES.find((s) => s.id === id)?.label ?? id;
}

export function lifecycleTone(id: CandidateLifecycleStatus): BadgeTone {
  return LIFECYCLE_STATUSES.find((s) => s.id === id)?.tone ?? "warm";
}

// Whole days since a placement ended; null when never placed.
export function daysAvailable(lastPlacementEnd: string | null): number | null {
  if (!lastPlacementEnd) return null;
  const then = new Date(lastPlacementEnd).getTime();
  if (Number.isNaN(then)) return null;
  const ms = Date.now() - then;
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

// Free-text search over the fields recruiters actually search by:
// name, role history, location, and skills. Case-insensitive substring.
export function matchesQuery(c: Candidate, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    c.full_name,
    c.applied_for,
    c.city,
    c.preferred_location,
    c.preferred_shift,
    ...(c.skills ?? []),
    ...(c.placement_history ?? []).flatMap((p) => [
      p.role,
      p.client_name,
      p.season,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}
