"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { LOA_PROTECTED_BY_DEFAULT } from "@/lib/hr";
import type { LoaStatus, LoaType } from "@/lib/supabase/types";

const TYPES: LoaType[] = [
  "medical",
  "cfra",
  "pdl",
  "personal",
  "bereavement",
  "military",
  "jury_duty",
  "workers_comp",
  "other",
];
const STATUSES: LoaStatus[] = [
  "requested",
  "approved",
  "denied",
  "active",
  "returned",
  "cancelled",
];

export async function createLoaRequest(formData: FormData) {
  const supabase = await createClient();

  const employeeId = (formData.get("employee_id") as string)?.trim();
  const type = formData.get("type") as LoaType;
  const startDate = (formData.get("start_date") as string)?.trim();
  const endDate = ((formData.get("end_date") as string) || "").trim() || null;
  const reason = ((formData.get("reason") as string) || "").trim() || null;
  const paid = formData.get("paid") === "on";
  const protectedOverride = formData.get("protected");

  if (!employeeId) throw new Error("Employee is required");
  if (!TYPES.includes(type)) throw new Error(`Invalid LOA type: ${type}`);
  if (!startDate) throw new Error("Start date is required");
  if (endDate && endDate < startDate) {
    throw new Error("End date must be on or after start date");
  }

  const isProtected =
    protectedOverride === null || protectedOverride === undefined
      ? LOA_PROTECTED_BY_DEFAULT[type]
      : protectedOverride === "on";

  const { error } = await supabase.from("leave_of_absence_requests").insert({
    employee_id: employeeId,
    type,
    start_date: startDate,
    end_date: endDate,
    reason,
    paid,
    protected: isProtected,
    status: "requested",
  });
  if (error) throw new Error(error.message);

  revalidatePath("/loa");
  revalidatePath(`/employees/${employeeId}`);
}

export async function setLoaStatus(
  id: string,
  employeeId: string,
  status: LoaStatus,
  approvedBy?: string,
) {
  if (!STATUSES.includes(status)) throw new Error(`Invalid status: ${status}`);
  const supabase = await createClient();

  const patch: {
    status: LoaStatus;
    approved_by?: string | null;
    approved_at?: string | null;
    return_date?: string | null;
  } = { status };

  if (status === "approved") {
    patch.approved_by = approvedBy ?? "—";
    patch.approved_at = new Date().toISOString();
  }
  if (status === "returned") {
    patch.return_date = new Date().toISOString().slice(0, 10);
  }

  const { error } = await supabase
    .from("leave_of_absence_requests")
    .update(patch)
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/loa");
  revalidatePath(`/employees/${employeeId}`);
}

export async function updateLoaNotes(id: string, notes: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("leave_of_absence_requests")
    .update({ notes: notes.trim() || null })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/loa");
}
