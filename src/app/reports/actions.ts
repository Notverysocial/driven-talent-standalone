"use server";

// AUTH: every export below is a directly-invocable endpoint, not a private
// function — Next compiles each one into its own addressable POST. The gate
// belongs on the ACTION, not only on the page that happens to render it.
//
// This area is admin-only. See e2e/logic/server-action-gates.spec.ts for why
// this file is classified admin rather than left at the authenticated floor.

import { revalidatePath } from "next/cache";
import { importUattendTimecards, type UattendIngestSummary } from "@/lib/uattend/ingest.server";
import { assertRole } from "@/lib/auth.server";

// Pull the selected week's time cards from uAttend (live key if connected, else
// the mock adapter) and write them onto the canonical DB time cards. This is
// the "hours entered once propagate everywhere" bridge — reports, invoices,
// roster and the audit view all read from the time cards this populates.
export async function pullUattendWeek(weekStart: string): Promise<UattendIngestSummary> {
  await assertRole("admin");
  const summary = await importUattendTimecards({ weekStart });
  revalidatePath("/reports");
  revalidatePath("/timecards");
  revalidatePath("/roster");
  return summary;
}
