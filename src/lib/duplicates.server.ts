import "server-only";
import { createClient } from "./supabase/server";
import { normalizeEmail, normalizePhone, type DuplicateCandidateRow } from "./duplicates";

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
}): Promise<DuplicateCandidateRow[]> {
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
    return ((data ?? []) as DuplicateCandidateRow[]).filter((r) => r.is_seed !== true);
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
