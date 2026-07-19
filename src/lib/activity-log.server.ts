import "server-only";
import { createClient } from "./supabase/server";
import { getCurrentUser } from "./auth.server";
import type { ActivityLogEntry, NoteSubjectType } from "./supabase/types";

// Change Log (card 503b6bdf). One append-only timeline of every meaningful edit
// to a candidate / onboarding / employee record. The author + timestamp are
// ALWAYS stamped server-side. Reused across subjects via `subjectType`, matching
// the candidate_notes surface.

export type LogFieldChange = {
  field: string;
  from: string | null;
  to: string | null;
};

type LogArgs = {
  subjectType?: NoteSubjectType;
  subjectId: string;
  action: string;
  summary: string;
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  meta?: Record<string, unknown>;
};

/**
 * Record a single change-log entry. INTENTIONALLY fail-safe: the change log is
 * observability, never the point of the operation, so a failed insert (missing
 * table before the migration lands, RLS, transient error) is swallowed and
 * logged to the server console — it must NEVER throw and roll back the caller's
 * real mutation (a status change, a profile edit, a hire).
 */
export async function logActivity(args: LogArgs): Promise<void> {
  try {
    const supabase = await createClient();
    const me = await getCurrentUser();
    const actorName = me?.profile.full_name ?? "System";
    const actorId = me?.id ?? null;
    const { error } = await supabase.from("activity_log").insert({
      subject_type: args.subjectType ?? "candidate",
      subject_id: args.subjectId,
      actor_id: actorId,
      actor_name: actorName,
      action: args.action,
      summary: args.summary,
      field: args.field ?? null,
      old_value: args.oldValue ?? null,
      new_value: args.newValue ?? null,
      meta: args.meta ?? {},
    });
    if (error) {
      console.error("[activity-log] insert failed:", error.message);
    }
  } catch (err) {
    console.error("[activity-log] unexpected error:", err);
  }
}

/**
 * Record several field-level changes as ONE summary entry plus the individual
 * field diffs in meta. Used by profile edits where multiple fields can change in
 * a single save. No-ops (and skips the DB round-trip) when nothing changed.
 */
export async function logFieldChanges(
  subjectId: string,
  changes: LogFieldChange[],
  opts: { subjectType?: NoteSubjectType; action?: string; label?: string } = {},
): Promise<void> {
  const real = changes.filter((c) => (c.from ?? "") !== (c.to ?? ""));
  if (real.length === 0) return;
  const fieldList = real.map((c) => c.field).join(", ");
  const label = opts.label ?? "Updated profile";
  await logActivity({
    subjectType: opts.subjectType,
    subjectId,
    action: opts.action ?? "profile_updated",
    summary:
      real.length === 1
        ? `${label}: ${real[0].field}`
        : `${label}: ${fieldList}`,
    field: real.length === 1 ? real[0].field : null,
    oldValue: real.length === 1 ? real[0].from : null,
    newValue: real.length === 1 ? real[0].to : null,
    meta: { changes: real },
  });
}

// Read a subject's change log, NEWEST FIRST (matches the notes log ordering).
export async function listActivity(
  subjectType: NoteSubjectType,
  subjectId: string,
): Promise<ActivityLogEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activity_log")
    .select("*")
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)
    .order("created_at", { ascending: false });
  // Read side is tolerant too: if the table isn't there yet (migration pending),
  // render an empty log rather than 500-ing the whole candidate page.
  if (error) {
    console.error("[activity-log] list failed:", error.message);
    return [];
  }
  return (data ?? []) as ActivityLogEntry[];
}
