// Canonical recruiter roster for the per-recruiter candidate tabs (#14).
// Stored as free text in candidates.recruiter; matched case-insensitively.
export const RECRUITERS = [
  "Estefany",
  "Priscila",
  "Rodrigo",
  "Nathalia",
  "Leangel",
] as const;

export type RecruiterName = (typeof RECRUITERS)[number];

// Normalize a stored recruiter value to a canonical name (or null).
export function canonicalRecruiter(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  const hit = RECRUITERS.find((r) => r.toLowerCase() === v.toLowerCase());
  return hit ?? v;
}
