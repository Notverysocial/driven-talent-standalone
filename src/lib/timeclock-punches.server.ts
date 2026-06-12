import "server-only";
import { createClient } from "./supabase/server";

// Aggregator helpers for the timeclock_punches table.  Used by the
// /timecards page to render punch history per timecard week and by
// the /integrations uAttend card to surface unmapped employee ids.

export type TimeclockPunch = {
  id: string;
  employee_id: string | null;
  uattend_employee_id: string | null;
  uattend_punch_id: string | null;
  punch_type:
    | "in"
    | "out"
    | "lunch_in"
    | "lunch_out"
    | "break_in"
    | "break_out";
  punch_time: string;
  device_name: string | null;
  notes: string | null;
  created_at: string;
};

export async function listPunchesForEmployeeWeek(args: {
  employeeId: string;
  weekStart: string; // 'YYYY-MM-DD'
}): Promise<TimeclockPunch[]> {
  const sb = await createClient();
  // weekStart is a date string at the local week-start; the actual
  // window we query is [weekStart, weekStart + 7 days).
  const start = new Date(`${args.weekStart}T00:00:00Z`);
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  const { data, error } = await sb
    .from("timeclock_punches")
    .select("*")
    .eq("employee_id", args.employeeId)
    .gte("punch_time", start.toISOString())
    .lt("punch_time", end.toISOString())
    .order("punch_time", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as TimeclockPunch[];
}

// Lists unique uAttend employee ids seen in the punches table that
// don't have a DT employee mapping yet.  Used by the mapping editor
// on /integrations.
export async function listUnmappedUattendEmployeeIds(args: {
  mapping: Record<string, string>;
}): Promise<{ uattend_employee_id: string; punch_count: number; latest_punch: string | null }[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("timeclock_punches")
    .select("uattend_employee_id, punch_time")
    .is("employee_id", null)
    .not("uattend_employee_id", "is", null);
  if (error) throw new Error(error.message);

  const byId = new Map<
    string,
    { punch_count: number; latest_punch: string | null }
  >();
  for (const r of (data ?? []) as {
    uattend_employee_id: string | null;
    punch_time: string;
  }[]) {
    const id = r.uattend_employee_id;
    if (!id) continue;
    if (args.mapping[id]) continue; // already mapped; will get backfilled by next sync
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, { punch_count: 1, latest_punch: r.punch_time });
    } else {
      prev.punch_count += 1;
      if (!prev.latest_punch || r.punch_time > prev.latest_punch) {
        prev.latest_punch = r.punch_time;
      }
    }
  }

  return Array.from(byId.entries())
    .map(([uattend_employee_id, v]) => ({ uattend_employee_id, ...v }))
    .sort((a, b) => b.punch_count - a.punch_count);
}

// Used by the mapping editor's employee picker.
export async function listEmployeeOptions(): Promise<
  { id: string; full_name: string; legacy_id: string | null }[]
> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("employees")
    .select("id, full_name, legacy_id")
    .order("full_name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as {
    id: string;
    full_name: string;
    legacy_id: string | null;
  }[];
}

export function punchTypeLabel(t: TimeclockPunch["punch_type"]): string {
  switch (t) {
    case "in":
      return "Clock In";
    case "out":
      return "Clock Out";
    case "lunch_in":
      return "Lunch Start";
    case "lunch_out":
      return "Lunch End";
    case "break_in":
      return "Break Start";
    case "break_out":
      return "Break End";
  }
}
