import "server-only";
import { createClient } from "./supabase/server";
import type { BugReport, BugStatus } from "./supabase/types";

export async function listBugReports(opts?: {
  status?: BugStatus;
}): Promise<BugReport[]> {
  const supabase = await createClient();
  let q = supabase
    .from("bug_reports")
    .select("*")
    .order("created_at", { ascending: false });
  if (opts?.status) q = q.eq("status", opts.status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as BugReport[];
}

export async function countOpenBugReports(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("bug_reports")
    .select("id", { count: "exact", head: true })
    .in("status", ["new", "in_progress"]);
  if (error) throw new Error(error.message);
  return count ?? 0;
}
