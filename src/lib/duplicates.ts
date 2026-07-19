// Duplicate-candidate detection (no merging, no deletes).
//
// PURE — no server imports — so the normalization and grouping rules are
// unit-tested in the required CI gate. These mirror the generated columns in
// migration 0046 exactly; if one changes, the other must change with it.

/** Lowercase + trim. Null when blank. Mirrors candidates.email_normalized. */
export function normalizeEmail(email: string | null | undefined): string | null {
  const t = (email ?? "").trim().toLowerCase();
  return t === "" ? null : t;
}

/**
 * Digits only, last 10 (so "+1 (909) 685-3385", "(909) 685-3385" and
 * "9096853385" all converge). Null when blank. Mirrors phone_normalized.
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/[^0-9]/g, "");
  if (digits === "") return null;
  return digits.slice(-10);
}

export type DuplicateCandidateRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  is_seed?: boolean;
};

export type DuplicateGroup = {
  /** The normalized value the group is keyed on. */
  key: string;
  by: "email" | "phone";
  records: DuplicateCandidateRow[];
};

/**
 * Group candidate records that represent the same human. Seed rows are excluded
 * (migration 0044) so demo data never shows up as a real duplicate.
 *
 * Email is the primary signal; phone is reported separately so a shared office
 * or family number does not silently masquerade as an email-confirmed identity
 * match. Records already grouped by email are not re-reported under phone.
 */
export function groupDuplicateCandidates(
  rows: DuplicateCandidateRow[],
): DuplicateGroup[] {
  const real = rows.filter((r) => r.is_seed !== true);

  const byEmail = new Map<string, DuplicateCandidateRow[]>();
  for (const r of real) {
    const k = normalizeEmail(r.email);
    if (!k) continue;
    byEmail.set(k, [...(byEmail.get(k) ?? []), r]);
  }

  const groups: DuplicateGroup[] = [];
  const claimed = new Set<string>();
  for (const [key, records] of byEmail) {
    if (records.length < 2) continue;
    groups.push({ key, by: "email", records });
    for (const r of records) claimed.add(r.id);
  }

  const byPhone = new Map<string, DuplicateCandidateRow[]>();
  for (const r of real) {
    if (claimed.has(r.id)) continue; // already reported via email
    const k = normalizePhone(r.phone);
    if (!k) continue;
    byPhone.set(k, [...(byPhone.get(k) ?? []), r]);
  }
  for (const [key, records] of byPhone) {
    if (records.length < 2) continue;
    groups.push({ key, by: "phone", records });
  }

  // Stable output: email groups first, then by key.
  groups.sort((a, b) =>
    a.by === b.by ? a.key.localeCompare(b.key) : a.by === "email" ? -1 : 1,
  );
  return groups;
}

/** Flat totals for the integrity audit. */
export function summarizeDuplicates(groups: DuplicateGroup[]): {
  groups: number;
  records: number;
  samples: string[];
} {
  return {
    groups: groups.length,
    records: groups.reduce((n, g) => n + g.records.length, 0),
    samples: groups.slice(0, 10).map((g) => g.key),
  };
}
