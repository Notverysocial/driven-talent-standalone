"use server";

// AUTH: every export below is a directly-invocable endpoint, not a private
// function — Next compiles each one into its own addressable POST. The gate
// belongs on the ACTION, not only on the page that happens to render it.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { CandidateLifecycleStatus } from "@/lib/supabase/types";
import { requireUser } from "@/lib/auth.server";

// Quick-action: pull a candidate (rehire, placed, DNR override, etc.) back
// into the active recruiting funnel.
export async function reactivateCandidate(candidateId: string) {
  await requireUser();
  await setLifecycleStatus(candidateId, "in_process");
}

export async function setLifecycleStatus(
  candidateId: string,
  status: CandidateLifecycleStatus,
) {
  await requireUser();
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
