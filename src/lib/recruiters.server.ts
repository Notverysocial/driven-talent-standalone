import "server-only";
import { createClient } from "./supabase/server";
import type { Recruiter } from "./supabase/types";

// DB-backed recruiter roster (migration 0034). Replaces the old hardcoded
// RECRUITERS constant as the source of truth for the per-recruiter tabs and
// the candidate-logging pickers. Candidates still reference a recruiter by the
// free-text `candidates.recruiter` column; this roster is the canonical,
// self-serve list of who those names should normalize to.

export async function listRecruiters(): Promise<Recruiter[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("recruiters")
    .select("*")
    .order("active", { ascending: false })
    .order("sort", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Recruiter[];
}

// Active recruiter names only — used to populate the "assign recruiter"
// dropdowns so retired recruiters aren't offered for new work.
export async function listActiveRecruiterNames(): Promise<string[]> {
  const recruiters = await listRecruiters();
  return recruiters.filter((r) => r.active).map((r) => r.name);
}
