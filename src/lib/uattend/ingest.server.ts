import "server-only";
import { createClient } from "@/lib/supabase/server";
import { DAYS, emptyDays, rollupTotals, type DayKey } from "@/lib/timecards";
import { getUattendAdapter } from "./adapter.server";
import { getIntegration } from "@/lib/integrations/db";
import { mondayOf, type UattendEmployee } from "./contract";

// -------------------------------------------------------------------------
// uAttend → canonical DB time cards.
//
// Rebuilt 2026-07-02 for the real uAttend data. The previous version matched
// DT employees by EMAIL and clients by SLUG; the live feed has mostly-blank
// emails and a "client code" that is a DEPARTMENT NAME, not a DT client slug,
// so it silently skipped almost everything. This version:
//   1. sources hours from the bulk punch report (Regular paycode only),
//   2. resolves the DT employee by the durable uAttend-UserId→employee map
//      saved on integrations.uattend.config.employee_map (from the verified
//      pull), then falls back to a normalized name match ("Last First"),
//   3. resolves the client + hourly rate from the employee's ACTIVE assignment,
//   4. upserts the week's time cards, and
//   5. FLAGS anything it can't match confidently instead of guessing.
// -------------------------------------------------------------------------

export type UattendIngestSummary = {
  mode: "live" | "mock";
  weekStart: string;
  punchesSeen: number;
  employeesSeen: number;
  timecardsUpserted: number;
  matchedByMap: number;
  matchedByName: number;
  unmatched: { uattendId: string; name: string; hours: number }[];
  unassigned: { name: string; hours: number }[];
};

