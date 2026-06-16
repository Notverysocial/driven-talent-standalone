"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  autoOvertimeAdjustment,
  emptyDays,
  rollupTotals,
  startOfWeek,
  type DayKey,
} from "@/lib/timecards";
import type { TimecardDay, TimecardDays } from "@/lib/supabase/types";

export async function createOrOpenTimecard(formData: FormData) {
  const supabase = await createClient();

  // The assignment <select> submits "employeeId|clientId|hourlyRate" as a
  // single value. Parse it server-side so the flow never depends on client
  // JS: the page used an inline script to copy the parts into hidden fields,
  // but that script does not re-run on App Router soft navigation (arriving
  // via the "+ New Timecard" link), so employee_id/client_id stayed empty and
  // the created timecard 404'd.
  const serialized = (formData.get("assignment_serialized") as string) || "";
  const [serEmp, serCli, serRate] = serialized.split("|");
  const employeeId = (serEmp ?? "").trim();
  const clientId   = (serCli ?? "").trim();
  const weekRaw    = (formData.get("week") as string) || new Date().toISOString().slice(0, 10);
  const weekStart  = startOfWeek(new Date(weekRaw + "T00:00:00")).toISOString().slice(0, 10);
  const rateRaw    = Number(serRate) || 0;

  // No assignment selected (or a malformed value): bounce back to the form
  // rather than inserting a timecard with no employee/client.
  if (!employeeId || !clientId) {
    redirect("/timecards/new");
  }

  // Look up rate from current assignment if not passed
  let rate = rateRaw;
  if (rate <= 0) {
    const { data: a } = await supabase
      .from("employee_assignments")
      .select("hourly_rate")
      .eq("employee_id", employeeId)
      .eq("client_id", clientId)
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    rate = a?.hourly_rate ?? 20;
  }

  // Idempotent: return existing or insert blank
  const { data: existing } = await supabase
    .from("timecards")
    .select("id")
    .eq("employee_id", employeeId)
    .eq("client_id", clientId)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (existing) {
    redirect(`/timecards/${existing.id}`);
  }

  const days = emptyDays();
  const { reg_hours, ot_hours, holiday_hours } = rollupTotals(days);
  const { data: created, error } = await supabase
    .from("timecards")
    .insert({
      employee_id: employeeId,
      client_id: clientId,
      week_start: weekStart,
      days,
      reg_hours,
      ot_hours,
      holiday_hours,
      hourly_rate: rate,
      status: "draft",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  revalidatePath("/timecards");
  redirect(`/timecards/${created.id}`);
}

export async function updateDay(
  timecardId: string,
  day: DayKey,
  patch: Partial<TimecardDay>,
) {
  const supabase = await createClient();
  const { data: row, error: getErr } = await supabase
    .from("timecards")
    .select("days, status")
    .eq("id", timecardId)
    .single();
  if (getErr) throw new Error(getErr.message);

  if (row.status !== "draft" && row.status !== "rejected") {
    throw new Error("Cannot edit a submitted or approved timecard.");
  }

  const days = (row.days as TimecardDays) ?? emptyDays();
  const next = { ...days, [day]: { ...(days[day] ?? { regular: 0, overtime: 0, holiday: 0, in: null, out: null, locked: false }), ...patch } };
  const totals = rollupTotals(next);

  const { error } = await supabase
    .from("timecards")
    .update({
      days: next,
      reg_hours: totals.reg_hours,
      ot_hours: totals.ot_hours,
      holiday_hours: totals.holiday_hours,
    })
    .eq("id", timecardId);
  if (error) throw new Error(error.message);

  revalidatePath(`/timecards/${timecardId}`);
  revalidatePath("/timecards");
}

export async function submitTimecard(timecardId: string) {
  const supabase = await createClient();
  // Auto-OT: anything over 40 reg hours rolls into OT before submission.
  const { data: row, error: getErr } = await supabase
    .from("timecards")
    .select("days")
    .eq("id", timecardId)
    .single();
  if (getErr) throw new Error(getErr.message);

  const adjusted = autoOvertimeAdjustment(row.days as TimecardDays);
  const totals = rollupTotals(adjusted);

  const { error } = await supabase
    .from("timecards")
    .update({
      days: adjusted,
      reg_hours: totals.reg_hours,
      ot_hours: totals.ot_hours,
      holiday_hours: totals.holiday_hours,
      status: "submitted",
      submitted_at: new Date().toISOString(),
    })
    .eq("id", timecardId);
  if (error) throw new Error(error.message);

  revalidatePath(`/timecards/${timecardId}`);
  revalidatePath("/timecards");
}

export async function approveTimecard(timecardId: string, approvedBy: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("timecards")
    .update({
      status: "approved",
      approved_by: approvedBy || "Roxanna",
      approved_at: new Date().toISOString(),
    })
    .eq("id", timecardId);
  if (error) throw new Error(error.message);
  revalidatePath(`/timecards/${timecardId}`);
  revalidatePath("/timecards");
  revalidatePath("/dashboard");
}

export async function rejectTimecard(timecardId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("timecards")
    .update({ status: "rejected" })
    .eq("id", timecardId);
  if (error) throw new Error(error.message);
  revalidatePath(`/timecards/${timecardId}`);
  revalidatePath("/timecards");
}

export async function returnToDraft(timecardId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("timecards")
    .update({ status: "draft", submitted_at: null })
    .eq("id", timecardId);
  if (error) throw new Error(error.message);
  revalidatePath(`/timecards/${timecardId}`);
  revalidatePath("/timecards");
}
