import "server-only";
import { createClient } from "./supabase/server";
import type { Candidate } from "./supabase/types";

export async function listCandidates(): Promise<Candidate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("candidates")
    .select("*")
    .order("applied_at", { ascending: false });
  if (error) throw new Error(error.message);
  // Drop demo/QA seed rows (e.g. the E2E Resume Test candidate) from the ATS
  // list (migration 0044). A missing is_seed pre-migration keeps every row.
  return ((data ?? []) as Candidate[]).filter((c) => c.is_seed !== true);
}

export async function getCandidate(id: string): Promise<Candidate | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("candidates")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Candidate | null) ?? null;
}

export type RecruiterCandidate = Candidate & {
  client: { id: string; name: string } | null;
};

/**
 * All candidates with their target-client name joined, ordered newest-first.
 * Powers the per-recruiter tabs (#14), which group by the free-text
 * `recruiter` column in-memory so an empty / unknown recruiter still shows
 * under an "Unassigned" tab.
 */
export async function listRecruiterCandidates(): Promise<RecruiterCandidate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("candidates")
    .select("*, clients ( id, name )")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  type Row = Candidate & { clients: { id: string; name: string } | null };
  return ((data ?? []) as Row[]).map((r) => ({ ...r, client: r.clients }));
}
