"use server";

// AUTH: every export below is a directly-invocable endpoint, not a private
// function — Next compiles each one into its own addressable POST. The gate
// belongs on the ACTION, not only on the page that happens to render it.

import { revalidatePath } from "next/cache";
import { recordPeriodVerification } from "@/lib/verification.server";
import type { PeriodVerification } from "@/lib/supabase/types";
import { requireUser } from "@/lib/auth.server";

// Explicit sign-off: snapshot the current reconciliation for the period. Rocio
// retains this step even when automated — it records who verified, the result,
// and the per-employee detail at verification time.
export async function signOffPeriodVerification(
  periodId: string,
  verifiedBy: string,
): Promise<PeriodVerification> {
  await requireUser();
  const v = await recordPeriodVerification(periodId, verifiedBy);
  revalidatePath("/reconciliation");
  return v;
}
