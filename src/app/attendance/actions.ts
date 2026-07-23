"use server";

// AUTH: every export below is a directly-invocable endpoint, not a private
// function — Next compiles each one into its own addressable POST. The gate
// belongs on the ACTION, not only on the page that happens to render it.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AttendanceStatus } from "@/lib/supabase/types";
import { EXCEPTION_STATUSES } from "@/lib/staffing";
import { requireUser } from "@/lib/auth.server";

// Only exception statuses can be logged through the attendance view; `present`
// is the assumed default and is never written from here.
const VALID = EXCEPTION_STATUSES as readonly AttendanceStatus[];

function isException(status: string): status is AttendanceStatus {
  return (VALID as readonly string[]).includes(status);
}

function revalidateAll(employeeId?: string) {
  revalidatePath("/attendance");
  revalidatePath("/dashboard");
  revalidatePath("/roster");
  if (employeeId) revalidatePath(`/employees/${employeeId}`);
}

// Add (or upsert) an attendance exception. The (employee_id, client_id, date)
// unique key means re-logging the same day updates the existing entry rather
// than duplicating it.
export async function addAttendanceException(formData: FormData) {
  await requireUser();
  const supabase = await createClient();

  // The picker submits a combined "employeeId::clientId" value so a logged
  // exception always maps to a real active assignment.
  const pair = (formData.get("assignment") as string)?.trim() ?? "";
  const [employeeId, clientId] = pair.split("::");
  const status = formData.get("status") as string;
  const date =
    (formData.get("date") as string)?.trim() ||
    new Date().toISOString().slice(0, 10);
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (!employeeId || !clientId) throw new Error("Pick an employee");
  if (!isException(status)) throw new Error(`Invalid status: ${status}`);

  const { error } = await supabase.from("attendance_entries").upsert(
    { employee_id: employeeId, client_id: clientId, date, status, notes },
    { onConflict: "employee_id,client_id,date" },
  );
  if (error) throw new Error(error.message);

  revalidateAll(employeeId);
}

// Edit an existing exception (status / date / notes). Used by the inline edit
// row and the inline status dropdown.
export async function updateAttendanceException(
  id: string,
  fields: { status?: string; date?: string; notes?: string | null },
) {
  await requireUser();
  const supabase = await createClient();

  const patch: Record<string, unknown> = {};
  if (fields.status !== undefined) {
    if (!isException(fields.status)) {
      throw new Error(`Invalid status: ${fields.status}`);
    }
    patch.status = fields.status;
  }
  if (fields.date !== undefined && fields.date) patch.date = fields.date;
  if (fields.notes !== undefined) patch.notes = fields.notes || null;

  if (Object.keys(patch).length === 0) return;

  const { data, error } = await supabase
    .from("attendance_entries")
    .update(patch)
    .eq("id", id)
    .select("employee_id")
    .single();
  if (error) throw new Error(error.message);

  revalidateAll(data?.employee_id);
}

// Delete an incorrect exception entry.
export async function deleteAttendanceException(id: string) {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance_entries")
    .delete()
    .eq("id", id)
    .select("employee_id")
    .single();
  if (error) throw new Error(error.message);
  revalidateAll(data?.employee_id);
}
