"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { findRehireMatches, type RehireMatch } from "@/lib/talent-pool.server";
import type {
  JobPostingPlatform,
  JobPostingStatus,
} from "@/lib/job-postings";

// Surfaces already-vetted rehires before a recruiter posts externally.
// Called from the MatchingPoolBanner client island on the Job Postings page.
export async function findRehireMatchesAction(input: {
  role?: string;
  location?: string;
}): Promise<RehireMatch[]> {
  return findRehireMatches({ role: input.role, location: input.location });
}

function num(v: FormDataEntryValue | null): number | null {
  const s = (v as string)?.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function createJobPosting(formData: FormData) {
  const sb = await createClient();

  const { error } = await sb.from("job_postings").insert({
    role_title:        (formData.get("role_title") as string).trim(),
    client_id:         (formData.get("client_id") as string) || null,
    position_id:       (formData.get("position_id") as string) || null,
    platform:          (formData.get("platform") as string) as JobPostingPlatform,
    posting_title:     (formData.get("posting_title") as string)?.trim() || null,
    posting_url:       (formData.get("posting_url") as string)?.trim() || null,
    posted_at:         (formData.get("posted_at") as string)?.trim() || null,
    application_count: num(formData.get("application_count")) ?? 0,
    notes:             (formData.get("notes") as string)?.trim() || null,
    status:            "open" satisfies JobPostingStatus,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/job-postings");
}

export async function setJobPostingStatus(
  postingId: string,
  status: JobPostingStatus,
) {
  const sb = await createClient();
  const patch: Record<string, unknown> = { status };
  if (status === "closed") patch.closed_at = new Date().toISOString().slice(0, 10);
  if (status === "open") patch.closed_at = null;

  const { error } = await sb.from("job_postings").update(patch).eq("id", postingId);
  if (error) throw new Error(error.message);
  revalidatePath("/job-postings");
}

export async function setApplicationCount(
  postingId: string,
  count: number,
) {
  const sb = await createClient();
  const safe = Math.max(0, Math.floor(count));
  const { error } = await sb
    .from("job_postings")
    .update({ application_count: safe })
    .eq("id", postingId);
  if (error) throw new Error(error.message);
  revalidatePath("/job-postings");
}

export async function deleteJobPosting(postingId: string) {
  const sb = await createClient();
  const { error } = await sb.from("job_postings").delete().eq("id", postingId);
  if (error) throw new Error(error.message);
  revalidatePath("/job-postings");
}
