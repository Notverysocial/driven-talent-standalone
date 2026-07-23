"use server";

// AUTH: every export below is a directly-invocable endpoint, not a private
// function — Next compiles each one into its own addressable POST. The gate
// belongs on the ACTION, not only on the page that happens to render it.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SickEntryType } from "@/lib/supabase/types";
import { CA_SICK_ACCRUAL_CAP_HOURS } from "@/lib/hr";
import { requireUser } from "@/lib/auth.server";

const VALID: SickEntryType[] = ["accrual", "usage", "adjustment", "payout"];

// Log a sick-time entry and update the employee's running balance.
// Capped at CA_SICK_ACCRUAL_CAP_HOURS on accrual; floored at 0 on usage.
export async function logSickEntry(formData: FormData) {
  await requireUser();
  const supabase = await createClient();

  const employeeId = (formData.get("employee_id") as string)?.trim();
  const entryType = formData.get("entry_type") as SickEntryType;
  const hoursRaw = formData.get("hours") as string;
  const entryDate =
    (formData.get("entry_date") as string)?.trim() ||
    new Date().toISOString().slice(0, 10);
  const notes = (formData.get("notes") as string)?.trim() || null;
  const createdBy = (formData.get("created_by") as string)?.trim() || null;

  if (!employeeId) throw new Error("Employee is required");
  if (!VALID.includes(entryType)) throw new Error(`Invalid entry type: ${entryType}`);
  const hours = Number(hoursRaw);
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new Error("Hours must be a positive number");
  }

  const { data: emp, error: empErr } = await supabase
    .from("employees")
    .select("sick_hours_balance")
    .eq("id", employeeId)
    .single();
  if (empErr) throw new Error(empErr.message);

  const current = Number(emp.sick_hours_balance ?? 0);
  let delta = 0;
  if (entryType === "accrual" || entryType === "adjustment") delta = hours;
  else delta = -hours; // usage / payout

  let nextBalance = current + delta;
  if (entryType === "accrual" && nextBalance > CA_SICK_ACCRUAL_CAP_HOURS) {
    // Cap accrual at the CA statutory ceiling. The entry still records
    // what was earned so the audit trail isn't lost.
    nextBalance = CA_SICK_ACCRUAL_CAP_HOURS;
  }
  if (nextBalance < 0) nextBalance = 0;

  const { error: insErr } = await supabase.from("sick_time_entries").insert({
    employee_id: employeeId,
    entry_date: entryDate,
    entry_type: entryType,
    hours,
    notes,
    created_by: createdBy,
  });
  if (insErr) throw new Error(insErr.message);

  const { error: updErr } = await supabase
    .from("employees")
    .update({ sick_hours_balance: nextBalance })
    .eq("id", employeeId);
  if (updErr) throw new Error(updErr.message);

  revalidatePath("/sick-time");
  revalidatePath(`/employees/${employeeId}`);
}

// Signed balance impact of an entry: accrual/adjustment add, usage/payout subtract.
function signedDelta(type: SickEntryType, hours: number): number {
  return type === "accrual" || type === "adjustment" ? hours : -hours;
}

// Edit an existing sick-time entry and re-derive the running balance: back out
// the original entry's effect, then apply the edited one (with the same accrual
// cap / zero floor as logging).
export async function updateSickEntry(formData: FormData) {
  await requireUser();
  const supabase = await createClient();

  const id = (formData.get("id") as string)?.trim();
  const employeeId = (formData.get("employee_id") as string)?.trim();
  const entryType = formData.get("entry_type") as SickEntryType;
  const hoursRaw = formData.get("hours") as string;
  const entryDate =
    (formData.get("entry_date") as string)?.trim() ||
    new Date().toISOString().slice(0, 10);
  const notes = (formData.get("notes") as string)?.trim() || null;
  const createdBy = (formData.get("created_by") as string)?.trim() || null;

  if (!id) throw new Error("Entry id is required");
  if (!employeeId) throw new Error("Employee is required");
  if (!VALID.includes(entryType)) throw new Error(`Invalid entry type: ${entryType}`);
  const hours = Number(hoursRaw);
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new Error("Hours must be a positive number");
  }

  const { data: old, error: oldErr } = await supabase
    .from("sick_time_entries")
    .select("hours, entry_type")
    .eq("id", id)
    .single();
  if (oldErr) throw new Error(oldErr.message);

  const { data: emp, error: empErr } = await supabase
    .from("employees")
    .select("sick_hours_balance")
    .eq("id", employeeId)
    .single();
  if (empErr) throw new Error(empErr.message);

  const base =
    Number(emp.sick_hours_balance ?? 0) -
    signedDelta(old.entry_type as SickEntryType, Number(old.hours));
  let nextBalance = base + signedDelta(entryType, hours);
  if (entryType === "accrual" && nextBalance > CA_SICK_ACCRUAL_CAP_HOURS) {
    nextBalance = CA_SICK_ACCRUAL_CAP_HOURS;
  }
  if (nextBalance < 0) nextBalance = 0;

  const { error: updErr } = await supabase
    .from("sick_time_entries")
    .update({
      entry_type: entryType,
      hours,
      entry_date: entryDate,
      notes,
      created_by: createdBy,
    })
    .eq("id", id);
  if (updErr) throw new Error(updErr.message);

  const { error: balErr } = await supabase
    .from("employees")
    .update({ sick_hours_balance: nextBalance })
    .eq("id", employeeId);
  if (balErr) throw new Error(balErr.message);

  revalidatePath("/sick-time");
  revalidatePath(`/employees/${employeeId}`);
}

export async function deleteSickEntry(entryId: string, employeeId: string) {
  await requireUser();
  const supabase = await createClient();
  const { data: entry, error: getErr } = await supabase
    .from("sick_time_entries")
    .select("hours, entry_type")
    .eq("id", entryId)
    .single();
  if (getErr) throw new Error(getErr.message);

  const { data: emp, error: empErr } = await supabase
    .from("employees")
    .select("sick_hours_balance")
    .eq("id", employeeId)
    .single();
  if (empErr) throw new Error(empErr.message);

  // Reverse the original delta.
  const hours = Number(entry.hours);
  const reverse =
    entry.entry_type === "accrual" || entry.entry_type === "adjustment"
      ? -hours
      : hours;
  const next = Math.max(0, Number(emp.sick_hours_balance) + reverse);

  const { error: delErr } = await supabase
    .from("sick_time_entries")
    .delete()
    .eq("id", entryId);
  if (delErr) throw new Error(delErr.message);

  await supabase
    .from("employees")
    .update({ sick_hours_balance: next })
    .eq("id", employeeId);

  revalidatePath("/sick-time");
  revalidatePath(`/employees/${employeeId}`);
}
