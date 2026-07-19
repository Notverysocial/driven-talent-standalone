import "server-only";
import { createClient } from "./supabase/server";
import type { InterviewRow } from "./interviews";

// Read the stored interview rounds for a candidate (migration 0045).
//
// FAIL-SAFE BY DESIGN: migrations in this project are applied by hand and do NOT
// ride along with a merge, so this code can be live before `interviews` exists.
// Any error (missing table included) returns [] rather than throwing, and the
// Interview tab then falls back to the candidate-row columns — i.e. exactly the
// behaviour that shipped before Phase C. A missing migration must degrade, never
// 500 a candidate page.
export async function listCandidateInterviews(
  candidateId: string,
): Promise<InterviewRow[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("interviews")
      .select("*")
      .eq("candidate_id", candidateId)
      .order("round", { ascending: false });
    if (error) {
      console.warn("[interviews] read failed (falling back to candidate columns):", error.message);
      return [];
    }
    return (data ?? []) as InterviewRow[];
  } catch (e) {
    console.warn(
      "[interviews] read threw (falling back to candidate columns):",
      e instanceof Error ? e.message : String(e),
    );
    return [];
  }
}
