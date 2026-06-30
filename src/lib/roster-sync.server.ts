import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getUattendAdapter } from "@/lib/uattend/adapter.server";
import type { RosterSyncDetail, RosterSyncRun } from "@/lib/supabase/types";

// Roster auto add/remove. The uAttend employee feed (matched to DT employees by
// email) is the source of truth for who is active, so a new hire or a
// termination flows to the roster automatically instead of being hand-edited —
// the manual delete/add that causes their billing/report errors.
//
// Feed-scoped + conservative by design:
//   * uAttend active=true, not on DT roster        → CREATE (active)        [added]
//   * uAttend active=true, DT inactive/terminated  → REACTIVATE             [added]
//   * uAttend active=false, DT currently active     → set INACTIVE          [removed]
//   * DT employees NOT in the uAttend feed          → untouched (not managed by uAttend)
// Every pass is logged to roster_sync_runs so it's observable + reversible.
export async function reconcileRosterFromUattend(opts: {
  ranBy?: string;
}): Promise<RosterSyncRun> {
  const adapter = await getUattendAdapter();
  const sb = await createClient();

  const employees = await adapter.getEmployees();
  const { data: dtEmps } = await sb.from("employees").select("id, email, full_name, status");
  const byEmail = new Map<string, { id: string; status: string; full_name: string }>();
  for (const e of (dtEmps ?? []) as { id: string; email: string | null; status: string; full_name: string }[]) {
    if (e.email) byEmail.set(e.email.toLowerCase(), { id: e.id, status: e.status, full_name: e.full_name });
  }

  const details: RosterSyncDetail[] = [];
  let added = 0;
  let removed = 0;
  const flagged = 0;

  for (const e of employees) {
    if (!e.email) continue; // can't safely reconcile without a join key
    const dt = byEmail.get(e.email.toLowerCase());

    if (e.active) {
      if (!dt) {
        const { data: created } = await sb
          .from("employees")
          .insert({ full_name: e.fullName, email: e.email, status: "active", score: 0 })
          .select("id")
          .single();
        if (created) {
          added++;
          details.push({ employee_id: created.id as string, name: e.fullName, action: "added", reason: "new active uAttend employee" });
        }
      } else if (dt.status !== "active" && dt.status !== "onboarding") {
        await sb.from("employees").update({ status: "active" }).eq("id", dt.id);
        added++;
        details.push({ employee_id: dt.id, name: dt.full_name, action: "added", reason: `reactivated from ${dt.status}` });
      }
    } else {
      // Explicit termination signal from uAttend.
      if (dt && dt.status === "active") {
        await sb.from("employees").update({ status: "inactive" }).eq("id", dt.id);
        removed++;
        details.push({ employee_id: dt.id, name: dt.full_name, action: "removed", reason: "terminated in uAttend" });
      }
    }
  }

  const { data: run, error } = await sb
    .from("roster_sync_runs")
    .insert({
      ran_by: opts.ranBy ?? null,
      source: "uattend",
      added_count: added,
      removed_count: removed,
      flagged_count: flagged,
      details,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return run as RosterSyncRun;
}

export async function listRosterSyncRuns(limit = 5): Promise<RosterSyncRun[]> {
  const sb = await createClient();
  const { data } = await sb
    .from("roster_sync_runs")
    .select("*")
    .order("ran_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as RosterSyncRun[];
}
