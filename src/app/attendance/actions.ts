"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AttendanceStatus } from "@/lib/supabase/types";

const VALID: AttendanceStatus[] = ["present", "late", "missed", "no_show", "excused"];

export async function setAttendance(
  employeeId: string,
  clientId: string,
  date: string,
  status: AttendanceStatus | null,
  notes?: string,
) {
  const supabase = await createClient();
  if (status === null) {
    const { error } = await supabase
      .from("attendance_entries")
      .delete()
      .eq("employee_id", employeeId)
      .eq("client_id", clientId)
      .eq("date", date);
    if (error) throw new Error(error.message);
  } else {
    if (!VALID.includes(status)) throw new Error(`Invalid status: ${status}`);
    const { error } = await supabase
      .from("attendance_entries")
      .upsert(
        {
          employee_id: employeeId,
          client_id: clientId,
          date,
          status,
          notes: notes ?? null,
        },
        { onConflict: "employee_id,client_id,date" },
      );
    if (error) throw new Error(error.message);
  }
  revalidatePath("/attendance");
  revalidatePath("/dashboard");
  revalidatePath(`/employees/${employeeId}`);
  revalidatePath("/roster");
}
