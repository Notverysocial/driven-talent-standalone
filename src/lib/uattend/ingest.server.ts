import "server-only";
import { createClient } from "@/lib/supabase/server";
import { DAYS, emptyDays, rollupTotals } from "@/lib/timecards";
import type { TimecardDays } from "@/lib/supabase/types";
import { getUattendAdapter } from "./adapter.server";
import { mondayOf, type UattendEmployee, type UattendTimecard } from "./contract";

export type UattendIngestSummary = {
  mode: "live" | "mock";
  weekStart: string;
  employeesSeen: number;
  timecardsUpserted: number;
  employeesCreated: { id: string; name: string; email: string | null }[];
  assignmentsCreated: number;
  unmatchedClients: string[];
  skipped: { name: string; reason: string }[];
};

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Map a uAttend timecard's dated day rows onto the DB's mon..sun TimecardDays.
function toTimecardDays(tc: UattendTimecard): TimecardDays {
  const days = emptyDays();
  for (const d of tc.days) {
    const idx = Math.round(
      (new Date(`${d.date}T00:00:00`).getTime() -
        new Date(`${tc.weekStart}T00:00:00`).getTime()) /
        86_400_000,
    );
    if (idx < 0 || idx > 6) continue;
    const key = DAYS[idx];
    days[key] = {
      regular: d.regular,
      overtime: d.overtime,
      holiday: d.holiday,
      in: d.in,
      out: d.out,
      locked: false,
    };
  }
  return days;
}

// Pull the given week from uAttend (live or mock) and write it onto the
// canonical DB time cards. New employees referenced by a timecard are created
// (active) so the roster picks them up — this is the "hours entered once
// propagate everywhere" bridge. Idempotent per (employee, client, week_start).
export async function importUattendTimecards(opts: {
  weekStart?: string;
}): Promise<UattendIngestSummary> {
  const adapter = await getUattendAdapter();
  const sb = await createClient();

  const weekStart = mondayOf(opts.weekStart ?? new Date().toISOString().slice(0, 10));
  const range = { startDate: weekStart, endDate: addDaysYmd(weekStart, 6) };

  const [employees, timecards] = await Promise.all([
    adapter.getEmployees(),
    adapter.getTimecards(range),
  ]);
  const empByUid = new Map<string, UattendEmployee>(employees.map((e) => [e.uattendId, e]));

  // Existing DT employees (match by email) + clients (match by slug).
  const [{ data: dtEmps }, { data: dtClients }] = await Promise.all([
    sb.from("employees").select("id, email, full_name, status"),
    sb.from("clients").select("id, slug, name"),
  ]);
  const empByEmail = new Map<string, { id: string }>();
  for (const e of (dtEmps ?? []) as { id: string; email: string | null }[]) {
    if (e.email) empByEmail.set(e.email.toLowerCase(), { id: e.id });
  }
  const clientBySlug = new Map<string, { id: string }>();
  for (const c of (dtClients ?? []) as { id: string; slug: string }[]) {
    clientBySlug.set(c.slug.toLowerCase(), { id: c.id });
  }

  const summary: UattendIngestSummary = {
    mode: adapter.mode,
    weekStart,
    employeesSeen: employees.length,
    timecardsUpserted: 0,
    employeesCreated: [],
    assignmentsCreated: 0,
    unmatchedClients: [],
    skipped: [],
  };

  for (const tc of timecards) {
    const ua = empByUid.get(tc.uattendId);
    const name = ua?.fullName ?? tc.uattendId;
    const email = ua?.email ?? null;

    // Resolve the client first — a timecard with no matching DT client is skipped.
    const slug = (tc.clientCode ?? ua?.clientCode ?? "").toLowerCase();
    const client = slug ? clientBySlug.get(slug) : undefined;
    if (!client) {
      if (slug && !summary.unmatchedClients.includes(slug)) summary.unmatchedClients.push(slug);
      summary.skipped.push({ name, reason: `no DT client for "${slug || "(none)"}"` });
      continue;
    }

    // Resolve / create the DT employee (auto-add to roster).
    let dtEmployeeId = email ? empByEmail.get(email)?.id : undefined;
    if (!dtEmployeeId) {
      const { data: created, error } = await sb
        .from("employees")
        .insert({ full_name: name, email, status: "active", score: 0 })
        .select("id")
        .single();
      if (error || !created) {
        summary.skipped.push({ name, reason: `employee create failed: ${error?.message ?? "unknown"}` });
        continue;
      }
      dtEmployeeId = created.id as string;
      if (email) empByEmail.set(email.toLowerCase(), { id: dtEmployeeId });
      summary.employeesCreated.push({ id: dtEmployeeId, name, email });
    }

    const department = tc.department ?? ua?.department ?? "General";
    const payRate = ua?.payRate ?? null;

    // Ensure an active assignment for (employee, client).
    const { data: existingAssign } = await sb
      .from("employee_assignments")
      .select("id, hourly_rate")
      .eq("employee_id", dtEmployeeId)
      .eq("client_id", client.id)
      .eq("active", true)
      .maybeSingle();
    let assignmentRate = (existingAssign?.hourly_rate as number | undefined) ?? payRate ?? 20;
    if (!existingAssign) {
      const { error: aErr } = await sb.from("employee_assignments").insert({
        employee_id: dtEmployeeId,
        client_id: client.id,
        position: department,
        department,
        shift: "1st (6a-2p)",
        hourly_rate: payRate ?? 20,
        active: true,
      });
      if (!aErr) {
        summary.assignmentsCreated += 1;
        assignmentRate = payRate ?? 20;
      }
    }

    // Upsert the timecard for (employee, client, week_start).
    const days = toTimecardDays(tc);
    const totals = rollupTotals(days);
    const { data: existingTc } = await sb
      .from("timecards")
      .select("id")
      .eq("employee_id", dtEmployeeId)
      .eq("client_id", client.id)
      .eq("week_start", weekStart)
      .maybeSingle();

    if (existingTc) {
      const { error } = await sb
        .from("timecards")
        .update({
          days,
          reg_hours: totals.reg_hours,
          ot_hours: totals.ot_hours,
          holiday_hours: totals.holiday_hours,
        })
        .eq("id", existingTc.id);
      if (!error) summary.timecardsUpserted += 1;
    } else {
      const { error } = await sb.from("timecards").insert({
        employee_id: dtEmployeeId,
        client_id: client.id,
        week_start: weekStart,
        days,
        reg_hours: totals.reg_hours,
        ot_hours: totals.ot_hours,
        holiday_hours: totals.holiday_hours,
        hourly_rate: assignmentRate,
        status: "submitted",
      });
      if (!error) summary.timecardsUpserted += 1;
    }
  }

  return summary;
}
