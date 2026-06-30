// Recruiter helpers for the per-recruiter candidate tabs (#14).
//
// The canonical roster now lives in the `recruiters` DB table (migration 0034)
// and is loaded via src/lib/recruiters.server.ts. Candidates still store their
// recruiter as free text in candidates.recruiter; this helper normalizes a
// stored value against the live roster names (matched case-insensitively).
//
// RECRUITERS is retained ONLY as the seed/fallback roster (matches the seed in
// migration 0034) for any context that hasn't loaded the DB list yet.
export const RECRUITERS = [
  "Estefany",
  "Priscila",
  "Rodrigo",
  "Nathalia",
  "Leangel",
] as const;

// Normalize a stored recruiter value to a canonical roster name (or null).
// Pass the live roster names; falls back to the seed constant when omitted.
export function canonicalRecruiter(
  value: string | null | undefined,
  roster: readonly string[] = RECRUITERS,
): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  const hit = roster.find((r) => r.toLowerCase() === v.toLowerCase());
  return hit ?? v;
}
