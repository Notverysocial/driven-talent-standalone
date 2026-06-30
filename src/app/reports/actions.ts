"use server";

import { revalidatePath } from "next/cache";
import { importUattendTimecards, type UattendIngestSummary } from "@/lib/uattend/ingest.server";

// Pull the selected week's time cards from uAttend (live key if connected, else
// the mock adapter) and write them onto the canonical DB time cards. This is
// the "hours entered once propagate everywhere" bridge — reports, invoices,
// roster and the audit view all read from the time cards this populates.
export async function pullUattendWeek(weekStart: string): Promise<UattendIngestSummary> {
  const summary = await importUattendTimecards({ weekStart });
  revalidatePath("/reports");
  revalidatePath("/timecards");
  revalidatePath("/roster");
  return summary;
}
