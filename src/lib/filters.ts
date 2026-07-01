// Shared filter matching for the recruiting list pages (candidates,
// recruiters, applications).
//
// Position matching used to be inconsistent — the applications page did an
// EXACT match (`position_of_interest !== filter`) while candidates/recruiters
// did a case-insensitive SUBSTRING match. This standardizes everything to one
// behavior: case-insensitive, trimmed, substring. An empty query matches all.
//
// Pure + dependency-free so it can be used from server components directly.

export function textMatches(
  field: string | null | undefined,
  query: string | null | undefined,
): boolean {
  const q = (query ?? "").trim().toLowerCase();
  if (!q) return true;
  return (field ?? "").toLowerCase().includes(q);
}

// Exact id match for a nullable foreign key (e.g. candidate.client_id). An
// empty/absent selection matches all rows.
export function idMatches(
  value: string | null | undefined,
  selected: string | null | undefined,
): boolean {
  const s = (selected ?? "").trim();
  if (!s) return true;
  return value === s;
}
