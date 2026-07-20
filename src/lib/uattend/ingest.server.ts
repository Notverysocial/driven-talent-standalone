import "server-only";
import { createClient } from "@/lib/supabase/server";
import { DAYS, emptyDays, rollupTotals, type DayKey } from "@/lib/timecards";
import { resolveWorkedMinutes } from "./worked-hours";
import type { TimecardStatus } from "@/lib/supabase/types";
import { getUattendAdapter } from "./adapter.server";
import { getIntegration } from "@/lib/integrations/db";
import { weekStartOf, type UattendEmployee } from "./contract";
import { mayOverwriteTimecard, type IngestTrigger } from "./ingest-policy";

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
  /**
   * Time cards a SCHEDULED run declined to overwrite because a human had
   * already acted on them (submitted / approved / rejected). Always reported so
   * the guard is visible rather than a silent no-op — if hours are missing from
   * an invoice, this list is where the answer is. Always empty for manual runs,
   * which keep force semantics.
   */
  skippedLocked: { name: string; status: string; hours: number }[];
  /**
   * Days whose punch line items did not reconcile cleanly against the In→Out
   * span — e.g. a meal only partly excluded from the Regular total, or segments
   * summing past the outer span. The safe (lower) number is written, but these
   * are reported so a wrong meal rule surfaces as a list instead of as a
   * silently inflated invoice, which is how lunch came to be billed at all.
   */
  unreconciled: {
    name: string;
    day: DayKey;
    basis: string;
    regHours: number;
    mealMinutes: number;
    in: string | null;
    out: string | null;
  }[];
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
  /**
   * Defaults to "manual" so every existing caller (the Reports "Pull week"
   * button) keeps its current force behaviour exactly. Only the cron passes
   * "scheduled", and only that path is guarded.
   */
  trigger?: IngestTrigger;
}): Promise<UattendIngestSummary> {
  const trigger: IngestTrigger = opts.trigger ?? "manual";
  const adapter = await getUattendAdapter();
  const sb = await createClient();

  const weekStart = weekStartOf(opts.weekStart ?? new Date().toISOString().slice(0, 10));
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

  // Group punches per uAttend user per day.
  //
  // The MEAL/BREAK lines (paycodes 6 and 7) are collected, NOT discarded. They
  // used to be dropped here and the unpaid meal "re-derived" as the residual
  // `span - regular`, which silently produced ZERO whenever the vendor's
  // Regular `Tot` was the gross In→Out span — billing the client for lunch.
  // See resolveWorkedMinutes() for how the two shapes are told apart.
  type DayAgg = {
    regMin: number;      // Σ Regular (paycode 1) Tot, in minutes
    mealMin: number;     // Σ meal/break (paycodes 6, 7) Tot, in minutes
    regLines: number;    // how many Regular line items — >1 means a split shift
    in: string | null;   // earliest punch-in of the day
    out: string | null;  // latest punch-out of the day
  };
  type Agg = { name: string; byDay: Map<DayKey, DayAgg>; total: number };

  const MEAL_PAYCODES = new Set([6, 7]);
  const isRegular = (id: number | null) => id == null || id === 1;

  const byUid = new Map<string, Agg>();
  for (const p of punches) {
    const paycode = p.paycodeId;
    const regular = isRegular(paycode);
    const meal = paycode != null && MEAL_PAYCODES.has(paycode);
    // Vacation / sick / holiday / other still don't belong in Regular hours.
    if (!regular && !meal) continue;

    const dk = dayKeyFor(weekStart, p.date);
    if (!dk) continue;
    const name = empByUid.get(p.uattendId)?.fullName ?? p.uattendId;
    let agg = byUid.get(p.uattendId);
    if (!agg) {
      agg = { name, byDay: new Map(), total: 0 };
      byUid.set(p.uattendId, agg);
    }
    const cur = agg.byDay.get(dk) ?? { regMin: 0, mealMin: 0, regLines: 0, in: null, out: null };

    if (regular) {
      cur.regMin += (p.hours || 0) * 60;
      cur.regLines += 1;
      // Earliest in / latest out by clock value — the punch report's row order
      // is not guaranteed, so "last row wins" could take an earlier Out.
      if (p.punchIn && (cur.in == null || p.punchIn < cur.in)) cur.in = p.punchIn;
      if (p.punchOut && (cur.out == null || p.punchOut > cur.out)) cur.out = p.punchOut;
    } else {
      cur.mealMin += (p.hours || 0) * 60;
    }
    agg.byDay.set(dk, cur);
  }

  // Per-employee weekly total, in WORKED hours net of any punched meal. Set
  // here rather than in the upsert loop below, because the unmatched /
  // unassigned branches report this figure and `continue` before reaching it.
  for (const agg of byUid.values()) {
    let worked = 0;
    for (const v of agg.byDay.values()) worked += resolveWorkedMinutes(v).workedMin / 60;
    agg.total = Math.round(worked * 100) / 100;
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
    skippedLocked: [],
    unreconciled: [],
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
      // Worked time net of any PUNCHED meal — see resolveWorkedMinutes() for
      // how a Regular `Tot` that already excludes the meal is told apart from
      // one that still contains it. Never re-derives the meal as a residual.
      const r = resolveWorkedMinutes(v);
      const reg = Math.round((r.workedMin / 60) * 100) / 100;
      if (r.ambiguous) {
        summary.unreconciled.push({
          name: agg.name,
          day: dk,
          basis: r.basis,
          regHours: Math.round((v.regMin / 60) * 100) / 100,
          mealMinutes: Math.round(v.mealMin),
          in: v.in,
          out: v.out,
        });
      }
      days[dk] = {
        regular: reg,
        overtime: 0,
        holiday: 0,
        in: v.in,
        out: v.out,
        locked: false,
        ...(r.lunchMin != null ? { lunch_min: r.lunchMin } : {}),
      };
    }
    const totals = rollupTotals(days);

    const { data: existing } = await sb
      .from("timecards")
      .select("id, status")
      .eq("employee_id", empId)
      .eq("client_id", asg.client_id)
      .eq("week_start", weekStart)
      .maybeSingle();

    const existingRow = existing as { id: string; status: TimecardStatus } | null;

    // The payroll-corruption guard. A scheduled run must not rewrite hours a
    // human has submitted or approved — previewInvoicesForPeriod reads approved
    // time cards, so overwriting one moves invoice amounts with nobody asking.
    // Manual pulls are unaffected.
    if (
      !mayOverwriteTimecard({ trigger, existingStatus: existingRow?.status ?? null })
    ) {
      summary.skippedLocked.push({
        name: agg.name,
        status: existingRow!.status,
        hours: Math.round(agg.total * 100) / 100,
      });
      continue;
    }

    if (existingRow) {
      const { error } = await sb
        .from("timecards")
        .update({
          days,
          reg_hours: totals.reg_hours,
          ot_hours: totals.ot_hours,
          holiday_hours: totals.holiday_hours,
        })
        .eq("id", existingRow.id);
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
