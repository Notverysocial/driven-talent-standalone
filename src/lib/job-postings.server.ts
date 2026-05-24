import "server-only";
import { createClient } from "./supabase/server";
import type { JobPosting } from "./job-postings";

export async function listJobPostings(): Promise<JobPosting[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("job_postings")
    .select("*")
    .order("status", { ascending: true })
    .order("posted_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as JobPosting[];
}
