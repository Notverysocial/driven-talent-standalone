"use server";

import { revalidatePath } from "next/cache";
import { reconcileRosterFromUattend } from "@/lib/roster-sync.server";
import type { RosterSyncRun } from "@/lib/supabase/types";

// Reconcile the active roster against the uAttend feed (live key if connected,
// else mock). New hires are added, terminations flipped inactive — no manual
// delete/add. Returns the run so the UI can show exactly what changed.
export async function syncRosterFromUattend(ranBy?: string): Promise<RosterSyncRun> {
  const run = await reconcileRosterFromUattend({ ranBy });
  revalidatePath("/roster");
  revalidatePath("/dashboard");
  return run;
}
