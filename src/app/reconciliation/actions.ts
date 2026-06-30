"use server";

import { revalidatePath } from "next/cache";
import { recordPeriodVerification } from "@/lib/verification.server";
import type { PeriodVerification } from "@/lib/supabase/types";

// Explicit sign-off: snapshot the current reconciliation for the period. Rocio
// retains this step even when automated — it records who verified, the result,
// and the per-employee detail at verification time.
export async function signOffPeriodVerification(
  periodId: string,
  verifiedBy: string,
): Promise<PeriodVerification> {
  const v = await recordPeriodVerification(periodId, verifiedBy);
  revalidatePath("/reconciliation");
  return v;
}
