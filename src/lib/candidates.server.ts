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
  return (data ?? []) as Candidate[];
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
