"use server";

// AUTH: every export below is a directly-invocable endpoint, not a private
// function — Next compiles each one into its own addressable POST. The gate
// belongs on the ACTION, not only on the page that happens to render it.
//
// This area is admin-only. See e2e/logic/server-action-gates.spec.ts for why
// this file is classified admin rather than left at the authenticated floor.

import { revalidatePath } from "next/cache";
import { reconcileRosterFromUattend } from "@/lib/roster-sync.server";
import type { RosterSyncRun } from "@/lib/supabase/types";
import { assertRole } from "@/lib/auth.server";

// Reconcile the active roster against the uAttend feed (live key if connected,
// else mock). New hires are added, terminations flipped inactive — no manual
// delete/add. Returns the run so the UI can show exactly what changed.
export async function syncRosterFromUattend(ranBy?: string): Promise<RosterSyncRun> {
  await assertRole("admin");
  const run = await reconcileRosterFromUattend({ ranBy });
  revalidatePath("/roster");
  revalidatePath("/dashboard");
  return run;
}
