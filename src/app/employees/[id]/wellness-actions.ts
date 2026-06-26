"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth.server";
import type { WellnessEntryType } from "@/lib/supabase/types";

const ENTRY_TYPES: WellnessEntryType[] = [
  "note",
  "follow_up",
  "wellness_check",
  "incident",
  "accident",
  "return_to_work",
  "other",
];

// Append a wellness / follow-up entry to an employee's immutable timeline
// (Phase-1 #6). There is intentionally NO edit or delete action — entries are
// a permanent case-management record. The author is the signed-in user; an
// explicit author field overrides it (so a late entry can be attributed when
// the app is running with auth off / shared login).
export async function addWellnessNote(employeeId: string, formData: FormData) {
  const body = ((formData.get("body") as string) || "").trim();
  if (!body) throw new Error("Entry text is required");

  const rawType = (formData.get("entry_type") as string) || "note";
  const entryType: WellnessEntryType = (ENTRY_TYPES as string[]).includes(rawType)
    ? (rawType as WellnessEntryType)
    : "note";

  const me = await getCurrentUser();
  const explicitAuthor = ((formData.get("author_name") as string) || "").trim();
  const authorName =
    explicitAuthor || me?.profile.full_name || me?.email || "Unknown";

  // Optional back-dating of when the event occurred (datetime-local input).
  const occurredRaw = ((formData.get("occurred_at") as string) || "").trim();
  const occurredAt = occurredRaw ? new Date(occurredRaw).toISOString() : new Date().toISOString();

  const sb = await createClient();
  const { error } = await sb.from("wellness_notes").insert({
    employee_id: employeeId,
    entry_type: entryType,
    body,
    author_name: authorName,
    author_team_member_id: me?.profile.team_member_id ?? null,
    occurred_at: occurredAt,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/employees/${employeeId}`);
}