// Normalize a display name for matching: lowercase, drop payroll-ish tokens
// (letters+digits like "J00300"), collapse to single-spaced letters.
function normName(v: string): string {
  return (v || "")
    .toLowerCase()
    .replace(/[a-z]*[0-9][a-z0-9]*/g, " ")
    .replace(/[^a-z]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
const keyLF = (first: string, last: string) => normName(`${last} ${first}`);
const keyFL = (first: string, last: string) => normName(`${first} ${last}`);

function dayKeyFor(weekStart: string, dateYmd: string): DayKey | null {
  const idx = Math.round(
    (new Date(`${dateYmd}T00:00:00`).getTime() - new Date(`${weekStart}T00:00:00`).getTime()) /
      86_400_000,
  );
  return idx >= 0 && idx <= 6 ? DAYS[idx] : null;
}

export async function importUattendTimecards(opts: {
  weekStart?: string;
}): Promise<UattendIngestSummary> {
  const adapter = await getUattendAdapter();
  const sb = await createClient();

  const weekStart = mondayOf(opts.weekStart ?? new Date().toISOString().slice(0, 10));
  const endYmd = new Date(new Date(`${weekStart}T00:00:00`).getTime() + 6 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const [employees, punches] = await Promise.all([
    adapter.getEmployees(),
    adapter.getPunchReport({ startDate: weekStart, endDate: endYmd }),
  ]);
  const empByUid = new Map<string, UattendEmployee>(employees.map((e) => [e.uattendId, e]));

  // Durable map from the verified pull: uAttend UserId → DT employee id.
  let savedMap: Record<string, string> = {};
  try {
    const row = await getIntegration("uattend");
    const cfg = (row?.config ?? {}) as Record<string, unknown>;
    if (cfg.employee_map && typeof cfg.employee_map === "object") {
      savedMap = cfg.employee_map as Record<string, string>;
    }
  } catch {
    // no integration row — fall through to name matching only
  }

  // DT roster (name index) + active assignments (client + rate per employee).
  const [{ data: dtEmps }, { data: asgs }] = await Promise.all([
    sb.from("employees").select("id, full_name, email"),
    sb
      .from("employee_assignments")
      .select("employee_id, client_id, department, hourly_rate, active")
      .eq("active", true),
  ]);
  const nameIdx = new Map<string, string>();
  for (const e of (dtEmps ?? []) as { id: string; full_name: string }[]) {
    const k = normName(e.full_name);
    if (k && !nameIdx.has(k)) nameIdx.set(k, e.id);
  }
  const asgByEmp = new Map<string, { client_id: string; hourly_rate: number | null }>();
  for (const a of (asgs ?? []) as { employee_id: string; client_id: string; hourly_rate: number | null }[]) {
    if (a.client_id && !asgByEmp.has(a.employee_id)) {
      asgByEmp.set(a.employee_id, { client_id: a.client_id, hourly_rate: a.hourly_rate });
    }
  }

  // Group Regular punches per uAttend user per day.
  type Agg = { name: string; byDay: Map<DayKey, { reg: number; in: string | null; out: string | null }>; total: number };
  const byUid = new Map<string, Agg>();
  for (const p of punches) {
    if (p.paycodeId != null && p.paycodeId !== 1) continue; // Regular only (exclude lunch/break)
    const dk = dayKeyFor(weekStart, p.date);
    if (!dk) continue;
    const name = empByUid.get(p.uattendId)?.fullName ?? p.uattendId;
    let agg = byUid.get(p.uattendId);
    if (!agg) {
      agg = { name, byDay: new Map(), total: 0 };
      byUid.set(p.uattendId, agg);
    }
    const cur = agg.byDay.get(dk) ?? { reg: 0, in: null, out: null };
    cur.reg += p.hours || 0;
    cur.in = cur.in ?? p.punchIn;
    if (p.punchOut) cur.out = p.punchOut;
    agg.byDay.set(dk, cur);
    agg.total += p.hours || 0;
  }

  const summary: UattendIngestSummary = {
    mode: adapter.mode,
    weekStart,
    punchesSeen: punches.length,
    employeesSeen: employees.length,
    timecardsUpserted: 0,
    matchedByMap: 0,
    matchedByName: 0,
    unmatched: [],
    unassigned: [],
  };

  for (const [uid, agg] of byUid) {
    const ua = empByUid.get(uid);
    let empId = savedMap[uid];
    if (empId) {
      summary.matchedByMap += 1;
    } else if (ua) {
      empId = nameIdx.get(keyLF(ua.firstName, ua.lastName)) ?? nameIdx.get(keyFL(ua.firstName, ua.lastName)) ?? "";
      if (empId) summary.matchedByName += 1;
    }
    if (!empId) {
      summary.unmatched.push({ uattendId: uid, name: agg.name, hours: Math.round(agg.total * 100) / 100 });
      continue;
    }
    const asg = asgByEmp.get(empId);
    if (!asg?.client_id) {
      summary.unassigned.push({ name: agg.name, hours: Math.round(agg.total * 100) / 100 });
      continue;
    }

    const days = emptyDays();
    for (const [dk, v] of agg.byDay) {
      days[dk] = {
        regular: Math.round(v.reg * 100) / 100,
        overtime: 0,
        holiday: 0,
        in: v.in,
        out: v.out,
        locked: false,
      };
    }
    const totals = rollupTotals(days);

    const { data: existing } = await sb
      .from("timecards")
      .select("id")
      .eq("employee_id", empId)
      .eq("client_id", asg.client_id)
      .eq("week_start", weekStart)
      .maybeSingle();

    if (existing) {
      const { error } = await sb
        .from("timecards")
        .update({
          days,
          reg_hours: totals.reg_hours,
          ot_hours: totals.ot_hours,
          holiday_hours: totals.holiday_hours,
        })
        .eq("id", (existing as { id: string }).id);
      if (!error) summary.timecardsUpserted += 1;
    } else {
      const { error } = await sb.from("timecards").insert({
        employee_id: empId,
        client_id: asg.client_id,
        week_start: weekStart,
        days,
        reg_hours: totals.reg_hours,
        ot_hours: totals.ot_hours,
        holiday_hours: totals.holiday_hours,
        hourly_rate: asg.hourly_rate ?? 20,
        status: "draft",
      });
      if (!error) summary.timecardsUpserted += 1;
    }
  }

  return summary;
}
