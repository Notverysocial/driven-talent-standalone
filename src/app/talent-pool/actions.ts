"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { CandidateLifecycleStatus } from "@/lib/supabase/types";

// Quick-action: pull a candidate (rehire, placed, DNR override, etc.) back
// into the active recruiting funnel.
export async function reactivateCandidate(candidateId: string) {
  await setLifecycleStatus(candidateId, "in_process");
}

export async function setLifecycleStatus(
  candidateId: string,
  status: CandidateLifecycleStatus,
) {
  const sb = await createClient();

  const patch: Record<string, unknown> = { lifecycle_status: status };
  // Clear the DNR reason whenever we move a candidate out of do_not_return.
  if (status !== "do_not_return") patch.do_not_return_reason = null;

  const { error } = await sb
    .from("candidates")
    .update(patch)
    .eq("id", candidateId);
  if (error) throw new Error(error.message);

  revalidatePath("/talent-pool");
  revalidatePath("/candidates");
  revalidatePath(`/candidates/${candidateId}`);
}
