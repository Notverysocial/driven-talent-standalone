import "server-only";
import { createClient } from "./supabase/server";
import type { WellnessNote } from "./supabase/types";

// Wellness / follow-up notes timeline (migration 0034). Immutable, append-only
// case-management entries scoped to an employee — the backbone of the
// workplace-accident / incident follow-up record. Ordered most-recent-first.
export async function listWellnessNotes(
  employeeId: string,
): Promise<WellnessNote[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("wellness_notes")
    .select("*")
    .eq("employee_id", employeeId)
    .order("occurred_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as WellnessNote[];
}
