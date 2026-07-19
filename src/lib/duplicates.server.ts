import "server-only";
import { createClient } from "./supabase/server";
import {
  normalizeEmail,
  normalizePhone,
  matchReason,
  type DuplicateCandidateRow,
  type DuplicateMatchReason,
} from "./duplicates";

/** A duplicate, plus why it matched and whether it carries interview history. */
export type DuplicateMatch = DuplicateCandidateRow & {
  matchedOn: DuplicateMatchReason;
  /**
   * True when this duplicate already has rows in `interviews`. If both records
   * have history, a merge has to reconcile interview rows, not just candidates —
   * e.g. Geoffrey Enscoe / Jeffrey, who were both backfilled to round 1.
   */
  hasInterviewHistory: boolean;
};

// Find OTHER candidate records that look like the same human as this one.
//
// Computed at read time rather than stored as a flag on the row: a stored flag
// would go stale the moment a duplicate is resolved (or a new one appears) and
// would need its own write path and cleanup. Computing it means the profile
// banner is always accurate and nothing has to be maintained.
//
// FAIL-SAFE: migrations here are applied by hand, so this must work before 0046
// exists. Any error (missing column included) returns [] and the profile simply
// shows no banner — never a 500.
export async function findDuplicateCandidatesFor(cand: {
  id: string;
  email: string | null;
  phone: string | null;
}): Promise<DuplicateMatch[]> {
  const email = normalizeEmail(cand.email);
  const phone = normalizePhone(cand.phone);
  if (!email && !phone) return [];

  try {
    const supabase = await createClient();
    const filters: string[] = [];
    if (email) filters.push(`email_normalized.eq.${email}`);
    if (phone) filters.push(`phone_normalized.eq.${phone}`);

    const { data, error } = await supabase
      .from("candidates")
      .select("id, full_name, email, phone, is_seed")
      .or(filters.join(","))
      .neq("id", cand.id);

    if (error) {
      console.warn("[duplicates] lookup failed (no banner shown):", error.message);
      return [];
    }
    // Never surface demo/QA seed rows as a real duplicate (migration 0044).
    const rows = ((data ?? []) as DuplicateCandidateRow[]).filter(
      (r) => r.is_seed !== true,
    );
    if (rows.length === 0) return [];

    // Which of these already carry interview history? A merge would have to
    // reconcile those rows, so the banner has to say so. Fail-safe.
    let withHistory = new Set<string>();
    try {
      const { data: ivs } = await supabase
        .from("interviews")
        .select("candidate_id")
        .in(
          "candidate_id",
          rows.map((r) => r.id),
        );
      withHistory = new Set(
        ((ivs ?? []) as { candidate_id: string }[]).map((i) => i.candidate_id),
      );
    } catch {
      // interviews table not there yet — leave the set empty.
    }

    return rows.map((r) => ({
      ...r,
      matchedOn: matchReason(cand, r) ?? "phone",
      hasInterviewHistory: withHistory.has(r.id),
    }));
  } catch (e) {
    console.warn(
      "[duplicates] lookup threw (no banner shown):",
      e instanceof Error ? e.message : String(e),
    );
    return [];
  }
}

/**
 * All candidate rows the integrity audit needs to group duplicates.
 * Fail-safe: returns [] on any error so the audit degrades rather than breaking.
 */
export async function listCandidatesForDuplicateScan(): Promise<DuplicateCandidateRow[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("candidates")
      .select("id, full_name, email, phone, is_seed");
    if (error) {
      console.warn("[duplicates] scan failed:", error.message);
      return [];
    }
    return (data ?? []) as DuplicateCandidateRow[];
  } catch {
    return [];
  }
}
